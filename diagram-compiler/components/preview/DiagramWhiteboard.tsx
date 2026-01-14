import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
  const decoded = unescape(encodeURIComponent(svg));
  const base64 = btoa(decoded);
  return `data:image/svg+xml;base64,${base64}` as DataURL;
};

const parseViewBox = (svg: string) => {
  const match = svg.match(/\bviewBox\s*=\s*["']\s*([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s*["']/i);
  if (!match) return null;
  const width = Number(match[3]);
  const height = Number(match[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
};

const tryParseInitialScene = (sceneJson: string | null): ExcalidrawInitialDataState | null => {
  if (!sceneJson?.trim()) return null;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== 'excalidraw') return null;
    if (!Array.isArray(record.elements)) return null;
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
  const fileId = `mermaid-svg-${Date.now()}` as BinaryFileData['id'];
  const file: BinaryFileData = {
    mimeType: 'image/svg+xml',
    id: fileId,
    dataURL: toSvgDataUrl(svg),
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
    }], { regenerateIds: true }),
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
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    onDirtyChange?.(false);
    didInitialFitRef.current = false;
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
    const api = apiRef.current;
    if (!api || didInitialFitRef.current) return;

    const elements = api.getSceneElements();
    if (elements.length === 0) return;

    didInitialFitRef.current = true;
    api.scrollToContent(elements, { fitToContent: true, animate, duration: animate ? 250 : 0 });
  }, []);

  useEffect(() => {
    const api = apiRef.current;
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
    const api = apiRef.current;
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
  }, [backgroundColor, fitToContentIfNeeded, initialSceneJson, svgMarkup, theme]);

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
    const json = serializeAsJSON(elements as unknown as readonly ExcalidrawElement[], pickAppStateForSave(appState), files, 'database');
    scheduleAutosave(json);
  }, [scheduleAutosave]);

  return (
    <div className="flex-1 min-h-0">
      <Excalidraw
        initialData={initialData}
        theme={normalizeTheme(theme)}
        excalidrawAPI={(api) => {
          apiRef.current = api;
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
