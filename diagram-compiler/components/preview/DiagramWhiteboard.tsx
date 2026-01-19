import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import './diagram-whiteboard.css';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import { extractMermaidSvgBackgroundColor } from '../../utils/mermaidSvgBackground';
import {
  detectMermaidDiagramTypeHint,
  type MermaidDiagramTypeHint,
} from '../../services/excalidraw/mermaidToExcalidrawService';
import { renderMermaidToExcalidrawElements } from '../../services/excalidraw/mermaidToExcalidrawRenderer';
import { applyContainerTextMap, buildContainerTextMap } from '../../services/excalidraw/excalidrawTextSync';
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { useWhiteboardViewLock, type WhiteboardDebugRuntime } from './useWhiteboardViewLock';
import DiagramWhiteboardCanvas from './DiagramWhiteboardCanvas';
import WhiteboardDebugOverlay, { type WhiteboardFitCalc } from './WhiteboardDebugOverlay';
import {
  buildWhiteboardAppState,
  buildWhiteboardInitialData,
  clampWhiteboardZoom,
  WHITEBOARD_EDITABLE_APPSTATE,
} from './whiteboardAppState';
import {
  applyMermaidThemeToExcalidrawElements,
  CANVAS_BG_DARK,
  CANVAS_BG_LIGHT,
  isDarkColor,
} from '../../services/excalidraw/excalidrawTheme';
import {
  buildSceneMeta,
  hashString,
  injectSceneMetaJson,
  type MermaidLanggraphSceneGenerator,
  type MermaidLanggraphSceneMeta,
  normalizeTheme,
  pickAppStateForSave,
  readSceneMeta,
} from '../../services/excalidraw/whiteboardSceneMeta';
import { buildSceneFromMermaidCode } from '../../services/excalidraw/whiteboardSceneBuilder';
import { tryParseInitialScene } from '../../services/excalidraw/whiteboardSceneParse';

type ExcalidrawElementSkeletonList = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>;
type ExcalidrawElementSkeleton = ExcalidrawElementSkeletonList[number];

type Props = {
  theme: 'light' | 'dark';
  backgroundColor: string | null;
  backgroundMode?: 'mermaid' | 'excalidraw';
  syncKey?: number;
  mermaidCode: string;
  svgMarkup: string;
  initialSceneJson: string | null;
  initialDataOverride?: ExcalidrawInitialDataState | null;
  zoomPercent: number;
  mode?: 'edit' | 'view';
  zoomMode?: 'controlled' | 'auto';
  fitMode?: 'content' | 'width';
  scrollMode?: 'none' | 'vertical';
  onNotebookDiagramClick?: (index: number) => void;
  onZoomPercentChange?: (nextZoomPercent: number) => void;
  onAutosave: (sceneJson: string) => Promise<unknown> | unknown;
  onDirtyChange?: (dirty: boolean) => void;
  onThemeChange?: (nextTheme: 'light' | 'dark') => void;
};

const computeFlowchartStructureSignature = (code: string): string => {
  // Best-effort signature: stable for changes in labels/edge texts.
  // IDs/edges still count as "structure", which matches flowchart converter IDs.
  const normalized = code
    .replace(/^\s*%%.*$/gm, '')
    .replace(/\[[^\]]*]/g, '[]')
    .replace(/\{[^}]*}/g, '{}')
    .replace(/\([^)]*\)/g, '()')
    .replace(/\|[^|]*\|/g, '||')
    .replace(/\s+/g, ' ')
    .trim();
  return String(hashString(normalized));
};

const computeDiagramStructureSignature = (diagramType: MermaidDiagramTypeHint, code: string): string => {
  if (diagramType === 'flowchart') return computeFlowchartStructureSignature(code);

  const stripped = code.replace(/^\s*%%.*$/gm, '').replace(/\s+/g, ' ');

  if (diagramType === 'class') {
    // Remove class body fields/methods and member labels.
    const normalized = stripped
      .replace(/\{[^}]*}/g, '{}')
      .replace(/:\s*[^;]+/g, ':')
      .trim();
    return String(hashString(normalized));
  }

  if (diagramType === 'sequence') {
    // Remove message texts (after :) and aliases (after "as").
    const normalized = stripped
      .replace(/\bas\s+[^ ]+/gi, 'as')
      .replace(/:\s*[^;]+/g, ':')
      .trim();
    return String(hashString(normalized));
  }

  // Fallback: treat any change as structural.
  return String(hashString(stripped.trim()));
};

const countElementTypes = (elements: unknown[] | undefined): Record<string, number> => {
  const list = Array.isArray(elements) ? elements : [];
  return list.reduce<Record<string, number>>((acc, el) => {
    if (!el || typeof el !== 'object') return acc;
    if ((el as { isDeleted?: unknown }).isDeleted === true) return acc;
    const t = (el as { type?: unknown }).type;
    const key = typeof t === 'string' ? t : 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
};


const toSvgDataUrl = (svg: string): DataURL => {
  // Prefer base64 for maximum compatibility with Excalidraw imports.
  try {
    const decoded = unescape(encodeURIComponent(svg));
    const base64 = btoa(decoded);
    return `data:image/svg+xml;base64,${base64}` as DataURL;
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` as DataURL;
  }
};

const parseViewBox = (svg: string) => {
  const match = svg.match(
    /\bviewBox\s*=\s*["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/i
  );
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const width = Number(match[3]);
  const height = Number(match[4]);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

const parseSvgWidthHeight = (svg: string): { width: number; height: number } | null => {
  const widthMatch = svg.match(/\bwidth\s*=\s*["']\s*([0-9.-]+)\s*(px)?\s*["']/i);
  const heightMatch = svg.match(/\bheight\s*=\s*["']\s*([0-9.-]+)\s*(px)?\s*["']/i);
  if (!widthMatch?.[1] || !heightMatch?.[1]) return null;
  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  return { width, height };
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    let done = false;
    const finishResolve = (value: T) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const finishReject = (error: unknown) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const timer = window.setTimeout(() => finishReject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then((value) => {
      window.clearTimeout(timer);
      finishResolve(value);
    }).catch((error) => {
      window.clearTimeout(timer);
      finishReject(error);
    });
  });
};

const defer = (fn: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn).catch(() => {});
};

const parseCssNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
};

const parseSvgStyleAttr = (style: string | null): Record<string, string> => {
  if (!style) return {};
  const out: Record<string, string> = {};
  for (const raw of style.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
};

const getSvgPaint = (el: Element, name: 'fill' | 'stroke'): string | null => {
  const fromAttr = el.getAttribute(name);
  if (fromAttr && fromAttr !== 'none') return fromAttr;
  const style = parseSvgStyleAttr(el.getAttribute('style'));
  const fromStyle = style[name];
  if (fromStyle && fromStyle !== 'none') return fromStyle;
  return null;
};

const getSvgStrokeWidth = (el: Element): number | null => {
  const attr = parseCssNumber(el.getAttribute('stroke-width'));
  if (attr !== null) return attr;
  const style = parseSvgStyleAttr(el.getAttribute('style'));
  const fromStyle = parseCssNumber(style['stroke-width']);
  return fromStyle;
};

const getSvgTextFontSize = (el: Element): number | null => {
  const attr = parseCssNumber(el.getAttribute('font-size'));
  if (attr !== null) return attr;
  const style = parseSvgStyleAttr(el.getAttribute('style'));
  const fromStyle = parseCssNumber(style['font-size']);
  return fromStyle;
};

const parseSvgPathNumbers = (d: string): Array<{ x: number; y: number }> => {
  // Very small heuristic parser: extract all coordinate pairs from the path.
  // For Mermaid ER/graph edges this is typically M/L commands.
  const tokens = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
  if (!tokens || tokens.length < 4) return [];
  const nums = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push({ x: nums[i]!, y: nums[i + 1]! });
  }
  return points;
};

const convertForeignObjectsToText = (svgMarkup: string, opts?: { fill?: string }): string => {
  if (!svgMarkup.includes('foreignObject')) return svgMarkup;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgMarkup;

    const foreignObjects = Array.from(svgEl.querySelectorAll('foreignObject'));
    for (const foreignObject of foreignObjects) {
      const rawText = (foreignObject.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
      if (!rawText) {
        foreignObject.remove();
        continue;
      }

      const x = Number(foreignObject.getAttribute('x') ?? '0');
      const y = Number(foreignObject.getAttribute('y') ?? '0');
      const width = Number(foreignObject.getAttribute('width') ?? '0');
      const height = Number(foreignObject.getAttribute('height') ?? '0');
      const cx = Number.isFinite(x) && Number.isFinite(width) ? x + width / 2 : 0;
      const cy = Number.isFinite(y) && Number.isFinite(height) ? y + height / 2 : 0;

      const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      // Default: keep labels readable on dark fills; Mermaid styles can override via CSS.
      text.setAttribute('fill', opts?.fill ?? '#e7e7e7');
      text.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
      text.setAttribute('font-size', '14');

      // Support simple multi-line labels by emitting tspans.
      const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        text.textContent = rawText;
      } else {
        // Center the block around (cx,cy).
        const lineHeight = 16;
        const startDy = -((lines.length - 1) / 2) * lineHeight;
        for (let i = 0; i < lines.length; i += 1) {
          const tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.textContent = lines[i]!;
          tspan.setAttribute('x', String(cx));
          tspan.setAttribute('dy', String(i === 0 ? startDy : lineHeight));
          text.appendChild(tspan);
        }
      }

      foreignObject.parentNode?.insertBefore(text, foreignObject);
      foreignObject.remove();
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgEl);
  } catch {
    // Fallback: keep the original markup if conversion fails.
    return svgMarkup;
  }
};

const wrapTextToWidth = (text: string, opts: { maxWidth: number; fontSize: number }): string => {
  const raw = text.replace(/\r/g, '').trim();
  if (!raw) return '';
  const { maxWidth, fontSize } = opts;
  if (!(maxWidth > 0) || !(fontSize > 0)) return raw;
  // Excalidraw container text uses a fairly conservative fit-to-width algorithm;
  // keep wrapped lines shorter than a naive monospace estimate to avoid
  // overlapped glyphs when the original token has no spaces (e.g. long Russian words).
  const approxCharWidth = fontSize * 0.75;
  const maxChars = Math.max(5, Math.floor(maxWidth / approxCharWidth));
  if (raw.length <= maxChars) return raw;

  const linesIn = raw.split('\n');
  const out: string[] = [];
  for (const line of linesIn) {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    const splitLongToken = (token: string) => {
      if (token.length <= maxChars) return [token];
      const parts: string[] = [];
      for (let i = 0; i < token.length; i += maxChars) {
        parts.push(token.slice(i, i + maxChars));
      }
      return parts;
    };

    let cur = '';
    for (const word of words) {
      const parts = splitLongToken(word);
      for (const part of parts) {
        if (!cur) {
          cur = part;
          continue;
        }
        const merged = `${cur} ${part}`;
        if (merged.length <= maxChars) {
          cur = merged;
          continue;
        }
        out.push(cur);
        cur = part;
      }
    }
    if (cur) out.push(cur);
  }
  return out.join('\n').trim();
};

const buildSceneFromSvgVectors = async (args: {
  svgMarkup: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
}): Promise<ExcalidrawInitialDataState | null> => {
  const svg = args.svgMarkup.trim();
  if (!svg) return null;

  let container: HTMLDivElement | null = null;
  try {
    container = document.createElement('div');
    container.setAttribute('style', 'opacity:0; position:fixed; left:-10000px; top:0; pointer-events:none;');
    container.innerHTML = svg;
    document.body.appendChild(container);

    const svgEl = container.querySelector('svg');
    if (!svgEl) {
      container.remove();
      return null;
    }

    const viewBox = (() => {
      const vb = (svgEl as unknown as SVGSVGElement).viewBox?.baseVal;
      if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
      const attr = svgEl.getAttribute('viewBox');
      return attr ? parseViewBox(`<svg viewBox="${attr}"></svg>`) : null;
    })() ?? parseViewBox(svg);
    const size =
      parseSvgWidthHeight(svg)
      ?? (viewBox ? { width: viewBox.width, height: viewBox.height } : null)
      ?? { width: 800, height: 600 };
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);

    const svgToLocal = (pt: { x: number; y: number }) => {
      if (!viewBox) return pt;
      return { x: pt.x - viewBox.x, y: pt.y - viewBox.y };
    };

    const getBBoxSafe = (el: Element): { x: number; y: number; width: number; height: number } | null => {
      try {
        const bb = (el as unknown as SVGGraphicsElement).getBBox?.();
        if (!bb) return null;
        if (![bb.x, bb.y, bb.width, bb.height].every((n) => Number.isFinite(n))) return null;
        if (!(bb.width >= 0 && bb.height >= 0)) return null;
        return { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
      } catch {
        return null;
      }
    };

    const applyCtmToBBox = (
      el: Element,
      bb: { x: number; y: number; width: number; height: number }
    ): { x: number; y: number; width: number; height: number } => {
      const m = (el as unknown as SVGGraphicsElement).getCTM?.();
      if (!m) return bb;
      try {
        const points = [
          new DOMPoint(bb.x, bb.y).matrixTransform(m),
          new DOMPoint(bb.x + bb.width, bb.y).matrixTransform(m),
          new DOMPoint(bb.x, bb.y + bb.height).matrixTransform(m),
          new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m),
        ];
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      } catch {
        return bb;
      }
    };

    type NodeCandidate = {
      id: string;
      type: 'rectangle' | 'ellipse' | 'diamond';
      x: number;
      y: number;
      width: number;
      height: number;
      strokeColor: string;
      backgroundColor: string;
      strokeWidth: number;
      label?: { text: string; fontSize: number };
    };
    type EdgeCandidate = {
      id: string;
      x: number;
      y: number;
      points: Array<[number, number]>;
      strokeColor: string;
      strokeWidth: number;
      startArrowhead?: 'arrow' | 'dot' | 'triangle' | null;
      endArrowhead?: 'arrow' | 'dot' | 'triangle' | null;
      label?: { text: string; fontSize: number };
      start?: { id: string };
      end?: { id: string };
    };
    type TextCandidate = {
      text: string;
      x: number;
      y: number;
      fontSize: number;
      strokeColor: string;
      width?: number;
      height?: number;
    };

    const nodes: NodeCandidate[] = [];
    const edges: EdgeCandidate[] = [];
    const texts: TextCandidate[] = [];
    const nodeDedup = new Set<string>();
    let nodeSeq = 0;
    let edgeSeq = 0;

    const seenTextKeys = new Set<string>();
    const shouldSkipText = (args: { text: string; x: number; y: number }) => {
      const key = `${Math.round(args.x)}:${Math.round(args.y)}:${args.text}`;
      if (seenTextKeys.has(key)) return true;
      seenTextKeys.add(key);
      return false;
    };

    const registerNode = (node: Omit<NodeCandidate, 'id'>) => {
      const key = `${node.type}:${Math.round(node.x)}:${Math.round(node.y)}:${Math.round(node.width)}:${Math.round(node.height)}`;
      if (nodeDedup.has(key)) return;
      nodeDedup.add(key);
      nodes.push({ ...node, id: `node-${nodeSeq++}` });
    };

    const hasAncestorClassFragment = (el: Element, fragments: string[]): boolean => {
      let cur: Element | null = el;
      while (cur) {
        const cls = (cur.getAttribute('class') ?? '').toLowerCase();
        if (fragments.some((f) => cls.includes(f))) return true;
        cur = cur.parentElement;
      }
      return false;
    };

    // Rectangles (nodes/containers).
    const rects = Array.from(svgEl.querySelectorAll('rect'));
    for (const rectEl of rects) {
      const bbRaw = getBBoxSafe(rectEl);
      if (!bbRaw) continue;
      const bb = applyCtmToBBox(rectEl, bbRaw);
      const w = bb.width;
      const h = bb.height;
      if (!(w > 6 && h > 6)) continue;
      // Skip background-size rects.
      if (w >= width * 0.95 && h >= height * 0.95) continue;

      const p = svgToLocal({ x: bb.x, y: bb.y });
      const stroke = getSvgPaint(rectEl, 'stroke') ?? '#1f2937';
      const fill = getSvgPaint(rectEl, 'fill') ?? 'transparent';
      const strokeWidth = getSvgStrokeWidth(rectEl) ?? 1;

      registerNode({
        type: 'rectangle',
        x: p.x,
        y: p.y,
        width: w,
        height: h,
        strokeColor: stroke,
        backgroundColor: fill === 'transparent' ? 'transparent' : fill,
        strokeWidth,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // Ellipses (rounded nodes).
    const ellipses = Array.from(svgEl.querySelectorAll('ellipse'));
    for (const ellipseEl of ellipses) {
      const bbRaw = getBBoxSafe(ellipseEl);
      if (!bbRaw) continue;
      const bb = applyCtmToBBox(ellipseEl, bbRaw);
      const w = bb.width;
      const h = bb.height;
      if (!(w > 6 && h > 6)) continue;
      if (w >= width * 0.95 && h >= height * 0.95) continue;
      const p = svgToLocal({ x: bb.x, y: bb.y });
      const stroke = getSvgPaint(ellipseEl, 'stroke') ?? '#1f2937';
      const fill = getSvgPaint(ellipseEl, 'fill') ?? 'transparent';
      const strokeWidth = getSvgStrokeWidth(ellipseEl) ?? 1;
      registerNode({
        type: 'ellipse',
        x: p.x,
        y: p.y,
        width: w,
        height: h,
        strokeColor: stroke,
        backgroundColor: fill === 'transparent' ? 'transparent' : fill,
        strokeWidth,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // Polygons (diamond/decision nodes).
    const polygons = Array.from(svgEl.querySelectorAll('polygon'));
    for (const polyEl of polygons) {
      if (!hasAncestorClassFragment(polyEl, ['node', 'vertex'])) continue;
      const bbRaw = getBBoxSafe(polyEl);
      if (!bbRaw) continue;
      const bb = applyCtmToBBox(polyEl, bbRaw);
      const w = bb.width;
      const h = bb.height;
      if (!(w > 6 && h > 6)) continue;
      if (w >= width * 0.95 && h >= height * 0.95) continue;
      const p = svgToLocal({ x: bb.x, y: bb.y });
      const stroke = getSvgPaint(polyEl, 'stroke') ?? '#1f2937';
      const fill = getSvgPaint(polyEl, 'fill') ?? 'transparent';
      const strokeWidth = getSvgStrokeWidth(polyEl) ?? 1;
      registerNode({
        type: 'diamond',
        x: p.x,
        y: p.y,
        width: w,
        height: h,
        strokeColor: stroke,
        backgroundColor: fill === 'transparent' ? 'transparent' : fill,
        strokeWidth,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // foreignObject labels (common in Mermaid v11 flowchart-v2).
    const foreignObjects = Array.from(svgEl.querySelectorAll('foreignObject'));
    for (const foreignObjectEl of foreignObjects) {
      const html = (foreignObjectEl as unknown as { innerHTML?: unknown }).innerHTML;
      const content = (() => {
        if (typeof html === 'string' && html.trim()) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          return (tmp.innerText || tmp.textContent || '').trim();
        }
        return (foreignObjectEl.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
      })();
      if (!content) continue;
      const bbRaw = getBBoxSafe(foreignObjectEl) ?? (() => {
        const x = parseCssNumber(foreignObjectEl.getAttribute('x')) ?? 0;
        const y = parseCssNumber(foreignObjectEl.getAttribute('y')) ?? 0;
        const w = parseCssNumber(foreignObjectEl.getAttribute('width')) ?? 0;
        const h = parseCssNumber(foreignObjectEl.getAttribute('height')) ?? 0;
        return w > 0 && h > 0 ? ({ x, y, width: w, height: h } as const) : null;
      })();
      if (!bbRaw) continue;
      const bb = applyCtmToBBox(foreignObjectEl, bbRaw);
      const p = svgToLocal({ x: bb.x, y: bb.y });
      const fontSize = 16;
      const wrapped = wrapTextToWidth(content, { maxWidth: bb.width, fontSize });
      if (shouldSkipText({ text: wrapped, x: p.x, y: p.y })) continue;
      texts.push({
        text: wrapped,
        x: p.x,
        y: p.y,
        fontSize,
        strokeColor: args.theme === 'dark' ? '#e5e7eb' : '#111827',
        width: bb.width,
        height: bb.height,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // Text labels.
    const textNodes = Array.from(svgEl.querySelectorAll('text'));
    for (const textEl of textNodes) {
      const content = (textEl.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!content) continue;
      const fontSize = getSvgTextFontSize(textEl) ?? 16;
      const stroke = getSvgPaint(textEl, 'fill') ?? '#111827';

      const bb = (() => {
        const bbRaw = getBBoxSafe(textEl);
        if (!bbRaw) return null;
        return applyCtmToBBox(textEl, bbRaw);
      })();
      const p = (() => {
        if (bb) return svgToLocal({ x: bb.x, y: bb.y });
        const x = parseCssNumber(textEl.getAttribute('x')) ?? 0;
        const y = parseCssNumber(textEl.getAttribute('y')) ?? 0;
        const m = (textEl as unknown as SVGGraphicsElement).getCTM?.();
        const svgPt = m ? new DOMPoint(x, y).matrixTransform(m) : new DOMPoint(x, y);
        const local = svgToLocal({ x: svgPt.x, y: svgPt.y });
        const anchor = (textEl.getAttribute('text-anchor') ?? '').toLowerCase();
        const approxWidth = Math.max(1, content.length) * fontSize * 0.55;
        const anchorShift = anchor === 'middle' ? approxWidth / 2 : anchor === 'end' ? approxWidth : 0;
        return { x: local.x - anchorShift, y: local.y - fontSize };
      })();
      const wrapped = bb ? wrapTextToWidth(content, { maxWidth: bb.width, fontSize }) : content;
      if (shouldSkipText({ text: wrapped, x: p.x, y: p.y })) continue;

      texts.push({
        text: wrapped,
        x: p.x,
        y: p.y,
        fontSize,
        strokeColor: stroke,
        width: bb?.width,
        height: bb?.height,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // Lines (edges/relations). Prefer paths with stroke and no fill.
    const paths = Array.from(svgEl.querySelectorAll('path'));
    for (const pathEl of paths) {
      const d = pathEl.getAttribute('d') ?? '';
      if (!d.trim()) continue;
      const isEdgeLike = hasAncestorClassFragment(pathEl, ['edge', 'relation', 'message', 'arrow', 'line', 'link']);
      const isArrowHead = hasAncestorClassFragment(pathEl, ['arrowhead', 'marker', 'head']);
      if (!isEdgeLike || isArrowHead) continue;

      const stroke = getSvgPaint(pathEl, 'stroke') ?? (args.theme === 'dark' ? '#94a3b8' : '#334155');
      const fill = getSvgPaint(pathEl, 'fill');
      if (fill && fill !== 'none' && fill !== 'transparent') continue;

      const points = parseSvgPathNumbers(d);
      if (points.length < 2) continue;

      const m = (pathEl as unknown as SVGGraphicsElement).getCTM?.();
      const toLocal = (pt: { x: number; y: number }) => {
        if (m) {
          const sp = new DOMPoint(pt.x, pt.y).matrixTransform(m);
          return svgToLocal({ x: sp.x, y: sp.y });
        }
        // Fall back to raw path coordinates (often already in SVG space).
        return svgToLocal(pt);
      };
      const localPoints = points.map(toLocal);
      // Collapse to at most 20 points to keep the scene light.
      const step = Math.max(1, Math.floor(localPoints.length / 20));
      const collapsed = localPoints.filter((_, idx) => idx % step === 0);
      const start = collapsed[0]!;
      const rest = collapsed.slice(1);
      if (!rest.length) continue;

      edges.push({
        id: `edge-${edgeSeq++}`,
        x: start.x,
        y: start.y,
        points: [[0, 0], ...rest.map((p): [number, number] => [p.x - start.x, p.y - start.y])],
        strokeColor: stroke,
        strokeWidth: getSvgStrokeWidth(pathEl) ?? 1,
        startArrowhead: pathEl.getAttribute('marker-start') ? 'arrow' : null,
        endArrowhead: pathEl.getAttribute('marker-end') ? 'arrow' : null,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    // Simple <line> edges.
    const lines = Array.from(svgEl.querySelectorAll('line'));
    for (const lineEl of lines) {
      const stroke = getSvgPaint(lineEl, 'stroke');
      if (!stroke) continue;
      const x1 = parseCssNumber(lineEl.getAttribute('x1')) ?? 0;
      const y1 = parseCssNumber(lineEl.getAttribute('y1')) ?? 0;
      const x2 = parseCssNumber(lineEl.getAttribute('x2')) ?? 0;
      const y2 = parseCssNumber(lineEl.getAttribute('y2')) ?? 0;
      const m = (lineEl as unknown as SVGGraphicsElement).getCTM?.();
      const p1Svg = m ? new DOMPoint(x1, y1).matrixTransform(m) : new DOMPoint(x1, y1);
      const p2Svg = m ? new DOMPoint(x2, y2).matrixTransform(m) : new DOMPoint(x2, y2);
      const p1 = svgToLocal({ x: p1Svg.x, y: p1Svg.y });
      const p2 = svgToLocal({ x: p2Svg.x, y: p2Svg.y });
      edges.push({
        id: `edge-${edgeSeq++}`,
        x: p1.x,
        y: p1.y,
        points: [[0, 0], [p2.x - p1.x, p2.y - p1.y]],
        strokeColor: stroke,
        strokeWidth: getSvgStrokeWidth(lineEl) ?? 1,
        startArrowhead: lineEl.getAttribute('marker-start') ? 'arrow' : null,
        endArrowhead: lineEl.getAttribute('marker-end') ? 'arrow' : null,
      });
      if (nodes.length + edges.length + texts.length > 2000) break;
    }

    if (nodes.length + edges.length + texts.length < 2) return null;

    const distancePointToRect = (pt: { x: number; y: number }, node: NodeCandidate) => {
      const dx = Math.max(node.x - pt.x, 0, pt.x - (node.x + node.width));
      const dy = Math.max(node.y - pt.y, 0, pt.y - (node.y + node.height));
      return Math.hypot(dx, dy);
    };

    const findNearestNode = (pt: { x: number; y: number }, maxDistance: number) => {
      let best: { node: NodeCandidate; dist: number } | null = null;
      for (const node of nodes) {
        const dist = distancePointToRect(pt, node);
        if (!best || dist < best.dist) best = { node, dist };
      }
      if (!best || best.dist > maxDistance) return null;
      return best.node;
    };

    const distancePointToSegment = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const x = a.x + clamped * dx;
      const y = a.y + clamped * dy;
      return Math.hypot(p.x - x, p.y - y);
    };

    const distancePointToPolyline = (p: { x: number; y: number }, points: Array<[number, number]>, origin: { x: number; y: number }) => {
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i + 1 < points.length; i += 1) {
        const a = { x: origin.x + points[i]![0], y: origin.y + points[i]![1] };
        const b = { x: origin.x + points[i + 1]![0], y: origin.y + points[i + 1]![1] };
        best = Math.min(best, distancePointToSegment(p, a, b));
      }
      return best;
    };

    const assignedTexts = new Set<TextCandidate>();

    for (const text of texts) {
      const cx = text.x + (text.width ?? 0) / 2;
      const cy = text.y + (text.height ?? text.fontSize) / 2;
      const containing = nodes
        .filter((node) => cx >= node.x && cx <= node.x + node.width && cy >= node.y && cy <= node.y + node.height)
        .sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
      if (containing && !containing.label) {
        containing.label = { text: text.text, fontSize: text.fontSize };
        assignedTexts.add(text);
      }
    }

    for (const text of texts) {
      if (assignedTexts.has(text)) continue;
      const cx = text.x + (text.width ?? 0) / 2;
      const cy = text.y + (text.height ?? text.fontSize) / 2;
      const pt = { x: cx, y: cy };
      let best: { edge: EdgeCandidate; dist: number } | null = null;
      for (const edge of edges) {
        const dist = distancePointToPolyline(pt, edge.points, { x: edge.x, y: edge.y });
        if (!best || dist < best.dist) best = { edge, dist };
      }
      if (best && best.dist < 24 && !best.edge.label) {
        best.edge.label = { text: text.text, fontSize: text.fontSize };
        assignedTexts.add(text);
      }
    }

    for (const edge of edges) {
      const start = edge.points[0] ? { x: edge.x + edge.points[0][0], y: edge.y + edge.points[0][1] } : { x: edge.x, y: edge.y };
      const endOffset = edge.points[edge.points.length - 1] ?? [0, 0];
      const end = { x: edge.x + endOffset[0], y: edge.y + endOffset[1] };
      const startNode = findNearestNode(start, 48);
      const endNode = findNearestNode(end, 48);
      if (startNode) edge.start = { id: startNode.id };
      if (endNode) edge.end = { id: endNode.id };
    }

    const elementsSkeleton: Array<Record<string, unknown>> = [];
    for (const node of nodes) {
      elementsSkeleton.push({
        type: node.type,
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        strokeColor: node.strokeColor,
        backgroundColor: node.backgroundColor,
        strokeWidth: node.strokeWidth,
        ...(node.label ? { label: node.label } : {}),
      });
    }
    for (const edge of edges) {
      elementsSkeleton.push({
        type: 'arrow',
        id: edge.id,
        x: edge.x,
        y: edge.y,
        points: edge.points,
        strokeColor: edge.strokeColor,
        strokeWidth: edge.strokeWidth,
        startArrowhead: edge.startArrowhead ?? null,
        endArrowhead: edge.endArrowhead ?? null,
        ...(edge.start ? { start: edge.start } : {}),
        ...(edge.end ? { end: edge.end } : {}),
        ...(edge.label ? { label: edge.label } : {}),
      });
    }
    for (const text of texts) {
      if (assignedTexts.has(text)) continue;
      elementsSkeleton.push({
        type: 'text',
        text: text.text,
        x: text.x,
        y: text.y,
        fontSize: text.fontSize,
        strokeColor: text.strokeColor,
      });
    }

    const skeleton = elementsSkeleton as unknown as Parameters<typeof convertToExcalidrawElements>[0];
    const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false }).map((el) => ({ ...el, locked: false }));

    return {
      type: 'excalidraw',
      version: 2,
      source: 'mermaid-langgraph',
      elements,
      files: {},
      scrollToContent: true,
      appState: {
        theme: normalizeTheme(args.theme),
        viewBackgroundColor: args.backgroundColor ?? undefined,
      } as Partial<AppState>,
    };
  } catch {
    return null;
  } finally {
    container?.remove();
  }
};

const buildSceneFromSvgMarkup = async (args: {
  svgMarkup: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
}): Promise<ExcalidrawInitialDataState | null> => {
  const svg = args.svgMarkup.trim();
  if (!svg) return null;

  const size =
    parseSvgWidthHeight(svg)
    ?? (() => {
      const vb = parseViewBox(svg);
      return vb ? { width: vb.width, height: vb.height } : null;
    })()
    ?? { width: 800, height: 600 };
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);

  // Excalidraw renders images onto a canvas. Mermaid SVGs often include
  // <foreignObject> labels which are unreliable/non-renderable on a canvas,
  // resulting in a blank image. Convert to plain <text> so SVG stays visible
  // without needing to rasterize to PNG.
  const svgForImage = svg.includes('foreignObject') ? convertForeignObjectsToText(svg) : svg;

  const fileId = `mermaid-svg-${Date.now()}` as BinaryFileData['id'];
  const file: BinaryFileData = {
    mimeType: 'image/svg+xml',
    id: fileId,
    dataURL: toSvgDataUrl(svgForImage),
    created: Date.now(),
  };
  const files: BinaryFiles = {
    [fileId]: file,
  };
  const elements = [
    ...convertToExcalidrawElements([{
      type: 'image',
      fileId,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      // Fallback scenes (non-flowchart diagrams or parse failures) are imported
      // as an image. Keep it selectable/movable so users can draw on top and at
      // least manipulate the snapshot.
      locked: false,
    }], { regenerateIds: false }),
  ];


  return {
    type: 'excalidraw',
    version: 2,
    source: 'mermaid-langgraph',
    elements,
    files,
    scrollToContent: true,
    appState: {
      theme: normalizeTheme(args.theme),
      viewBackgroundColor: args.backgroundColor ?? undefined,
    } as Partial<AppState>,
  };
};

const AUTOSAVE_DEBOUNCE_MS = 1200;

const DiagramWhiteboard: React.FC<Props> = ({
  theme,
  backgroundColor,
  backgroundMode: backgroundModeProp,
  syncKey,
  mermaidCode,
  svgMarkup,
  initialSceneJson,
  initialDataOverride,
  zoomPercent,
  mode = 'edit',
  zoomMode = 'controlled',
  fitMode = 'content',
  scrollMode = 'none',
  onNotebookDiagramClick,
  onZoomPercentChange,
  onAutosave,
  onDirtyChange,
  onThemeChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isViewMode = mode === 'view';
  const isAutoZoom = zoomMode === 'auto';
  const backgroundMode = backgroundModeProp ?? 'mermaid';
  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).has('wbDebug');
    } catch {
      return false;
    }
  }, []);

  const diagramTypeHint = useMemo(() => detectMermaidDiagramTypeHint(mermaidCode), [mermaidCode]);
  const sceneMeta = useMemo(() => buildSceneMeta({ mermaidCode, svgMarkup }), [mermaidCode, svgMarkup]);

  const mermaidBackgroundCandidate = useMemo(() => {
    const fromProp = backgroundColor?.trim() ?? '';
    if (fromProp) return fromProp;
    const vars = extractFrontmatterThemeVariables(mermaidCode);
    const fromVars = typeof vars?.background === 'string' ? vars.background.trim() : '';
    if (fromVars && fromVars !== 'transparent' && fromVars !== 'none') return fromVars;
    const fromSvg = extractMermaidSvgBackgroundColor(svgMarkup);
    if (fromSvg) return fromSvg;
    // Fallback to the app background (so Excalidraw doesn't default to white on dark UI).
    try {
      return window.getComputedStyle(document.body).backgroundColor || null;
    } catch {
      return null;
    }
  }, [backgroundColor, mermaidCode, svgMarkup]);

  const effectiveBackgroundColor = useMemo(() => {
    if (backgroundMode === 'excalidraw') return null;
    return mermaidBackgroundCandidate;
  }, [backgroundMode, mermaidBackgroundCandidate]);

  const lastSavedJsonRef = useRef<string>(initialSceneJson ?? '');
  const pendingSaveRef = useRef<number | null>(null);
  const latestJsonRef = useRef<string>(initialSceneJson ?? '');
  const latestFilesRef = useRef<BinaryFiles>({});
  const lastZoomPercentRef = useRef<number>(zoomPercent);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const hasHadContentRef = useRef(false);
  const isDirtyRef = useRef(false);
  const skipNextChangeRef = useRef(0);
  const lastMermaidCodeRef = useRef<string>(mermaidCode);
  const lastStructureSigRef = useRef<string>(computeDiagramStructureSignature(diagramTypeHint, mermaidCode));
  const lastRethemeSignatureRef = useRef<string>('');
  const [sceneKey, setSceneKey] = useState(0);
  const [initialDataState, setInitialDataState] = useState<ExcalidrawInitialDataState | null>(null);
  const [isSceneBuilding, setIsSceneBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [lastGenerator, setLastGenerator] = useState<MermaidLanggraphSceneGenerator>('unknown');
  const [lastMermaidToExcalidrawError, setLastMermaidToExcalidrawError] = useState<string | null>(null);
  const [canvasBackground, setCanvasBackground] = useState<string | null>(null);
  const lastCanvasBackgroundRef = useRef<string | null>(null);
  const hasUserCanvasBackgroundRef = useRef(false);
  const lastBuiltSignatureRef = useRef<string>('');
  const inFlightSignatureRef = useRef<string>('');
  const buildRunIdRef = useRef(0);
  const sceneMetaForSaveRef = useRef<MermaidLanggraphSceneMeta>(sceneMeta);
  const lastSerializedSignatureRef = useRef<string>('');
  const [debugRuntime, setDebugRuntime] = useState<WhiteboardDebugRuntime | null>(null);
  const lastAppliedSceneKeyRef = useRef<number | null>(null);
  const lastSyncKeyRef = useRef<number | null>(typeof syncKey === 'number' ? syncKey : null);
  const normalizedColorsSceneKeyRef = useRef<number | null>(null);
  const canvasBackgroundForTheme = useMemo(() => {
    // Excalidraw does not auto-adjust canvas background based on theme, so we provide defaults.
    return normalizeTheme(theme) === 'dark' ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
  }, [theme]);

  const VIEW_MODE_APPSTATE_PATCH = useMemo(() => {
    if (!isViewMode) return null;
    return {
      openSidebar: null,
      openMenu: null,
      openDialog: null,
      openPopup: null,
      defaultSidebarDockedPreference: false,
    } as Partial<AppState>;
  }, [isViewMode]);

  const {
    lockedScrollXRef,
    pendingFitSceneKeyRef,
    lastFitCalcRef,
    scheduleFitToContent,
    scheduleClampScroll,
    handleWheel,
    handleScrollChange,
  } = useWhiteboardViewLock({
    apiRef,
    containerRef,
    sceneKey,
    isViewMode,
    isAutoZoom,
    fitMode: fitMode as 'content' | 'width',
    scrollMode: scrollMode as 'none' | 'vertical',
    viewModeAppStatePatch: VIEW_MODE_APPSTATE_PATCH,
    editableAppState: WHITEBOARD_EDITABLE_APPSTATE,
    debugEnabled,
    clampZoom: clampWhiteboardZoom,
    setDebugRuntime,
  });

  const prepareInitialData = useCallback((scene: ExcalidrawInitialDataState): ExcalidrawInitialDataState => {
    const sceneAppState = (scene.appState ?? {}) as Partial<AppState>;
    const themeVars = backgroundMode === 'excalidraw' ? null : extractFrontmatterThemeVariables(mermaidCode);
    const contrastBackground =
      backgroundMode === 'excalidraw'
        ? (canvasBackground ?? mermaidBackgroundCandidate ?? canvasBackgroundForTheme)
        : (effectiveBackgroundColor ?? null);
    const themedElements = applyMermaidThemeToExcalidrawElements((scene.elements ?? []) as unknown[], {
      backgroundColor: contrastBackground,
      themeVariables: themeVars,
      uiTheme: theme,
      forceTheme: backgroundMode === 'excalidraw',
    }) as unknown as ExcalidrawInitialDataState['elements'];
    const targetZoom = clampWhiteboardZoom(zoomPercent / 100);
    const nextBackground = (() => {
      if (backgroundMode === 'excalidraw') {
        const fromUser = canvasBackground?.trim() ?? '';
        if (fromUser) return fromUser;
        const fromScene = typeof sceneAppState.viewBackgroundColor === 'string' ? sceneAppState.viewBackgroundColor.trim() : '';
        if (fromScene) return fromScene;
        return mermaidBackgroundCandidate ?? canvasBackgroundForTheme;
      }
      return effectiveBackgroundColor ?? sceneAppState.viewBackgroundColor ?? undefined;
    })();
    return {
      ...scene,
      elements: themedElements,
      appState: buildWhiteboardAppState({
        sceneAppState,
        uiTheme: normalizeTheme(theme),
        viewMode: isViewMode,
        backgroundColor: nextBackground,
        zoomPercent: targetZoom * 100,
        viewModePatch: VIEW_MODE_APPSTATE_PATCH,
      }),
    };
  }, [VIEW_MODE_APPSTATE_PATCH, backgroundMode, canvasBackground, canvasBackgroundForTheme, effectiveBackgroundColor, isViewMode, mermaidBackgroundCandidate, mermaidCode, theme, zoomPercent]);

  const handlePointerUp = useCallback((_: AppState['activeTool'], pointerDownState: any) => {
    if (!isViewMode) return;
    if (!onNotebookDiagramClick) return;
    if (!pointerDownState || pointerDownState.drag?.hasOccurred) return;
    const hit = pointerDownState.hit?.element as unknown as ExcalidrawElement | null;
    if (!hit) return;
    const customData = (hit as any).customData as Record<string, unknown> | undefined;
    const index = customData && typeof customData.__mlgNotebookIndex === 'number' ? customData.__mlgNotebookIndex : null;
    if (typeof index === 'number') onNotebookDiagramClick(index);
  }, [isViewMode, onNotebookDiagramClick]);

  useEffect(() => {
    if (typeof syncKey !== 'number') return;
    if (lastSyncKeyRef.current === syncKey) return;
    lastSyncKeyRef.current = syncKey;
    if (isDirtyRef.current) return;

    lastBuiltSignatureRef.current = '';
    inFlightSignatureRef.current = '';
    buildRunIdRef.current += 1;
    setInitialDataState(null);
    setBuildError(null);
    setIsSceneBuilding(false);
  }, [syncKey]);

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    onDirtyChange?.(false);
    isDirtyRef.current = false;
    const parsed = tryParseInitialScene(initialSceneJson);
    hasHadContentRef.current = Boolean(parsed?.elements && Array.isArray(parsed.elements) && parsed.elements.length > 0);
    if (initialSceneJson === null && !isDirtyRef.current) {
      lastBuiltSignatureRef.current = '';
      inFlightSignatureRef.current = '';
      setInitialDataState(null);
    }
  }, [initialSceneJson, onDirtyChange]);

  useEffect(() => {
    if (!api) return;
    if (!initialDataState) return;
    if (isDirtyRef.current) return;
    if (lastAppliedSceneKeyRef.current === sceneKey) return;

    const nextElements = (initialDataState.elements ?? []) as unknown[];
    const nextAppState = (initialDataState.appState ?? null) as Partial<AppState> | null;
    const nextFiles = (initialDataState.files ?? {}) as BinaryFiles;

    const contrastBackground = (() => {
      if (backgroundMode === 'excalidraw') {
        const fromScene = typeof nextAppState?.viewBackgroundColor === 'string' ? nextAppState.viewBackgroundColor.trim() : '';
        return fromScene || mermaidBackgroundCandidate || (canvasBackgroundForTheme ?? null);
      }
      return effectiveBackgroundColor ?? null;
    })();
    const themeVars = backgroundMode === 'excalidraw' ? null : extractFrontmatterThemeVariables(mermaidCode);
    const themedElements = applyMermaidThemeToExcalidrawElements(nextElements, {
      backgroundColor: contrastBackground,
      themeVariables: themeVars,
      uiTheme: theme,
      forceTheme: backgroundMode === 'excalidraw',
    }) as unknown as ExcalidrawInitialDataState['elements'];

    skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
    api.updateScene({
      elements: themedElements as any,
      appState: nextAppState as any,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    try {
      api.history?.clear?.();
    } catch {
      // ignore
    }
    try {
      const fileList = Object.values(nextFiles ?? {});
      if (fileList.length) api.addFiles(fileList as any);
    } catch {
      // ignore
    }
    lastAppliedSceneKeyRef.current = sceneKey;
  }, [api, backgroundMode, canvasBackgroundForTheme, effectiveBackgroundColor, initialDataState, mermaidBackgroundCandidate, mermaidCode, sceneKey, theme]);

  useEffect(() => {
    if (!api) return;
    const nextTheme = normalizeTheme(theme);
    const signature = `${nextTheme}:${backgroundMode}:${canvasBackground ?? ''}:${effectiveBackgroundColor ?? ''}:${sceneKey}:${mermaidCode.trim()}`;
    if (signature === lastRethemeSignatureRef.current) return;
    const elements = api.getSceneElements();
    if (!elements.length) return;

    const themeVars = (() => {
      if (backgroundMode === 'excalidraw') return null;
      const rawThemeVars = extractFrontmatterThemeVariables(mermaidCode);
      const vars = rawThemeVars ? { ...rawThemeVars } : null;
      if (vars && 'background' in vars) {
        delete (vars as Record<string, unknown>).background;
      }
      if (vars) vars.darkMode = nextTheme === 'dark';
      return vars;
    })();
    const contrastBackground =
      backgroundMode === 'excalidraw'
        ? (canvasBackground ?? mermaidBackgroundCandidate ?? canvasBackgroundForTheme)
        : null;
    const themedElements = applyMermaidThemeToExcalidrawElements(elements as unknown[], {
      backgroundColor: contrastBackground,
      themeVariables: themeVars,
      uiTheme: nextTheme,
      forceTheme: true,
    }) as unknown as ExcalidrawInitialDataState['elements'];
    skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
    api.updateScene({
      elements: themedElements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    lastRethemeSignatureRef.current = signature;
  }, [api, backgroundMode, canvasBackground, canvasBackgroundForTheme, effectiveBackgroundColor, isViewMode, mermaidBackgroundCandidate, mermaidCode, sceneKey, theme]);

  useEffect(() => {
    if (!initialDataOverride) return;
    defer(() => {
      lockedScrollXRef.current = null;
      setIsSceneBuilding(false);
      setBuildError(null);
      skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
      setInitialDataState(prepareInitialData(initialDataOverride));
      setSceneKey((k) => {
        const next = k + 1;
        pendingFitSceneKeyRef.current = next;
        return next;
      });
    });
  }, [initialDataOverride, prepareInitialData]);

  useEffect(() => {
    return () => {
      if (pendingSaveRef.current) {
        window.clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
      const latest = latestJsonRef.current;
      if (latest && latest !== lastSavedJsonRef.current) {
        onAutosave(latest);
      }
    };
  }, [onAutosave]);

  useEffect(() => {
    if (initialDataOverride) return;
    if (!svgMarkup.trim()) return;
    if (initialDataState) return;
    if (isDirtyRef.current) return;

    const parsed = tryParseInitialScene(initialSceneJson);
    if (parsed) {
      const record = parsed as unknown as Record<string, unknown>;
      const meta = readSceneMeta(record);
      // Migration: older stored scenes didn’t include our metadata and often
      // came from image-only or incomplete imports. Prefer regenerating from
      // the current Mermaid source so the scene is editable.
      if (!meta) {
        // ignore saved scene
      } else
      // If this saved scene was created from a different diagram type, it likely
      // belongs to a different Mermaid block. Regenerate from current Mermaid.
      if (meta?.diagramType && meta.diagramType !== 'unknown' && diagramTypeHint !== 'unknown' && meta.diagramType !== diagramTypeHint) {
        // ignore saved scene
      } else if (meta.mermaidHash !== sceneMeta.mermaidHash) {
        // ignore saved scene from a different Mermaid source
      } else if (meta.generator === 'svg-image' && (diagramTypeHint === 'flowchart' || diagramTypeHint === 'sequence')) {
        // Migration: image snapshots are not editable. Prefer regenerating
        // semantic/vector elements when we can.
      } else {
      defer(() => {
        skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
        setInitialDataState(prepareInitialData(parsed));
        sceneMetaForSaveRef.current = meta;
        setLastGenerator(meta.generator ?? 'unknown');
        setBuildError(null);
        setSceneKey((k) => {
          const next = k + 1;
          pendingFitSceneKeyRef.current = next;
          return next;
        });
      });
      return;
      }
    }

    const buildBackground =
      backgroundMode === 'excalidraw'
        ? mermaidBackgroundCandidate
        : effectiveBackgroundColor;
    const signature = `${sceneMeta.mermaidHash}:${normalizeTheme(theme)}:${buildBackground ?? ''}`;
    if (signature === lastBuiltSignatureRef.current) return;
    if (signature === inFlightSignatureRef.current) return;
    inFlightSignatureRef.current = signature;
    buildRunIdRef.current += 1;
    const buildId = buildRunIdRef.current;

    let cancelled = false;
    defer(() => {
      setIsSceneBuilding(true);
      setBuildError(null);
    });
    void buildSceneFromMermaidCode({
      mermaidCode,
      svgMarkup,
      theme,
      backgroundColor: buildBackground ?? null,
      debug: debugEnabled,
      buildSceneFromSvgVectors,
      buildSceneFromSvgMarkup,
    }).then((result) => {
      if (cancelled) return;
      if (buildId !== buildRunIdRef.current) return;
      setIsSceneBuilding(false);
      inFlightSignatureRef.current = '';
      if (!result) {
        setBuildError('buildSceneFromMermaidCode returned null');
        return;
      }
      skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
      setInitialDataState(prepareInitialData(result.scene));
      sceneMetaForSaveRef.current = { ...sceneMeta, generator: result.generator };
      setLastGenerator(result.generator);
      setLastMermaidToExcalidrawError(result.mermaidToExcalidrawError ?? null);
      setBuildError(null);
      lastBuiltSignatureRef.current = signature;
      latestFilesRef.current = (result.scene.files ?? {}) as BinaryFiles;
      setSceneKey((k) => {
        const next = k + 1;
        pendingFitSceneKeyRef.current = next;
        return next;
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (buildId !== buildRunIdRef.current) return;
      setIsSceneBuilding(false);
      inFlightSignatureRef.current = '';
      const message = error instanceof Error ? error.message : String(error);
      setBuildError(message);
    });

    return () => {
      cancelled = true;
      if (inFlightSignatureRef.current === signature) {
        inFlightSignatureRef.current = '';
      }
    };
  }, [
    backgroundMode,
    diagramTypeHint,
    effectiveBackgroundColor,
    initialDataOverride,
    initialDataState,
    initialSceneJson,
    mermaidCode,
    mermaidBackgroundCandidate,
    prepareInitialData,
    sceneMeta,
    svgMarkup,
    theme,
  ]);

  const debugOverlay = useMemo(() => {
    if (!debugEnabled) return null;
    const status: 'idle' | 'building' | 'ready' | 'failed' =
      isSceneBuilding ? 'building' : buildError ? 'failed' : initialDataState ? 'ready' : 'idle';
    const counts = initialDataState?.elements ? countElementTypes(initialDataState.elements as unknown[]) : null;
    const bounds = (() => {
      const list = (initialDataState?.elements ?? []) as unknown[];
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let seen = 0;
      for (const el of list) {
        if (!el || typeof el !== 'object') continue;
        const rec = el as Record<string, unknown>;
        if (rec.isDeleted === true) continue;
        const x = typeof rec.x === 'number' ? rec.x : null;
        const y = typeof rec.y === 'number' ? rec.y : null;
        const w = typeof rec.width === 'number' ? rec.width : null;
        const h = typeof rec.height === 'number' ? rec.height : null;
        if (x === null || y === null || w === null || h === null) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
        seen += 1;
      }
      if (seen === 0) return null;
      return {
        minX: Math.round(minX),
        minY: Math.round(minY),
        maxX: Math.round(maxX),
        maxY: Math.round(maxY),
        w: Math.round(maxX - minX),
        h: Math.round(maxY - minY),
        seen,
      };
    })();
    const sampleRect = (() => {
      const list = (initialDataState?.elements ?? []) as unknown[];
      for (const el of list) {
        if (!el || typeof el !== 'object') continue;
        const rec = el as Record<string, unknown>;
        if (rec.isDeleted === true) continue;
        if (rec.type !== 'rectangle') continue;
        const x = typeof rec.x === 'number' ? rec.x : null;
        const y = typeof rec.y === 'number' ? rec.y : null;
        const width = typeof rec.width === 'number' ? rec.width : null;
        const height = typeof rec.height === 'number' ? rec.height : null;
        const strokeColor = typeof rec.strokeColor === 'string' ? rec.strokeColor : null;
        const backgroundColor = typeof rec.backgroundColor === 'string' ? rec.backgroundColor : null;
        return { x, y, width, height, strokeColor, backgroundColor };
      }
      return null;
    })();
    const sampleText = (() => {
      const list = (initialDataState?.elements ?? []) as unknown[];
      let best: { rec: Record<string, unknown>; score: number } | null = null;
      for (const el of list) {
        if (!el || typeof el !== 'object') continue;
        const rec = el as Record<string, unknown>;
        if (rec.isDeleted === true) continue;
        if (rec.type !== 'text') continue;
        const text = typeof rec.text === 'string' ? rec.text : '';
        const score = (text.includes('\n') ? 1000 : 0) + text.length;
        if (!best || score > best.score) best = { rec, score };
      }
      if (!best) return null;
      const rec = best.rec;
      const text = typeof rec.text === 'string' ? rec.text : '';
      const width = typeof rec.width === 'number' ? rec.width : null;
      const height = typeof rec.height === 'number' ? rec.height : null;
      const fontSize = typeof rec.fontSize === 'number' ? rec.fontSize : null;
      const lineHeight = typeof rec.lineHeight === 'number' ? rec.lineHeight : null;
      return {
        fontSize,
        lineHeight,
        width,
        height,
        textPreview: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      };
    })();
    return {
      status,
      error: buildError,
      generator: lastGenerator,
      mermaidToExcalidrawError: lastMermaidToExcalidrawError,
      builtCounts: counts,
      bounds,
      sampleRect,
      sampleText,
      diagramTypeHint,
      svgChars: svgMarkup.trim() ? svgMarkup.length : 0,
      sceneKey,
      pendingFitKey: pendingFitSceneKeyRef.current,
    };
  }, [buildError, debugEnabled, diagramTypeHint, initialDataState, isSceneBuilding, lastGenerator, lastMermaidToExcalidrawError, sceneKey, svgMarkup]);

  useEffect(() => {
    if (!api) return;
    const nextTheme = normalizeTheme(theme);
    const nextBackground = (() => {
      if (backgroundMode === 'excalidraw') {
        const current = api.getAppState();
        const currentBg =
          (lastCanvasBackgroundRef.current ?? (typeof current.viewBackgroundColor === 'string' ? current.viewBackgroundColor : null))
          ?? null;
        const prevTheme = current.theme === 'dark' || current.theme === 'light' ? current.theme : nextTheme;
        const prevDefault = prevTheme === 'dark' ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
        const nextDefault = nextTheme === 'dark' ? CANVAS_BG_DARK : CANVAS_BG_LIGHT;
        const shouldFollowTheme = !currentBg || (!hasUserCanvasBackgroundRef.current && currentBg === prevDefault);
        const resolved = shouldFollowTheme ? (mermaidBackgroundCandidate ?? nextDefault) : currentBg;
        if (resolved !== lastCanvasBackgroundRef.current) {
          lastCanvasBackgroundRef.current = resolved;
          setCanvasBackground(resolved);
        }
        return resolved;
      }
      return effectiveBackgroundColor ?? undefined;
    })();
    const expectedViewModeEnabled = isViewMode;
    const apply = () => {
      const current = api.getAppState();
      if (
        current.theme === nextTheme
        && current.viewBackgroundColor === nextBackground
        && current.viewModeEnabled === expectedViewModeEnabled
        && current.zenModeEnabled === false
      ) return;
      // Prevent our sync patches from marking the scene as user-edited.
      skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 1);
      api.updateScene({
        appState: buildWhiteboardAppState({
          uiTheme: nextTheme,
          viewMode: expectedViewModeEnabled,
          backgroundColor: nextBackground ?? undefined,
          zoomPercent: Math.round(((current.zoom as any)?.value ?? current.zoom ?? 1) * 100),
        }),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const raf = requestAnimationFrame(() => apply());
    return () => cancelAnimationFrame(raf);
  }, [api, backgroundMode, canvasBackgroundForTheme, effectiveBackgroundColor, isViewMode, mermaidBackgroundCandidate, theme]);

  useEffect(() => {
    if (!api) return;
    if (isAutoZoom) return;
    const targetZoom = clampWhiteboardZoom(zoomPercent / 100);
    const current = api.getAppState() as AppState;
    const currentZoom = (current.zoom as { value?: number } | number | undefined);
    const currentValue = typeof currentZoom === 'number' ? currentZoom : currentZoom?.value;
    if (typeof currentValue === 'number' && Math.abs(currentValue - targetZoom) < 0.01) return;
    api.updateScene({
      appState: {
        ...current,
        ...WHITEBOARD_EDITABLE_APPSTATE,
        viewModeEnabled: isViewMode,
        zoom: { value: targetZoom } as AppState['zoom'],
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, isAutoZoom, isViewMode, zoomPercent]);

  const scheduleAutosave = useCallback((nextJson: string) => {
    if (isViewMode) return;
    latestJsonRef.current = nextJson;
    if (pendingSaveRef.current) {
      window.clearTimeout(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }

    if (nextJson && nextJson !== lastSavedJsonRef.current) {
      onDirtyChange?.(true);
      pendingSaveRef.current = window.setTimeout(() => {
        pendingSaveRef.current = null;
        const latest = latestJsonRef.current;
        if (!latest || latest === lastSavedJsonRef.current) {
          onDirtyChange?.(false);
          return;
        }
        void Promise.resolve(onAutosave(latest))
          .then(() => {
            lastSavedJsonRef.current = latest;
            onDirtyChange?.(false);
          })
          .catch(() => {
            onDirtyChange?.(true);
          });
      }, AUTOSAVE_DEBOUNCE_MS);
    } else {
      onDirtyChange?.(false);
      isDirtyRef.current = false;
    }
  }, [isViewMode, onAutosave, onDirtyChange]);

  useEffect(() => {
    // If the user switches back to the Mermaid preview quickly after edits,
    // flush the latest scene instead of dropping the debounced save.
    return () => {
      if (isViewMode) return;
      if (pendingSaveRef.current) {
        window.clearTimeout(pendingSaveRef.current);
        pendingSaveRef.current = null;
      }
      const latest = latestJsonRef.current;
      if (!latest || latest === lastSavedJsonRef.current) return;
      try {
        void Promise.resolve(onAutosave(latest)).then(() => {
          lastSavedJsonRef.current = latest;
          onDirtyChange?.(false);
        });
      } catch {
        // ignore
      }
    };
  }, [isViewMode, onAutosave, onDirtyChange]);

  useEffect(() => {
    lastSerializedSignatureRef.current = '';
  }, [mermaidCode, svgMarkup]);

  useEffect(() => {
    // Text-only sync: if the flowchart structure hasn't changed, preserve user
    // layout (moved boxes/arrows) and update only labels from Mermaid code.
    if (!apiRef.current) return;
    if (isViewMode) return;
    if (!isDirtyRef.current) {
      lastMermaidCodeRef.current = mermaidCode;
      lastStructureSigRef.current = computeDiagramStructureSignature(diagramTypeHint, mermaidCode);
      return;
    }

    if (diagramTypeHint !== 'flowchart' && diagramTypeHint !== 'sequence' && diagramTypeHint !== 'class') {
      lastMermaidCodeRef.current = mermaidCode;
      lastStructureSigRef.current = computeDiagramStructureSignature(diagramTypeHint, mermaidCode);
      return;
    }

    const prevCode = lastMermaidCodeRef.current;
    if (prevCode === mermaidCode) return;

    const prevSig = lastStructureSigRef.current;
    const nextSig = computeDiagramStructureSignature(diagramTypeHint, mermaidCode);
    lastMermaidCodeRef.current = mermaidCode;
    lastStructureSigRef.current = nextSig;
    if (prevSig !== nextSig) return;

    let cancelled = false;
    void (async () => {
      try {
        const { elements: nextElements } = await renderMermaidToExcalidrawElements({
          mermaidCode,
          diagramTypeHint: diagramTypeHint,
          timeoutMs: 12000,
        });
        if (cancelled) return;
        const map = buildContainerTextMap(nextElements);
        if (!map.size) return;
        const currentElements = apiRef.current?.getSceneElements() ?? [];
        const { elements: patched, changed } = applyContainerTextMap(currentElements, map);
        if (!changed) return;
        apiRef.current?.updateScene({
          elements: patched as any,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      } catch {
        // ignore text-only sync errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [diagramTypeHint, isViewMode, mermaidCode]);

  useEffect(() => {
    if (!apiRef.current) return;
    if (pendingFitSceneKeyRef.current !== sceneKey) return;
    if (!initialDataState?.elements?.length) return;
    scheduleFitToContent(apiRef.current, sceneKey);
  }, [initialDataState, sceneKey, scheduleFitToContent]);

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => {
    if (skipNextChangeRef.current > 0) {
      skipNextChangeRef.current -= 1;
      return;
    }
    const themeFromAppState =
      appState.theme === 'dark' || appState.theme === 'light'
        ? appState.theme
        : null;
    if (themeFromAppState && themeFromAppState !== normalizeTheme(theme)) {
      onThemeChange?.(themeFromAppState);
    }
    if (backgroundMode === 'excalidraw') {
      const nextBg = typeof appState.viewBackgroundColor === 'string' ? appState.viewBackgroundColor : null;
      if (nextBg !== lastCanvasBackgroundRef.current) {
        hasUserCanvasBackgroundRef.current = true;
        lastCanvasBackgroundRef.current = nextBg;
        setCanvasBackground(nextBg);
      }
    }
    if (!hasHadContentRef.current && elements.length === 0) {
      return;
    }

    if (elements.length > 0) {
      hasHadContentRef.current = true;
    }

    if (
      backgroundMode === 'excalidraw'
      && !isViewMode
      && elements.length > 0
      && normalizedColorsSceneKeyRef.current !== sceneKey
    ) {
      const bg =
        (typeof appState.viewBackgroundColor === 'string' && appState.viewBackgroundColor.trim())
        || canvasBackgroundForTheme;
      const bgDark = (isDarkColor(bg) ?? (theme === 'dark'));
      const expectedLine = bgDark ? '#cbd5e1' : '#0f172a';
      const expectedText = bgDark ? '#e5e7eb' : '#0f172a';

      const needsNormalize = elements.some((el) => {
        if (!el) return false;
        if ((el as any).isDeleted) return false;
        const type = (el as any).type as string | undefined;
        if (!type) return false;
        if (type === 'image') return false;
        if (type === 'text') {
          const stroke = (el as any).strokeColor as string | undefined;
          return stroke ? (isDarkColor(stroke) === bgDark) : true;
        }
        if (type === 'line' || type === 'arrow') {
          const stroke = (el as any).strokeColor as string | undefined;
          return stroke ? (isDarkColor(stroke) === bgDark) : true;
        }
        if (type === 'rectangle' || type === 'diamond' || type === 'ellipse') {
          const stroke = (el as any).strokeColor as string | undefined;
          const fill = (el as any).backgroundColor as string | undefined;
          const badStroke = stroke ? (isDarkColor(stroke) === bgDark) : true;
          const badFill = typeof fill === 'string' && fill !== 'transparent';
          return badStroke || badFill;
        }
        return false;
      });

      if (needsNormalize) {
        const themed = applyMermaidThemeToExcalidrawElements(elements as unknown[], {
          backgroundColor: bg,
          themeVariables: null,
          uiTheme: theme,
          forceTheme: true,
        }) as unknown as OrderedExcalidrawElement[];
        // Only apply if the first pass is likely the raw converter colors.
        skipNextChangeRef.current = Math.max(skipNextChangeRef.current, 2);
        apiRef.current?.updateScene({
          elements: themed as any,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        normalizedColorsSceneKeyRef.current = sceneKey;
        return;
      }
      // Mark as normalized even if we didn't need to change anything.
      normalizedColorsSceneKeyRef.current = sceneKey;
    }

    if (pendingFitSceneKeyRef.current === sceneKey && elements.length > 0 && apiRef.current) {
      scheduleFitToContent(apiRef.current, sceneKey);
    }

    const expectedBackground = effectiveBackgroundColor?.trim() ?? '';
    const nextZoom = appState.zoom as { value?: number } | number | undefined;
    const nextZoomValue = typeof nextZoom === 'number' ? nextZoom : nextZoom?.value;
    if (typeof nextZoomValue === 'number') {
      const nextPercent = Math.round(nextZoomValue * 100);
      if (nextPercent !== lastZoomPercentRef.current) {
        lastZoomPercentRef.current = nextPercent;
        onZoomPercentChange?.(nextPercent);
      }
    }

    if (isViewMode) {
      if (scrollMode === 'vertical') {
        const lockX = lockedScrollXRef.current;
        if (lockX !== null) scheduleClampScroll(appState.scrollY);
      }
      return;
    }

    // Excalidraw calls onChange for selection/appState changes; don’t pay the
    // cost of serialization unless elements/files actually changed.
    const elementsVersion = elements.reduce((acc, el) => acc + (el?.version ?? 0), 0);
    const layoutSignature = Math.round(
      elements.reduce((acc, el) => {
        if (!el) return acc;
        const next =
          (el.x ?? 0)
          + (el.y ?? 0)
          + (el.width ?? 0)
          + (el.height ?? 0)
          + (el.angle ?? 0);
        return acc + next;
      }, 0) * 100
    );
    const themeSig = appState.theme === 'dark' || appState.theme === 'light' ? appState.theme : '';
    const backgroundSig = typeof appState.viewBackgroundColor === 'string' ? appState.viewBackgroundColor.trim() : '';
    const signature = `${elements.length}:${elementsVersion}:${Object.keys(files ?? {}).length}:${layoutSignature}:${themeSig}:${backgroundSig}`;
    if (signature === lastSerializedSignatureRef.current) return;

    try {
      latestFilesRef.current = files ?? {};
      const filesForSave = api?.getFiles?.() ?? files;
      const rawJson = serializeAsJSON(
        elements as unknown as readonly ExcalidrawElement[],
        pickAppStateForSave({
          ...appState,
          ...WHITEBOARD_EDITABLE_APPSTATE,
          viewBackgroundColor: expectedBackground || appState.viewBackgroundColor,
        }),
        filesForSave,
        // Store as "local" so image files (SVG) are embedded; otherwise
        // history scenes become non-portable and re-open as blank.
        'local'
      );
      const json = injectSceneMetaJson(rawJson, sceneMetaForSaveRef.current);
      lastSerializedSignatureRef.current = signature;
      isDirtyRef.current = true;
      scheduleAutosave(json);
    } catch {
      // Never throw from Excalidraw onChange — it can break interactions (selection/dragging).
    }
  }, [
    api,
    backgroundMode,
    effectiveBackgroundColor,
    isViewMode,
    onZoomPercentChange,
    sceneKey,
    scheduleAutosave,
    scheduleClampScroll,
    scheduleFitToContent,
    scrollMode,
  ]);

  const containerStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {};
    const resolvedBackground =
      backgroundMode === 'excalidraw'
        ? (canvasBackground ?? canvasBackgroundForTheme)
        : (effectiveBackgroundColor ?? 'transparent');
    style['--whiteboard-bg' as keyof React.CSSProperties] = resolvedBackground;
    if (backgroundMode === 'excalidraw') {
      style.backgroundColor = canvasBackground ?? canvasBackgroundForTheme;
    } else if (effectiveBackgroundColor) {
      style.backgroundColor = effectiveBackgroundColor;
    }
    return style;
  }, [backgroundMode, canvasBackground, canvasBackgroundForTheme, effectiveBackgroundColor]);

  const fallbackInitialData = useMemo(() => {
    if (initialDataState) return initialDataState;
    const background = (() => {
      if (backgroundMode === 'excalidraw') return canvasBackgroundForTheme;
      return effectiveBackgroundColor ?? undefined;
    })();
    return buildWhiteboardInitialData({
      scene: null,
      sceneMeta,
      uiTheme: normalizeTheme(theme),
      viewMode: isViewMode,
      backgroundColor: background,
      zoomPercent,
    });
  }, [backgroundMode, canvasBackgroundForTheme, effectiveBackgroundColor, initialDataState, isViewMode, sceneMeta, theme, zoomPercent]);

  return (
    <div
      ref={containerRef}
      className="diagram-whiteboard relative flex-1 min-h-0"
      style={containerStyle}
      onWheel={handleWheel}
    >
      <DiagramWhiteboardCanvas
        initialData={fallbackInitialData}
        theme={normalizeTheme(theme)}
        viewModeEnabled={isViewMode}
        onThemeChange={onThemeChange}
        onApiReady={(api) => {
          apiRef.current = api;
          setApi(api);
          if (pendingFitSceneKeyRef.current === sceneKey) {
            scheduleFitToContent(api, sceneKey);
          }
        }}
        onChange={handleChange}
        onPointerUp={handlePointerUp}
        onScrollChange={handleScrollChange}
      />

      <WhiteboardDebugOverlay
        enabled={debugEnabled}
        debugOverlay={debugOverlay}
        debugRuntime={debugRuntime}
        lastFitCalc={lastFitCalcRef.current as WhiteboardFitCalc | null}
        sceneKey={sceneKey}
        diagramTypeHint={diagramTypeHint}
        lastGenerator={lastGenerator}
        fitMode={fitMode}
        scrollMode={scrollMode}
        zoomMode={zoomMode}
        isViewMode={isViewMode}
        pendingFitSceneKey={pendingFitSceneKeyRef.current}
        lockedScrollX={lockedScrollXRef.current}
        apiRef={apiRef}
        effectiveBackgroundColor={effectiveBackgroundColor}
      />
    </div>
  );
};

export default DiagramWhiteboard;
