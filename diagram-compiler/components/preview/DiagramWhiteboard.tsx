import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Excalidraw, convertToExcalidrawElements, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type Props = {
  theme: 'light' | 'dark';
  backgroundColor: string | null;
  mermaidCode: string;
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

const buildSceneFromMermaid = async (args: {
  mermaidCode: string;
  theme: 'light' | 'dark';
  backgroundColor: string | null;
}): Promise<ExcalidrawInitialDataState | null> => {
  const code = args.mermaidCode.trim();
  if (!code) return null;

  const result = await parseMermaidToExcalidraw(code, {
    startOnLoad: false,
    maxEdges: 3000,
    maxTextSize: 20000,
  });

  const elements = convertToExcalidrawElements(result.elements ?? [], { regenerateIds: true });
  const files = (result.files ?? {}) as BinaryFiles;

  return {
    type: 'excalidraw',
    version: 2,
    source: 'mermaid-langgraph',
    elements,
    files,
    appState: {
      theme: normalizeTheme(args.theme),
      viewBackgroundColor: args.backgroundColor ?? undefined,
    } as Partial<AppState>,
  } as unknown as ExcalidrawInitialDataState;
};

const AUTOSAVE_DEBOUNCE_MS = 1200;

const DiagramWhiteboard: React.FC<Props> = ({
  theme,
  backgroundColor,
  mermaidCode,
  initialSceneJson,
  onAutosave,
  onDirtyChange,
}) => {
  const lastSavedJsonRef = useRef<string>(initialSceneJson ?? '');
  const pendingSaveRef = useRef<number | null>(null);
  const latestJsonRef = useRef<string>(initialSceneJson ?? '');

  useEffect(() => {
    lastSavedJsonRef.current = initialSceneJson ?? '';
    latestJsonRef.current = initialSceneJson ?? '';
    onDirtyChange?.(false);
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
      return buildSceneFromMermaid({ mermaidCode, theme, backgroundColor });
    };
  }, [backgroundColor, initialSceneJson, mermaidCode, theme]);

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
