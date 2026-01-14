import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertToExcalidrawElements, Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
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
    return parsed as ExcalidrawInitialDataState;
  } catch {
    return null;
  }
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
      locked: true,
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
          viewBackgroundColor: backgroundColor ?? parsedAppState.viewBackgroundColor,
        },
      } as ExcalidrawInitialDataState;
    }

    return async () => {
      void mermaidCode;
      return buildSceneFromSvgMarkup({ svgMarkup, theme, backgroundColor });
    };
  }, [backgroundColor, initialSceneJson, mermaidCode, svgMarkup, theme]);

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
    void buildSceneFromSvgMarkup({ svgMarkup, theme, backgroundColor }).then((scene) => {
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
  }, [api, backgroundColor, fitToContentIfNeeded, initialSceneJson, svgMarkup, theme]);

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

    const filesForSave = api?.getFiles?.() ?? files;
    const json = serializeAsJSON(elements as unknown as readonly ExcalidrawElement[], pickAppStateForSave(appState), filesForSave, 'database');
    scheduleAutosave(json);
  }, [api, scheduleAutosave]);

  return (
    <div className="flex-1 min-h-0">
      <Excalidraw
        initialData={initialData}
        theme={normalizeTheme(theme)}
        excalidrawAPI={(api) => {
          setApi(api);
          // Defer to the next frame so Excalidraw can finish initializing.
          requestAnimationFrame(() => fitToContentIfNeeded(false));
        }}
        onChange={handleChange}
        UIOptions={{
          canvasActions: {
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
