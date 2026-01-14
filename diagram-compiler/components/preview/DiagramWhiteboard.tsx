import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, convertToExcalidrawElements, Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import '@excalidraw/excalidraw/index.css';
import './diagram-whiteboard.css';
import mermaid from 'mermaid';
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

const toSvgDataUrl = (svg: string): DataURL => {
  // Prefer UTF-8 encoding to avoid base64/Unicode pitfalls.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` as DataURL;
};

const parseViewBox = (svg: string) => {
  const match = svg.match(/\bviewBox\s*=\s*["']\s*([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s*["']/i);
  if (!match) return null;
  const width = Number(match[3]);
  const height = Number(match[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
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

const convertForeignObjectsToText = (svgMarkup: string): string => {
  if (!svgMarkup.includes('foreignObject')) return svgMarkup;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgMarkup;

    const foreignObjects = Array.from(svgEl.querySelectorAll('foreignObject'));
    for (const foreignObject of foreignObjects) {
      const rawText = (foreignObject.textContent ?? '').replace(/\s+/g, ' ').trim();
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
      text.textContent = rawText;
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      // Keep labels readable on dark fills; Mermaid styles can override via CSS.
      text.setAttribute('fill', '#e7e7e7');
      text.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
      text.setAttribute('font-size', '14');

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

    // Wait one frame so layout/CTM are available.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const svgRect = svgEl.getBoundingClientRect();
    const width = Math.max(1, svgRect.width);
    const height = Math.max(1, svgRect.height);

    const toLocalPoint = (screenX: number, screenY: number) => ({
      x: screenX - svgRect.left,
      y: screenY - svgRect.top,
    });

    const elementsSkeleton: Array<Record<string, unknown>> = [];

    // Rectangles (nodes/containers).
    const rects = Array.from(svgEl.querySelectorAll('rect'));
    for (const rectEl of rects) {
      const bb = rectEl.getBoundingClientRect();
      const w = bb.width;
      const h = bb.height;
      if (!(w > 6 && h > 6)) continue;
      // Skip background-size rects.
      if (w >= width * 0.95 && h >= height * 0.95) continue;

      const p = toLocalPoint(bb.left, bb.top);
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

    // Text labels.
    const texts = Array.from(svgEl.querySelectorAll('text'));
    for (const textEl of texts) {
      const content = (textEl.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!content) continue;
      const bb = textEl.getBoundingClientRect();
      if (!(bb.width > 0 && bb.height > 0)) continue;
      const p = toLocalPoint(bb.left, bb.top);
      const fontSize = getSvgTextFontSize(textEl) ?? 16;
      const stroke = getSvgPaint(textEl, 'fill') ?? '#111827';

      elementsSkeleton.push({
        type: 'text',
        text: content,
        x: p.x,
        y: p.y,
        fontSize,
        strokeColor: stroke,
        locked: false,
      });
      if (elementsSkeleton.length > 2000) break;
    }

    // Lines (edges/relations). Prefer paths with stroke and no fill.
    const paths = Array.from(svgEl.querySelectorAll('path'));
    for (const pathEl of paths) {
      const d = pathEl.getAttribute('d') ?? '';
      if (!d.trim()) continue;
      const stroke = getSvgPaint(pathEl, 'stroke');
      const fill = getSvgPaint(pathEl, 'fill');
      if (!stroke || (fill && fill !== 'none')) continue;

      const points = parseSvgPathNumbers(d);
      if (points.length < 2) continue;

      const m = (pathEl as unknown as SVGGraphicsElement).getScreenCTM?.();
      if (!m) continue;
      const toScreen = (pt: { x: number; y: number }) => {
        const sp = new DOMPoint(pt.x, pt.y).matrixTransform(m);
        return toLocalPoint(sp.x, sp.y);
      };
      const screenPoints = points.map(toScreen);
      // Collapse to at most 20 points to keep the scene light.
      const step = Math.max(1, Math.floor(screenPoints.length / 20));
      const collapsed = screenPoints.filter((_, idx) => idx % step === 0);
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

    if (elementsSkeleton.length < 2) return null;

    const elements = convertToExcalidrawElements(elementsSkeleton as unknown as any, { regenerateIds: true }).map((el) => ({
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

const rasterizeSvgToPngDataUrl = async (args: {
  svgMarkup: string;
  width: number;
  height: number;
}): Promise<DataURL | null> => {
  try {
    const svgBlob = new Blob([args.svgMarkup], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.decoding = 'async';

    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });

    URL.revokeObjectURL(url);
    if (!loaded) return null;

    const canvas = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(args.width * dpr));
    canvas.height = Math.max(1, Math.floor(args.height * dpr));

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.drawImage(img, 0, 0, args.width, args.height);

    return canvas.toDataURL('image/png') as DataURL;
  } catch {
    return null;
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
    if (elements.length === 0 && filesCount === 0) return null;
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

const withMermaidInitializeGuard = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const originalInitialize = mermaid.initialize.bind(mermaid);
  const guardedInitialize: typeof mermaid.initialize = ((config: unknown) => {
    try {
      return originalInitialize(config as never);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // mermaid-to-excalidraw calls mermaid.initialize() on each parse. In Mermaid v11
      // this can throw if a diagram type was already registered, which would make
      // imports always fall back to a locked snapshot.
      if (message.includes('already registered')) return undefined as never;
      throw error;
    }
  }) as typeof mermaid.initialize;

  (mermaid.initialize as typeof mermaid.initialize) = guardedInitialize;
  try {
    return await fn();
  } finally {
    (mermaid.initialize as typeof mermaid.initialize) = originalInitialize;
  }
};

const buildSceneFromMermaidCode = async (args: {
  mermaidCode: string;
  svgMarkup: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
}): Promise<ExcalidrawInitialDataState | null> => {
  const definition = args.mermaidCode.trim();
  if (definition) {
    try {
      const { elements: skeletons, files } = await withMermaidInitializeGuard(() =>
        parseMermaidToExcalidraw(definition, {
          maxEdges: 2000,
          maxTextSize: 50000,
        })
      );
      const isGraphImage =
        skeletons?.length === 1
        && !!skeletons[0]
        && typeof skeletons[0] === 'object'
        && (skeletons[0] as { type?: unknown }).type === 'image';

      // For unsupported diagram types, the converter returns a single "image"
      // element (graphImage). Prefer exploding Mermaid's SVG into vector
      // elements so users can edit individual objects.
      if (isGraphImage) {
        const vectorScene = await buildSceneFromSvgVectors({
          svgMarkup: args.svgMarkup,
          theme: args.theme,
          backgroundColor: args.backgroundColor,
        });
        if (vectorScene) return vectorScene;
      }

      if (skeletons?.length && !isGraphImage) {
        const elements = convertToExcalidrawElements(skeletons).map((element) => ({
          ...element,
          locked: false,
          // Mermaid imports often use groupIds for convenience, but it makes the
          // scene feel "all-grouped" (hard to edit individual parts). Start
          // ungrouped; users can group manually if needed.
          groupIds: [] as unknown as typeof element.groupIds,
        }));
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
      }
    } catch {
      // Fall back to a rasterized SVG snapshot when conversion fails.
    }
  }

  const vectorFallback = await buildSceneFromSvgVectors({
    svgMarkup: args.svgMarkup,
    theme: args.theme,
    backgroundColor: args.backgroundColor,
  });
  if (vectorFallback) return vectorFallback;

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

  const measure = async (): Promise<{ width: number; height: number }> => {
    const fallback = parseViewBox(svg) ?? { width: 800, height: 600 };
    try {
      const container = document.createElement('div');
      container.setAttribute('style', 'opacity:0; position:fixed; left:-10000px; top:0; pointer-events:none;');
      container.innerHTML = svg;
      document.body.appendChild(container);
      const el = container.querySelector('svg');
      if (!el) {
        container.remove();
        return fallback;
      }
      // Wait one frame so the layout stabilizes.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const rect = el.getBoundingClientRect();
      container.remove();
      const width = rect.width > 0 ? rect.width : fallback.width;
      const height = rect.height > 0 ? rect.height : fallback.height;
      return { width: Math.max(1, width), height: Math.max(1, height) };
    } catch {
      return fallback;
    }
  };

  const { width, height } = await measure();

  // Excalidraw renders images onto a canvas. Mermaid SVGs often include
  // <foreignObject> labels which are unreliable/non-renderable on a canvas,
  // resulting in a blank image. Prefer a raster PNG snapshot for stability.
  const svgForImage = svg.includes('foreignObject') ? convertForeignObjectsToText(svg) : svg;
  const pngDataUrl = await rasterizeSvgToPngDataUrl({ svgMarkup: svgForImage, width, height });

  const fileId = `mermaid-svg-${Date.now()}` as BinaryFileData['id'];
  const file: BinaryFileData = {
    mimeType: pngDataUrl ? 'image/png' : 'image/svg+xml',
    id: fileId,
    dataURL: (pngDataUrl ?? toSvgDataUrl(svgForImage)) as DataURL,
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
  const effectiveBackgroundColor = useMemo(() => {
    const fromProp = backgroundColor?.trim() ?? '';
    if (fromProp) return fromProp;
    const vars = extractFrontmatterThemeVariables(mermaidCode);
    const fromVars = typeof vars?.background === 'string' ? vars.background.trim() : '';
    if (fromVars && fromVars !== 'transparent' && fromVars !== 'none') return fromVars;
    return extractMermaidSvgBackgroundColor(svgMarkup);
  }, [backgroundColor, mermaidCode, svgMarkup]);

  const lastSavedJsonRef = useRef<string>(initialSceneJson ?? '');
  const pendingSaveRef = useRef<number | null>(null);
  const latestJsonRef = useRef<string>(initialSceneJson ?? '');
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const didInitialFitRef = useRef(false);
  const hasHadContentRef = useRef(false);

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    onDirtyChange?.(false);
    didInitialFitRef.current = false;
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

  const initialData = useMemo(() => {
    const parsed = tryParseInitialScene(initialSceneJson);
    if (parsed) {
      const parsedAppState = (parsed.appState ?? {}) as Partial<AppState>;
      return {
        ...parsed,
        appState: {
          ...parsedAppState,
          theme: normalizeTheme(theme),
          viewBackgroundColor: effectiveBackgroundColor ?? parsedAppState.viewBackgroundColor,
        },
      } as ExcalidrawInitialDataState;
    }

    return async () =>
      buildSceneFromMermaidCode({
        mermaidCode,
        svgMarkup,
        theme,
        backgroundColor: effectiveBackgroundColor,
      });
  }, [effectiveBackgroundColor, initialSceneJson, mermaidCode, svgMarkup, theme]);

  const fitToContentIfNeeded = useCallback((animate: boolean) => {
    if (!api || didInitialFitRef.current) return;

    const elements = api.getSceneElements();
    if (elements.length === 0) return;

    didInitialFitRef.current = true;
    api.scrollToContent(elements, { fitToContent: true, animate, duration: animate ? 250 : 0 });
  }, [api]);

  useEffect(() => {
    if (!api) return;

    let cancelled = false;
    let raf = 0;

    const tick = () => {
      if (cancelled) return;
      fitToContentIfNeeded(false);
      if (!didInitialFitRef.current) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fitToContentIfNeeded]);

  useEffect(() => {
    if (!api) return;
    if (tryParseInitialScene(initialSceneJson)) return;
    if (!svgMarkup.trim()) return;

    const existing = api.getSceneElements();
    if (existing.length > 0) {
      fitToContentIfNeeded(false);
      return;
    }

    let cancelled = false;
    void buildSceneFromMermaidCode({ mermaidCode, svgMarkup, theme, backgroundColor }).then((scene) => {
      if (cancelled || !scene) return;

      const elements = (scene.elements ?? []) as readonly ExcalidrawElement[];
      const files = (scene.files ?? {}) as BinaryFiles;
      api.addFiles(Object.values(files));
      api.updateScene({
        elements,
        appState: {
          theme: normalizeTheme(theme),
          viewBackgroundColor: backgroundColor ?? undefined,
        },
      });

      requestAnimationFrame(() => fitToContentIfNeeded(false));
    });

    return () => {
      cancelled = true;
    };
  }, [api, backgroundColor, fitToContentIfNeeded, initialSceneJson, mermaidCode, svgMarkup, theme]);

  useEffect(() => {
    if (!api) return;
    const nextTheme = normalizeTheme(theme);
    const nextBackground = effectiveBackgroundColor ?? undefined;
    const apply = () => {
      const current = api.getAppState();
      if (current.theme === nextTheme && current.viewBackgroundColor === nextBackground) return;
      api.updateScene({
        appState: {
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
    }
  }, [onAutosave, onDirtyChange]);

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

    const expectedBackground = effectiveBackgroundColor?.trim() ?? '';
    if (expectedBackground && appState.viewBackgroundColor !== expectedBackground) {
      api?.updateScene({
        appState: {
          viewBackgroundColor: expectedBackground,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }

    const filesForSave = api?.getFiles?.() ?? files;
    const json = serializeAsJSON(
      elements as unknown as readonly ExcalidrawElement[],
      pickAppStateForSave({
        ...appState,
        viewBackgroundColor: expectedBackground || appState.viewBackgroundColor,
      }),
      filesForSave,
      'database'
    );
    scheduleAutosave(json);
  }, [api, effectiveBackgroundColor, scheduleAutosave]);

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
    <div className="diagram-whiteboard flex-1 min-h-0" style={containerStyle}>
      <Excalidraw
        initialData={initialData}
        theme={normalizeTheme(theme)}
        viewModeEnabled={false}
        zenModeEnabled={false}
        excalidrawAPI={(api) => {
          setApi(api);
          // Defer to the next frame so Excalidraw can finish initializing.
          requestAnimationFrame(() => fitToContentIfNeeded(false));
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
    </div>
  );
};

export default DiagramWhiteboard;
