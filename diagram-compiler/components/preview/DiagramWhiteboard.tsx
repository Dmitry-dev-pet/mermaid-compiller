import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import mermaid from 'mermaid';
import '@excalidraw/excalidraw/index.css';
import './diagram-whiteboard.css';
import { Code2, Copy, Download, X } from 'lucide-react';
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

type ExcalidrawElementSkeletonList = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>;
type ExcalidrawElementSkeleton = ExcalidrawElementSkeletonList[number];

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

type MermaidLanggraphSceneGenerator = 'unknown' | 'mermaid-to-excalidraw' | 'svg-image';

type MermaidLanggraphSceneMeta = {
  v: 2;
  diagramType: MermaidDiagramTypeHint;
  mermaidHash: number;
  svgHash: number;
  generator: MermaidLanggraphSceneGenerator;
};

const MLG_META_KEY = '__mermaidLanggraph' as const;

// Mermaid v11 can throw when re-initialized while diagrams are already registered
// (e.g. "Diagram flowchart-v2 already registered."). Our app re-initializes
// Mermaid on theme/look changes; `@excalidraw/mermaid-to-excalidraw` calls
// `mermaid.initialize()` internally and doesn't swallow the error.
// Patch once per page-load so conversion doesn't always fall back to svg-image.
let mermaidInitializePatched = false;
const patchMermaidInitialize = () => {
  if (mermaidInitializePatched) return;
  mermaidInitializePatched = true;
  const original = mermaid.initialize.bind(mermaid);
  mermaid.initialize = ((config: unknown) => {
    try {
      return original(config as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already registered')) return;
      throw error;
    }
  }) as typeof mermaid.initialize;
};

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

const stripMermaidInitDirectives = (code: string): string => {
  // Mermaid init directives are comments like: %%{init: {...}}%%
  // `@excalidraw/mermaid-to-excalidraw` may fail on some directive variants,
  // and we provide theme variables separately anyway.
  return code
    .split(/\r?\n/)
    .filter((line) => !/^\s*%%\{.*\binit\s*:.*\}%%\s*$/.test(line))
    .join('\n')
    .trim();
};

const preprocessMermaidForExcalidraw = (code: string): string => {
  return stripMermaidInitDirectives(stripYamlFrontmatter(code)).replace(/<br\s*\/?>/gi, '');
};

const normalizeMermaidToExcalidrawSkeletons = (raw: unknown): ExcalidrawElementSkeletonList => {
  if (!Array.isArray(raw)) return [];
  const out: ExcalidrawElementSkeleton[] = [];

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const asNumber = (value: unknown): number | null => {
    if (typeof value !== 'number') return null;
    return Number.isFinite(value) ? value : null;
  };

  const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const asStrokeStyle = (value: unknown): 'solid' | 'dashed' | 'dotted' | undefined => {
    const raw = typeof value === 'string' ? value : '';
    if (raw === 'solid' || raw === 'dashed' || raw === 'dotted') return raw;
    return undefined;
  };

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = asString(item.type);
    if (!type) continue;

    // @excalidraw/mermaid-to-excalidraw v2 returns skeletons that are NOT
    // compatible with Excalidraw v0.18 `convertToExcalidrawElements`
    // (e.g. `startX/startY/endX/endY` instead of `x/y/points`).
    // Normalize them to the current skeleton format.
    if (type === 'line' || type === 'arrow') {
      // Newer skeletons already use x/y/points.
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      const pointsRaw = item.points;
      const points =
        Array.isArray(pointsRaw)
          ? pointsRaw
            .map((p) => (Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : null))
            .filter((p): p is [number, number] => Boolean(p) && p.every((n) => Number.isFinite(n)))
          : [];
      if (x !== null && y !== null && points.length >= 2) {
        const labelRaw = isRecord(item.label) ? item.label : null;
        const labelText = labelRaw ? asString(labelRaw.text) : null;
        const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
        const label =
          labelText && labelText.trim()
            ? {
              text: labelText,
              ...(labelFontSize ? { fontSize: labelFontSize } : {}),
            }
            : undefined;
        out.push({
          type: type as 'line' | 'arrow',
          x,
          y,
          points,
          ...(asString(item.strokeColor) ? { strokeColor: String(item.strokeColor) } : {}),
          ...(asNumber(item.strokeWidth) !== null ? { strokeWidth: Number(item.strokeWidth) } : {}),
          ...(asStrokeStyle(item.strokeStyle) ? { strokeStyle: asStrokeStyle(item.strokeStyle) } : {}),
          ...(label ? { label } : {}),
        } satisfies ExcalidrawElementSkeleton);
        continue;
      }

      // Legacy skeletons (mermaid-to-excalidraw <=1.x) use startX/startY/endX/endY.
      const startX = asNumber(item.startX);
      const startY = asNumber(item.startY);
      const endX = asNumber(item.endX);
      const endY = asNumber(item.endY);
      if (startX === null || startY === null || endX === null || endY === null) continue;
      const fallbackPoints = [[0, 0], [endX - startX, endY - startY]] as const;

      const strokeColor = asString(item.strokeColor);
      const strokeWidth = asNumber(item.strokeWidth);
      const strokeStyle = asStrokeStyle(item.strokeStyle);

      const labelRaw = isRecord(item.label) ? item.label : null;
      const labelText = labelRaw ? asString(labelRaw.text) : null;
      const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
      const label =
        labelText && labelText.trim()
          ? {
            text: labelText,
            ...(labelFontSize ? { fontSize: labelFontSize } : {}),
          }
          : undefined;

      out.push({
        type: type as 'line' | 'arrow',
        x: startX,
        y: startY,
        points: fallbackPoints,
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth !== null ? { strokeWidth } : {}),
        ...(strokeStyle ? { strokeStyle } : {}),
        ...(label ? { label } : {}),
      } satisfies ExcalidrawElementSkeleton);
      continue;
    }

    if (type === 'rectangle' || type === 'ellipse') {
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      if (x === null || y === null) continue;
      const width = asNumber(item.width);
      const height = asNumber(item.height);
      const strokeColor = asString(item.strokeColor);
      const strokeWidth = asNumber(item.strokeWidth);
      const strokeStyle = asStrokeStyle(item.strokeStyle);
      const backgroundColor = asString(item.backgroundColor) ?? asString(item.bgColor);

      const labelRaw = isRecord(item.label) ? item.label : null;
      const labelText = labelRaw ? asString(labelRaw.text) : null;
      const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
      const label =
        labelText && labelText.trim()
          ? {
            text: labelText,
            ...(labelFontSize ? { fontSize: labelFontSize } : {}),
          }
          : undefined;

      out.push({
        type: type as 'rectangle' | 'ellipse',
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth !== null ? { strokeWidth } : {}),
        ...(strokeStyle ? { strokeStyle } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(label ? { label } : {}),
      } satisfies ExcalidrawElementSkeleton);
      continue;
    }

    if (type === 'text') {
      const text = asString(item.text) ?? '';
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      if (x === null || y === null) continue;
      const width = asNumber(item.width);
      const height = asNumber(item.height);
      const fontSize = asNumber(item.fontSize);
      const strokeColor = asString(item.strokeColor) ?? asString(item.color);
      out.push({
        type: 'text',
        text,
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(fontSize !== null ? { fontSize } : {}),
        ...(strokeColor ? { strokeColor } : {}),
      } satisfies ExcalidrawElementSkeleton);
      continue;
    }
  }

  return out;
};

const parseHexColor = (color: string): { r: number; g: number; b: number } | null => {
  const raw = color.trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (![3, 6].includes(hex.length)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => `${c}${c}`).join('') : hex;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return null;
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const parseRgbColor = (color: string): { r: number; g: number; b: number } | null => {
  const m = color.trim().match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/i);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return null;
  return { r, g, b };
};

const isDarkColor = (color: string): boolean | null => {
  const rgb = parseHexColor(color) ?? parseRgbColor(color);
  if (!rgb) return null;
  // Perceived luminance (0..255).
  const l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return l < 128;
};

const applyMermaidThemeToExcalidrawElements = <T,>(
  raw: readonly T[],
  opts: { backgroundColor: string | null; themeVariables: Record<string, string | number | boolean> | null; uiTheme: 'light' | 'dark' }
): T[] => {
  const elements = Array.isArray(raw) ? [...raw] : [];
  const vars = opts.themeVariables ?? null;
  const fromVarsBackground = typeof vars?.background === 'string' ? vars.background.trim() : '';
  const bg = (opts.backgroundColor?.trim() ?? '') || fromVarsBackground;
  const darkModeVar = typeof vars?.darkMode === 'boolean' ? vars.darkMode : null;
  const bgDark = (bg ? isDarkColor(bg) : null) ?? darkModeVar ?? (opts.uiTheme === 'dark');

  const lineColor =
    (typeof vars?.lineColor === 'string' && vars.lineColor.trim()) ? String(vars.lineColor).trim()
      : bgDark ? '#9da5b4' : '#374151';
  const textColor =
    (typeof vars?.primaryTextColor === 'string' && vars.primaryTextColor.trim()) ? String(vars.primaryTextColor).trim()
      : bgDark ? '#d4d4d4' : '#0f172a';
  const nodeFill =
    (typeof vars?.primaryColor === 'string' && vars.primaryColor.trim()) ? String(vars.primaryColor).trim()
      : bgDark ? '#1e1e1e' : '#ffffff';

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const shouldFixContrast = (color: unknown): boolean => {
    if (typeof color !== 'string') return true;
    const trimmed = color.trim();
    if (!trimmed) return true;
    const dark = isDarkColor(trimmed);
    if (dark === null) return false;
    return bgDark ? dark : !dark;
  };

  return elements.map((el) => {
    if (!isRecord(el)) return el;
    const type = typeof el.type === 'string' ? el.type : '';
    if (!type) return el;

    // Keep images untouched.
    if (type === 'image') return el;

    const next: Record<string, unknown> = { ...el, locked: false };
    if (type === 'text') {
      if (shouldFixContrast(el.strokeColor)) {
        next.strokeColor = textColor;
      }
      return next as T;
    }

    if (type === 'rectangle' || type === 'diamond' || type === 'ellipse') {
      if (shouldFixContrast(el.strokeColor)) {
        next.strokeColor = lineColor;
      }
      // Don’t aggressively override fills — users may have edited them.
      // Only set a fill when it’s missing/transparent (common in old imports).
      if (typeof el.backgroundColor !== 'string' || el.backgroundColor === 'transparent') {
        next.backgroundColor = nodeFill;
      }
      return next as T;
    }

    if (type === 'line' || type === 'arrow') {
      if (shouldFixContrast(el.strokeColor)) {
        next.strokeColor = lineColor;
      }
      return next as T;
    }

    return next as T;
  });
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
    v: 2,
    diagramType: detectMermaidDiagramTypeHint(args.mermaidCode),
    mermaidHash: hashString(args.mermaidCode.trim()),
    svgHash: hashString(args.svgMarkup.trim()),
    generator: 'unknown',
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
  if (meta.v !== 2) return null;
  if (meta.diagramType !== 'flowchart' && meta.diagramType !== 'er' && meta.diagramType !== 'sequence' && meta.diagramType !== 'unknown') {
    return null;
  }
  if (typeof meta.mermaidHash !== 'number' || typeof meta.svgHash !== 'number') return null;
  // Migrate away from the legacy `svg-vectors` generator (it produced broken,
  // non-editable scenes in our app). Treat it as invalid to force regeneration.
  if ((meta as { generator?: unknown }).generator === 'svg-vectors') return null;
  if (meta.generator !== 'unknown' && meta.generator !== 'mermaid-to-excalidraw' && meta.generator !== 'svg-image') return null;
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
    const elements = convertToExcalidrawElements(skeleton, { regenerateIds: true }).map((el) => ({ ...el, locked: false }));

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
  debug?: boolean;
}): Promise<{ scene: ExcalidrawInitialDataState; generator: MermaidLanggraphSceneGenerator } | null> => {
  try {
    const themeVars = extractFrontmatterThemeVariables(args.mermaidCode);
    const themeVariables = {
      ...(themeVars ?? {}),
      // Keep font size consistent and avoid huge labels.
      fontSize: '16px',
    };
    const backgroundCandidate =
      (args.backgroundColor?.trim() ?? '')
      || (typeof themeVars?.background === 'string' ? themeVars.background.trim() : '')
      || extractMermaidSvgBackgroundColor(args.svgMarkup)
      || null;

    const preprocessed = preprocessMermaidForExcalidraw(args.mermaidCode);
    const { elements, files } = await withTimeout(
      parseMermaidToExcalidraw(preprocessed, { themeVariables }),
      2000
    );
    const normalizedSkeletons = normalizeMermaidToExcalidrawSkeletons(elements);
    const converted = convertToExcalidrawElements(normalizedSkeletons, { regenerateIds: true }).map((el) => ({ ...el, locked: false }));
    const themed = applyMermaidThemeToExcalidrawElements(converted, {
      backgroundColor: backgroundCandidate,
      themeVariables: themeVars,
      uiTheme: args.theme,
    });
    if (themed.length > 0) {
      return {
        generator: 'mermaid-to-excalidraw',
        scene: {
        type: 'excalidraw',
        version: 2,
        source: 'mermaid-langgraph',
        elements: themed,
        files,
        scrollToContent: true,
        appState: {
          theme: normalizeTheme(args.theme),
          viewBackgroundColor: backgroundCandidate ?? undefined,
        } as Partial<AppState>,
        },
      };
    }
    if (args.debug) {
      // eslint-disable-next-line no-console
      console.warn('[whiteboard] mermaid-to-excalidraw returned 0 elements; falling back to svg');
    }
  } catch (error) {
    if (args.debug) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn('[whiteboard] mermaid-to-excalidraw failed; falling back to svg', message);
    }
    // Fall back to SVG parsing/snapshot.
  }

  // Fallback: import the rendered Mermaid SVG as a single image so it always stays visible.
  const svgImage = await buildSceneFromSvgMarkup({
    svgMarkup: args.svgMarkup,
    theme: args.theme,
    backgroundColor: args.backgroundColor,
  });
  return svgImage ? { scene: svgImage, generator: 'svg-image' } : null;
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
  const [isSceneJsonOpen, setIsSceneJsonOpen] = useState(false);
  const [sceneJsonForViewer, setSceneJsonForViewer] = useState<string>(initialSceneJson ?? '');
  const latestFilesRef = useRef<BinaryFiles>({});
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const hasHadContentRef = useRef(false);
  const isDirtyRef = useRef(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [initialDataState, setInitialDataState] = useState<ExcalidrawInitialDataState | null>(null);
  const [isSceneBuilding, setIsSceneBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [lastGenerator, setLastGenerator] = useState<MermaidLanggraphSceneGenerator>('unknown');
  const lastBuiltSignatureRef = useRef<string>('');
  const inFlightSignatureRef = useRef<string>('');
  const buildRunIdRef = useRef(0);
  const sceneMetaForSaveRef = useRef<MermaidLanggraphSceneMeta>(sceneMeta);
  const pendingFitSceneKeyRef = useRef<number | null>(null);
  const lastSerializedSignatureRef = useRef<string>('');

  const scheduleFitToContent = useCallback((
    api: ExcalidrawImperativeAPI,
    targetSceneKey: number
  ) => {
    // The Excalidraw API instance is recreated when we bump `sceneKey` (key prop).
    // Fit-to-content must run after the new scene is actually loaded.
    if (pendingFitSceneKeyRef.current !== targetSceneKey) return;

    let attempts = 0;
    const maxAttempts = 600;
    const tick = () => {
      if (pendingFitSceneKeyRef.current !== targetSceneKey) return;
      attempts += 1;
      const elements = api.getSceneElements();
      const appState = api.getAppState() as AppState;
      // `isLoading` is not present in all Excalidraw versions; treat `undefined`
      // as "not loading" to avoid permanently skipping fit-to-content.
      const isLoading = (appState as unknown as { isLoading?: unknown }).isLoading === true;
      const viewportReady =
        typeof (appState as unknown as { width?: unknown }).width === 'number'
        && (appState as unknown as { width: number }).width > 0
        && typeof (appState as unknown as { height?: unknown }).height === 'number'
        && (appState as unknown as { height: number }).height > 0;
      if (elements?.length && !isLoading && viewportReady) {
        try {
          api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: 0.92 });
          pendingFitSceneKeyRef.current = null;
          api.refresh();
          return;
        } catch (error) {
          // Keep retrying until it succeeds (Excalidraw can throw during early mount).
          if (debugEnabled) {
            // eslint-disable-next-line no-console
            console.warn('[whiteboard] scrollToContent failed; retrying', error);
          }
        }
      }
      if (attempts >= maxAttempts) return;
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [debugEnabled]);

  const prepareInitialData = useCallback((scene: ExcalidrawInitialDataState): ExcalidrawInitialDataState => {
    const sceneAppState = (scene.appState ?? {}) as Partial<AppState>;
    const themeVars = extractFrontmatterThemeVariables(mermaidCode);
    const themedElements = applyMermaidThemeToExcalidrawElements((scene.elements ?? []) as unknown[], {
      backgroundColor: effectiveBackgroundColor ?? null,
      themeVariables: themeVars,
      uiTheme: theme,
    }) as unknown as ExcalidrawInitialDataState['elements'];
    return {
      ...scene,
      elements: themedElements,
      appState: {
        ...sceneAppState,
        ...EDITABLE_APPSTATE,
        theme: normalizeTheme(theme),
        viewBackgroundColor: effectiveBackgroundColor ?? sceneAppState.viewBackgroundColor,
      },
    };
  }, [effectiveBackgroundColor, mermaidCode, theme]);

  useEffect(() => {
    patchMermaidInitialize();
  }, []);

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    setSceneJsonForViewer(initialSceneJson ?? '');
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

    const signature = `${sceneMeta.mermaidHash}:${normalizeTheme(theme)}:${effectiveBackgroundColor ?? ''}`;
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
      backgroundColor: effectiveBackgroundColor,
      debug: debugEnabled,
    }).then((result) => {
      if (cancelled) return;
      if (buildId !== buildRunIdRef.current) return;
      setIsSceneBuilding(false);
      inFlightSignatureRef.current = '';
      if (!result) {
        setBuildError('buildSceneFromMermaidCode returned null');
        return;
      }
      setInitialDataState(prepareInitialData(result.scene));
      sceneMetaForSaveRef.current = { ...sceneMeta, generator: result.generator };
      setLastGenerator(result.generator);
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
      builtCounts: counts,
      bounds,
      sampleRect,
      sampleText,
      diagramTypeHint,
      svgChars: svgMarkup.trim() ? svgMarkup.length : 0,
      sceneKey,
      pendingFitKey: pendingFitSceneKeyRef.current,
    };
  }, [buildError, debugEnabled, diagramTypeHint, initialDataState, isSceneBuilding, lastGenerator, sceneKey, svgMarkup]);

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
    setSceneJsonForViewer(nextJson);
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
    if (!hasHadContentRef.current && elements.length === 0) {
      return;
    }

    if (elements.length > 0) {
      hasHadContentRef.current = true;
    }

    if (pendingFitSceneKeyRef.current === sceneKey && elements.length > 0 && apiRef.current) {
      scheduleFitToContent(apiRef.current, sceneKey);
    }

    const expectedBackground = effectiveBackgroundColor?.trim() ?? '';

    // Excalidraw calls onChange for selection/appState changes; don’t pay the
    // cost of serialization unless elements/files actually changed.
    const elementsVersion = elements.reduce((acc, el) => acc + (el?.version ?? 0), 0);
    const signature = `${elements.length}:${elementsVersion}:${Object.keys(files ?? {}).length}`;
    if (signature === lastSerializedSignatureRef.current) return;

    try {
      latestFilesRef.current = files ?? {};
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
  }, [api, effectiveBackgroundColor, sceneKey, scheduleAutosave, scheduleFitToContent]);

  const handleCopySceneJson = useCallback(async () => {
    const text = (latestJsonRef.current || sceneJsonForViewer || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without clipboard permissions.
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', 'true');
      el.style.position = 'fixed';
      el.style.left = '-10000px';
      el.style.top = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      }
      el.remove();
    }
  }, [sceneJsonForViewer]);

  const handleDownloadSceneFile = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements?.length) return;

    const bounds = (() => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let seen = 0;

      for (const el of elements as unknown as Array<Record<string, unknown>>) {
        if (!el || typeof el !== 'object') continue;
        if (el.isDeleted === true) continue;
        const x = typeof el.x === 'number' ? el.x : null;
        const y = typeof el.y === 'number' ? el.y : null;
        if (x === null || y === null) continue;

        const width = typeof el.width === 'number' ? el.width : null;
        const height = typeof el.height === 'number' ? el.height : null;
        if (width !== null && height !== null) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + width);
          maxY = Math.max(maxY, y + height);
          seen += 1;
          continue;
        }

        const pointsRaw = el.points;
        if (Array.isArray(pointsRaw)) {
          let pMinX = Number.POSITIVE_INFINITY;
          let pMinY = Number.POSITIVE_INFINITY;
          let pMaxX = Number.NEGATIVE_INFINITY;
          let pMaxY = Number.NEGATIVE_INFINITY;
          let pSeen = 0;
          for (const p of pointsRaw) {
            if (!Array.isArray(p) || p.length !== 2) continue;
            const px = typeof p[0] === 'number' ? p[0] : Number(p[0]);
            const py = typeof p[1] === 'number' ? p[1] : Number(p[1]);
            if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
            pMinX = Math.min(pMinX, px);
            pMinY = Math.min(pMinY, py);
            pMaxX = Math.max(pMaxX, px);
            pMaxY = Math.max(pMaxY, py);
            pSeen += 1;
          }
          if (pSeen > 0) {
            minX = Math.min(minX, x + pMinX);
            minY = Math.min(minY, y + pMinY);
            maxX = Math.max(maxX, x + pMaxX);
            maxY = Math.max(maxY, y + pMaxY);
            seen += 1;
          }
        }
      }

      if (seen === 0) return null;
      return { minX, minY, maxX, maxY };
    })();

    const centeredElements = (() => {
      if (!bounds) return elements;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const dx = -cx;
      const dy = -cy;

      return (elements as unknown as Array<Record<string, unknown>>).map((el) => {
        if (!el || typeof el !== 'object') return el as unknown as OrderedExcalidrawElement;
        if (el.isDeleted === true) return el as unknown as OrderedExcalidrawElement;
        const x = typeof el.x === 'number' ? el.x : null;
        const y = typeof el.y === 'number' ? el.y : null;
        if (x === null || y === null) return el as unknown as OrderedExcalidrawElement;
        return { ...el, x: x + dx, y: y + dy } as unknown as OrderedExcalidrawElement;
      });
    })();

    // For Excalidraw.com import we need the "local" JSON format, not "database".
    const files = (api.getFiles?.() ?? latestFilesRef.current ?? {}) as BinaryFiles;
    const appState = api.getAppState() as AppState;
    const rawJson = serializeAsJSON(
      centeredElements as unknown as readonly ExcalidrawElement[],
      {
        // Keep the exported file portable: don't persist viewport scroll/zoom,
        // otherwise Excalidraw.com may open it "blank" (content off-screen).
        theme: appState.theme,
        viewBackgroundColor: effectiveBackgroundColor?.trim() || appState.viewBackgroundColor,
      },
      files,
      'local'
    );

    const safeType = diagramTypeHint === 'unknown' ? 'diagram' : diagramTypeHint;
    const fileName = `${safeType}-${sceneMeta.mermaidHash}.excalidraw`;
    try {
      const blob = new Blob([rawJson], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, [diagramTypeHint, effectiveBackgroundColor, sceneMeta.mermaidHash]);

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
          if (api && pendingFitSceneKeyRef.current === sceneKey) {
            scheduleFitToContent(api, sceneKey);
          }
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

      <div className="absolute top-2 right-2 z-50 flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded border border-slate-300/40 bg-white/80 px-2 py-1 text-[12px] text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:border-slate-600/50 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900"
          onClick={() => setIsSceneJsonOpen(true)}
          title="Show Excalidraw scene JSON"
        >
          <Code2 className="h-3.5 w-3.5" />
          JSON
        </button>
      </div>

      {isSceneJsonOpen && (
        <div className="absolute inset-0 z-[60] flex flex-col bg-white/85 backdrop-blur dark:bg-slate-950/70">
          <div className="flex items-center justify-between gap-2 border-b border-slate-300/50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700/60 dark:text-slate-100">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              <span>Excalidraw scene JSON</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-slate-300/60 bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => void handleCopySceneJson()}
                title="Copy JSON"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-slate-300/60 bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={handleDownloadSceneFile}
                title="Download .excalidraw"
              >
                <Download className="h-3.5 w-3.5" />
                Save
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-slate-300/60 bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-900"
                onClick={() => setIsSceneJsonOpen(false)}
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </button>
            </div>
          </div>
          <textarea
            className="flex-1 min-h-0 w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-4 text-slate-800 outline-none dark:text-slate-100"
            readOnly
            value={(sceneJsonForViewer || latestJsonRef.current || '').trim()}
          />
        </div>
      )}

      {debugEnabled && (
        <div className="pointer-events-none absolute top-2 left-2 z-50 rounded border border-slate-300/40 bg-white/80 px-2 py-1 text-[11px] text-slate-700 dark:border-slate-600/50 dark:bg-slate-900/70 dark:text-slate-200">
          <div>Whiteboard: {debugOverlay?.status ?? 'idle'}</div>
          <div>sceneKey: {debugOverlay?.sceneKey ?? sceneKey} (pendingFit: {debugOverlay?.pendingFitKey ?? 'null'})</div>
          <div>type: {debugOverlay?.diagramTypeHint ?? diagramTypeHint}</div>
          <div>generator: {debugOverlay?.generator ?? lastGenerator}</div>
          <div>svg: {debugOverlay?.svgChars ? `${debugOverlay.svgChars} chars` : 'empty'}</div>
          {debugOverlay?.error ? <div>error: {debugOverlay.error}</div> : null}
          {debugOverlay?.builtCounts ? <div>built: {JSON.stringify(debugOverlay.builtCounts)}</div> : null}
          {debugOverlay?.bounds ? <div>bounds: {JSON.stringify(debugOverlay.bounds)}</div> : null}
          {debugOverlay?.sampleRect ? <div>rect: {JSON.stringify(debugOverlay.sampleRect)}</div> : null}
          {debugOverlay?.sampleText ? <div>text: {JSON.stringify(debugOverlay.sampleText)}</div> : null}
        </div>
      )}
    </div>
  );
};

export default DiagramWhiteboard;
