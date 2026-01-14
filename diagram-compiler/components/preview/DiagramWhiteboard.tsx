import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import '@excalidraw/excalidraw/index.css';
import './diagram-whiteboard.css';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import { extractMermaidSvgBackgroundColor } from '../../utils/mermaidSvgBackground';
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type Props = {
  theme: 'light' | 'dark';
  backgroundColor: string | null;
  mermaidCode: string;
  svgMarkup: string;
  initialSceneJson: string | null;
  onAutosave: (sceneJson: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type MermaidDiagramTypeHint = 'flowchart' | 'er' | 'sequence' | 'unknown';

type MermaidLanggraphSceneMeta = {
  v: 1;
  diagramType: MermaidDiagramTypeHint;
  mermaidHash: number;
  svgHash: number;
};

const MLG_META_KEY = '__mermaidLanggraph' as const;

const pickAppStateForSave = (appState: AppState): Partial<AppState> => {
  return {
    theme: appState.theme,
    viewBackgroundColor: appState.viewBackgroundColor,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  };
};

const normalizeTheme = (theme: 'light' | 'dark') => theme;

const hashString = (s: string): number => {
  // djb2, matches Excalidraw internal helper.
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) + hash + s.charCodeAt(i);
  }
  return hash >>> 0;
};

const stripYamlFrontmatter = (code: string): string => {
  const lines = code.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && (lines[index]?.trim() ?? '') === '') index += 1;
  if ((lines[index]?.trim() ?? '') !== '---') return code;

  const start = index;
  index += 1;
  while (index < lines.length) {
    if ((lines[index]?.trim() ?? '') === '---') {
      const rest = [...lines.slice(0, start), ...lines.slice(index + 1)];
      return rest.join('\n');
    }
    index += 1;
  }
  return code;
};

const detectMermaidDiagramTypeHint = (code: string): MermaidDiagramTypeHint => {
  if (!code.trim()) return 'unknown';
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('%%')) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('flowchart') || lower.startsWith('graph')) return 'flowchart';
    if (lower.startsWith('erdiagram')) return 'er';
    if (lower.startsWith('sequencediagram')) return 'sequence';
    return 'unknown';
  }
  return 'unknown';
};

const buildSceneMeta = (args: { mermaidCode: string; svgMarkup: string }): MermaidLanggraphSceneMeta => {
  return {
    v: 1,
    diagramType: detectMermaidDiagramTypeHint(args.mermaidCode),
    mermaidHash: hashString(args.mermaidCode.trim()),
    svgHash: hashString(args.svgMarkup.trim()),
  };
};

const injectSceneMetaJson = (sceneJson: string, meta: MermaidLanggraphSceneMeta): string => {
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return sceneJson;
    const record = parsed as Record<string, unknown>;
    record[MLG_META_KEY] = meta;
    return JSON.stringify(record, null, 2);
  } catch {
    return sceneJson;
  }
};

const readSceneMeta = (record: Record<string, unknown>): MermaidLanggraphSceneMeta | null => {
  const raw = record[MLG_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as Partial<MermaidLanggraphSceneMeta>;
  if (meta.v !== 1) return null;
  if (meta.diagramType !== 'flowchart' && meta.diagramType !== 'er' && meta.diagramType !== 'sequence' && meta.diagramType !== 'unknown') {
    return null;
  }
  if (typeof meta.mermaidHash !== 'number' || typeof meta.svgHash !== 'number') return null;
  return meta as MermaidLanggraphSceneMeta;
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

const EDITABLE_APPSTATE: Partial<AppState> = {
  viewModeEnabled: false,
  zenModeEnabled: false,
  activeTool: {
    type: 'selection',
    lastActiveTool: null,
    locked: false,
  } as AppState['activeTool'],
};

const toSvgDataUrl = (svg: string): DataURL => {
  // Prefer UTF-8 encoding to avoid base64/Unicode pitfalls.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` as DataURL;
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
  const approxCharWidth = fontSize * 0.55;
  const maxChars = Math.max(6, Math.floor(maxWidth / approxCharWidth));
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

const wrapMermaidToExcalidrawSkeletonLabels = (
  raw: unknown
): Parameters<typeof convertToExcalidrawElements>[0] => {
  const elements = (Array.isArray(raw) ? raw : []) as unknown[];
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const containerWidthById = new Map<string, number>();
  for (const el of elements) {
    if (!isRecord(el)) continue;
    const id = typeof el.id === 'string' ? el.id : null;
    const width = num(el.width);
    if (id && width !== null) containerWidthById.set(id, width);
  }

  return elements.map((el) => {
    if (!isRecord(el)) return el;

    const width = num(el.width);
    const labelRaw = el.label;
    if (labelRaw && isRecord(labelRaw) && typeof labelRaw.text === 'string') {
      const fontSize = num(labelRaw.fontSize) ?? 16;
      const maxWidth = (width ?? 0) > 0 ? (width as number) - 24 : 0;
      const wrapped = wrapTextToWidth(labelRaw.text, { maxWidth, fontSize });
      if (wrapped !== labelRaw.text) {
        return {
          ...el,
          label: {
            ...labelRaw,
            text: wrapped,
          },
        };
      }
      return el;
    }

    // Some converters output text elements bound to containers.
    if (el.type === 'text' && typeof el.text === 'string') {
      const containerId = typeof el.containerId === 'string' ? el.containerId : null;
      if (!containerId) return el;
      const containerWidth = containerWidthById.get(containerId);
      if (!containerWidth) return el;
      const fontSize = num(el.fontSize) ?? 16;
      const maxWidth = containerWidth - 24;
      const wrapped = wrapTextToWidth(el.text, { maxWidth, fontSize });
      if (wrapped !== el.text) {
        return { ...el, text: wrapped, originalText: wrapped };
      }
      return el;
    }

    return el;
  }) as unknown as Parameters<typeof convertToExcalidrawElements>[0];
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

    const elementsSkeleton: Array<Record<string, unknown>> = [];
    const seenTextKeys = new Set<string>();
    const shouldSkipText = (args: { text: string; x: number; y: number }) => {
      const key = `${Math.round(args.x)}:${Math.round(args.y)}:${args.text}`;
      if (seenTextKeys.has(key)) return true;
      seenTextKeys.add(key);
      return false;
    };

    // Rectangles (nodes/containers).
    const rects = Array.from(svgEl.querySelectorAll('rect'));
    for (const rectEl of rects) {
      const bb = getBBoxSafe(rectEl);
      if (!bb) continue;
      const w = bb.width;
      const h = bb.height;
      if (!(w > 6 && h > 6)) continue;
      // Skip background-size rects.
      if (w >= width * 0.95 && h >= height * 0.95) continue;

      const p = svgToLocal({ x: bb.x, y: bb.y });
      const stroke = getSvgPaint(rectEl, 'stroke') ?? '#1f2937';
      const fill = getSvgPaint(rectEl, 'fill') ?? 'transparent';
      const strokeWidth = getSvgStrokeWidth(rectEl) ?? 1;

      elementsSkeleton.push({
        type: 'rectangle',
        x: p.x,
        y: p.y,
        width: w,
        height: h,
        strokeColor: stroke,
        backgroundColor: fill === 'transparent' ? 'transparent' : fill,
        strokeWidth,
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
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
      const bb = getBBoxSafe(foreignObjectEl) ?? (() => {
        const x = parseCssNumber(foreignObjectEl.getAttribute('x')) ?? 0;
        const y = parseCssNumber(foreignObjectEl.getAttribute('y')) ?? 0;
        const w = parseCssNumber(foreignObjectEl.getAttribute('width')) ?? 0;
        const h = parseCssNumber(foreignObjectEl.getAttribute('height')) ?? 0;
        return w > 0 && h > 0 ? ({ x, y, width: w, height: h } as const) : null;
      })();
      if (!bb) continue;
      const p = svgToLocal({ x: bb.x, y: bb.y });
      const fontSize = 16;
      const wrapped = wrapTextToWidth(content, { maxWidth: bb.width, fontSize });
      if (shouldSkipText({ text: wrapped, x: p.x, y: p.y })) continue;
      elementsSkeleton.push({
        type: 'text',
        text: wrapped,
        x: p.x,
        y: p.y,
        fontSize,
        strokeColor: args.theme === 'dark' ? '#e5e7eb' : '#111827',
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
    }

    // Text labels.
    const texts = Array.from(svgEl.querySelectorAll('text'));
    for (const textEl of texts) {
      const content = (textEl.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!content) continue;
      const fontSize = getSvgTextFontSize(textEl) ?? 16;
      const stroke = getSvgPaint(textEl, 'fill') ?? '#111827';

      const bb = getBBoxSafe(textEl);
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

      elementsSkeleton.push({
        type: 'text',
        text: wrapped,
        x: p.x,
        y: p.y,
        fontSize,
        strokeColor: stroke,
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
    }

    const hasAncestorClassFragment = (el: Element, fragments: string[]): boolean => {
      let cur: Element | null = el;
      while (cur) {
        const cls = (cur.getAttribute('class') ?? '').toLowerCase();
        if (fragments.some((f) => cls.includes(f))) return true;
        cur = cur.parentElement;
      }
      return false;
    };

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

      elementsSkeleton.push({
        type: 'line',
        x: start.x,
        y: start.y,
        points: [[0, 0], ...rest.map((p) => [p.x - start.x, p.y - start.y])],
        strokeColor: stroke,
        strokeWidth: getSvgStrokeWidth(pathEl) ?? 1,
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
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
      elementsSkeleton.push({
        type: 'line',
        x: p1.x,
        y: p1.y,
        points: [[0, 0], [p2.x - p1.x, p2.y - p1.y]],
        strokeColor: stroke,
        strokeWidth: getSvgStrokeWidth(lineEl) ?? 1,
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
    }

    if (elementsSkeleton.length < 2) return null;

    const skeleton = elementsSkeleton as unknown as Parameters<typeof convertToExcalidrawElements>[0];
    const elements = convertToExcalidrawElements(skeleton, { regenerateIds: true }).map((el) => ({
      ...el,
      locked: false,
      groupIds: [] as unknown as typeof el.groupIds,
    }));

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

const tryParseInitialScene = (sceneJson: string | null): ExcalidrawInitialDataState | null => {
  if (!sceneJson?.trim()) return null;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== 'excalidraw') return null;
    if (!Array.isArray(record.elements)) return null;
    // Ignore blank scenes (common when initialData resolves before SVG is ready).
    const elements = record.elements as unknown[];
    const filesRaw = record.files;
    const filesCount =
      filesRaw && typeof filesRaw === 'object' ? Object.keys(filesRaw as Record<string, unknown>).length : 0;
    const nonDeletedElements = elements.filter((el) => {
      if (!el || typeof el !== 'object') return false;
      return (el as { isDeleted?: unknown }).isDeleted !== true;
    });
    // If the stored scene has no visible elements, treat it as empty (regenerate).
    if (nonDeletedElements.length === 0) return null;
    // Guard: if the stored scene looks like a partial import (e.g. only boxes,
    // no labels/edges), regenerate from Mermaid so the result is editable.
    const elementTypes = nonDeletedElements
      .map((el) => String((el as { type?: unknown }).type ?? ''));
    const hasImage = elementTypes.some((t) => t === 'image');
    const hasText = elementTypes.some((t) => t === 'text');
    const hasLines = elementTypes.some((t) => t === 'line' || t === 'arrow');
    if (!hasImage && !hasText && !hasLines && elements.length > 0) return null;
    // If the scene contains image elements but no files payload, it will render
    // as a placeholder; prefer regenerating from Mermaid instead.
    if (filesCount === 0 && elements.some((el) => !!el && typeof el === 'object' && (el as { type?: unknown }).type === 'image')) {
      return null;
    }
    // Migration: older whiteboard scenes were stored as a single locked image
    // snapshot of the Mermaid SVG. This is not editable; prefer regenerating
    // semantic elements from Mermaid code.
    const isImageOnly = elements.length > 0 && elements.every((el) => !!el && typeof el === 'object' && (el as { type?: unknown }).type === 'image');
    const isAllLocked =
      elements.length > 0
      && elements.every((el) => !!el && typeof el === 'object' && (el as { locked?: unknown }).locked === true);
    if (filesCount > 0 && isImageOnly && isAllLocked) return null;
    return parsed as ExcalidrawInitialDataState;
  } catch {
    return null;
  }
};

const buildSceneFromMermaidCode = async (args: {
  mermaidCode: string;
  svgMarkup: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
}): Promise<ExcalidrawInitialDataState | null> => {
  const diagramTypeHint = detectMermaidDiagramTypeHint(args.mermaidCode);

  // Prefer the official Mermaid→Excalidraw converter for flowcharts (best editability).
  if (diagramTypeHint === 'flowchart') {
    try {
      const stripped = stripYamlFrontmatter(args.mermaidCode);
      const { elements, files } = await withTimeout(
        parseMermaidToExcalidraw(stripped, {
          themeVariables: {
            fontSize: '16px',
          },
        }),
        1500
      );
      const wrappedSkeleton = wrapMermaidToExcalidrawSkeletonLabels(elements);
      const converted = convertToExcalidrawElements(wrappedSkeleton, { regenerateIds: true }).map((el) => ({
        ...el,
        locked: false,
        groupIds: [] as unknown as typeof el.groupIds,
      }));
      if (converted.length > 0) {
        return {
          type: 'excalidraw',
          version: 2,
          source: 'mermaid-langgraph',
          elements: converted,
          files,
          scrollToContent: true,
          appState: {
            theme: normalizeTheme(args.theme),
            viewBackgroundColor: args.backgroundColor ?? undefined,
          } as Partial<AppState>,
        };
      }
    } catch {
      // Fall back to SVG parsing/snapshot.
    }
  }

  // Prefer parsing the already-rendered SVG (fast + works across Mermaid versions).
  const svgVectors = await buildSceneFromSvgVectors({
    svgMarkup: args.svgMarkup,
    theme: args.theme,
    backgroundColor: args.backgroundColor,
  });
  if (svgVectors) return svgVectors;

  return buildSceneFromSvgMarkup({
    svgMarkup: args.svgMarkup,
    theme: args.theme,
    backgroundColor: args.backgroundColor,
  });
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
  mermaidCode,
  svgMarkup,
  initialSceneJson,
  onAutosave,
  onDirtyChange,
}) => {
  const debugEnabled = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).has('wbDebug');
    } catch {
      return false;
    }
  }, []);

  const diagramTypeHint = useMemo(() => detectMermaidDiagramTypeHint(mermaidCode), [mermaidCode]);
  const sceneMeta = useMemo(() => buildSceneMeta({ mermaidCode, svgMarkup }), [mermaidCode, svgMarkup]);

  const effectiveBackgroundColor = useMemo(() => {
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

  const lastSavedJsonRef = useRef<string>(initialSceneJson ?? '');
  const pendingSaveRef = useRef<number | null>(null);
  const latestJsonRef = useRef<string>(initialSceneJson ?? '');
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const hasHadContentRef = useRef(false);
  const isDirtyRef = useRef(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [initialDataState, setInitialDataState] = useState<ExcalidrawInitialDataState | null>(null);
  const [isSceneBuilding, setIsSceneBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const lastGeneratedSignatureRef = useRef<string>('');
  const sceneMetaForSaveRef = useRef<MermaidLanggraphSceneMeta>(sceneMeta);
  const pendingFitSceneKeyRef = useRef<number | null>(null);
  const lastSerializedSignatureRef = useRef<string>('');

  const prepareInitialData = useCallback((scene: ExcalidrawInitialDataState): ExcalidrawInitialDataState => {
    const sceneAppState = (scene.appState ?? {}) as Partial<AppState>;
    return {
      ...scene,
      appState: {
        ...sceneAppState,
        ...EDITABLE_APPSTATE,
        theme: normalizeTheme(theme),
        viewBackgroundColor: effectiveBackgroundColor ?? sceneAppState.viewBackgroundColor,
      },
    };
  }, [effectiveBackgroundColor, theme]);

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    onDirtyChange?.(false);
    isDirtyRef.current = false;
    const parsed = tryParseInitialScene(initialSceneJson);
    hasHadContentRef.current = Boolean(parsed?.elements && Array.isArray(parsed.elements) && parsed.elements.length > 0);
  }, [initialSceneJson, onDirtyChange]);

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
      } else {
      defer(() => {
        setInitialDataState(prepareInitialData(parsed));
        sceneMetaForSaveRef.current = meta;
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

    const signature = `${sceneMeta.mermaidHash}:${normalizeTheme(theme)}:${effectiveBackgroundColor ?? ''}`;
    if (signature === lastGeneratedSignatureRef.current) return;
    lastGeneratedSignatureRef.current = signature;

    let cancelled = false;
    defer(() => {
      setIsSceneBuilding(true);
      setBuildError(null);
    });
    void buildSceneFromMermaidCode({
      mermaidCode,
      svgMarkup,
      theme,
      backgroundColor: effectiveBackgroundColor,
    }).then((scene) => {
      if (cancelled) return;
      setIsSceneBuilding(false);
      if (!scene) {
        setBuildError('buildSceneFromMermaidCode returned null');
        return;
      }
      setInitialDataState(prepareInitialData(scene));
      sceneMetaForSaveRef.current = sceneMeta;
      setBuildError(null);
      setSceneKey((k) => {
        const next = k + 1;
        pendingFitSceneKeyRef.current = next;
        return next;
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setIsSceneBuilding(false);
      const message = error instanceof Error ? error.message : String(error);
      setBuildError(message);
    });

    return () => {
      cancelled = true;
    };
  }, [
    diagramTypeHint,
    effectiveBackgroundColor,
    initialDataState,
    initialSceneJson,
    mermaidCode,
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
    return {
      status,
      error: buildError,
      builtCounts: counts,
      diagramTypeHint,
      svgChars: svgMarkup.trim() ? svgMarkup.length : 0,
    };
  }, [buildError, debugEnabled, diagramTypeHint, initialDataState, isSceneBuilding, svgMarkup]);

  useEffect(() => {
    if (!api) return;
    const nextTheme = normalizeTheme(theme);
    const nextBackground = effectiveBackgroundColor ?? undefined;
    const apply = () => {
      const current = api.getAppState();
      if (
        current.theme === nextTheme
        && current.viewBackgroundColor === nextBackground
        && current.viewModeEnabled === false
        && current.zenModeEnabled === false
      ) return;
      api.updateScene({
        appState: {
          ...EDITABLE_APPSTATE,
          theme: nextTheme,
          viewBackgroundColor: nextBackground,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.refresh();
    };

    // Excalidraw can update its internal appState during initialization/theme changes.
    // Apply twice across frames to ensure the canvas background sticks.
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      apply();
      raf2 = requestAnimationFrame(() => apply());
    });

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [api, effectiveBackgroundColor, theme]);

  const scheduleAutosave = useCallback((nextJson: string) => {
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
        onAutosave(latest);
        lastSavedJsonRef.current = latest;
        onDirtyChange?.(false);
      }, AUTOSAVE_DEBOUNCE_MS);
    } else {
      onDirtyChange?.(false);
      isDirtyRef.current = false;
    }
  }, [onAutosave, onDirtyChange]);

  useEffect(() => {
    lastSerializedSignatureRef.current = '';
  }, [mermaidCode, svgMarkup]);

  const handleChange = useCallback((
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles
  ) => {
    if (!hasHadContentRef.current && elements.length === 0) {
      return;
    }

    if (elements.length > 0) {
      hasHadContentRef.current = true;
    }

    if (pendingFitSceneKeyRef.current === sceneKey && elements.length > 0) {
      pendingFitSceneKeyRef.current = null;
      requestAnimationFrame(() => {
        try {
          apiRef.current?.scrollToContent(undefined, { fitToContent: true });
        } catch {
          // ignore
        }
      });
    }

    const expectedBackground = effectiveBackgroundColor?.trim() ?? '';

    // Excalidraw calls onChange for selection/appState changes; don’t pay the
    // cost of serialization unless elements/files actually changed.
    const elementsVersion = elements.reduce((acc, el) => acc + (el?.version ?? 0), 0);
    const signature = `${elements.length}:${elementsVersion}:${Object.keys(files ?? {}).length}`;
    if (signature === lastSerializedSignatureRef.current) return;

    try {
      const filesForSave = api?.getFiles?.() ?? files;
      const rawJson = serializeAsJSON(
        elements as unknown as readonly ExcalidrawElement[],
        pickAppStateForSave({
          ...appState,
          ...EDITABLE_APPSTATE,
          viewBackgroundColor: expectedBackground || appState.viewBackgroundColor,
        }),
        filesForSave,
        'database'
      );
      const json = injectSceneMetaJson(rawJson, sceneMetaForSaveRef.current);
      lastSerializedSignatureRef.current = signature;
      isDirtyRef.current = true;
      scheduleAutosave(json);
    } catch {
      // Never throw from Excalidraw onChange — it can break interactions (selection/dragging).
    }
  }, [api, effectiveBackgroundColor, sceneKey, scheduleAutosave]);

  const containerStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {
      // Disable the dark-theme canvas filter so Mermaid colors/background stay exact.
      ['--theme-filter' as keyof React.CSSProperties]: 'none',
    };
    if (effectiveBackgroundColor) {
      style.backgroundColor = effectiveBackgroundColor;
    }
    return style;
  }, [effectiveBackgroundColor]);

  return (
    <div className="diagram-whiteboard relative flex-1 min-h-0" style={containerStyle}>
      <Excalidraw
        key={sceneKey}
        initialData={initialDataState ?? ({
          type: 'excalidraw',
          version: 2,
          source: 'mermaid-langgraph',
          elements: [],
          files: {},
          appState: {
            ...EDITABLE_APPSTATE,
            theme: normalizeTheme(theme),
            viewBackgroundColor: effectiveBackgroundColor ?? undefined,
          } as Partial<AppState>,
          scrollToContent: false,
          [MLG_META_KEY]: sceneMeta,
        } as unknown as ExcalidrawInitialDataState)}
        theme={normalizeTheme(theme)}
        viewModeEnabled={false}
        zenModeEnabled={false}
        excalidrawAPI={(api) => {
          apiRef.current = api;
          setApi(api);
        }}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            export: false,
          },
        }}
      />
      {debugEnabled && (
        <div className="absolute top-2 left-2 rounded border border-slate-300/40 bg-white/80 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600/50 dark:bg-slate-900/70 dark:text-slate-200">
          <div>Whiteboard: {debugOverlay?.status ?? 'idle'}</div>
          <div>type: {debugOverlay?.diagramTypeHint ?? diagramTypeHint}</div>
          <div>svg: {debugOverlay?.svgChars ? `${debugOverlay.svgChars} chars` : 'empty'}</div>
          {debugOverlay?.error ? <div>error: {debugOverlay.error}</div> : null}
          {debugOverlay?.builtCounts ? <div>built: {JSON.stringify(debugOverlay.builtCounts)}</div> : null}
        </div>
      )}
    </div>
  );
};

export default DiagramWhiteboard;
