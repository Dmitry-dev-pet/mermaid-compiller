import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { DiagramType } from '../../types';
import type { MermaidThemePresetId } from '../../utils/mermaidThemePreset';
import { MERMAID_THEME_PRESETS } from '../../utils/mermaidThemePreset';
import type { MermaidMarkdownBlock } from '../../services/mermaidService';
import { buildNotebookExcalidrawScene } from '../../services/excalidraw/notebookRibbonBuilder';
import { hashString } from '../../utils/hashString';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import { isDarkColor } from '../../services/excalidraw/excalidrawTheme';

const EXCALIDRAW_THEME_STORAGE_KEY = 'mlg.excalidrawThemeByDiagramKey.v1';
const EXCALIDRAW_CANVAS_BG_STORAGE_KEY = 'mlg.excalidrawCanvasBackgroundByDiagramKey.v1';

const readExcalidrawThemeFromSceneJson = (sceneJson: string | null | undefined): 'light' | 'dark' | null => {
  if (!sceneJson) return null;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const appState = record.appState;
    if (!appState || typeof appState !== 'object') return null;
    const theme = (appState as Record<string, unknown>).theme;
    return theme === 'dark' || theme === 'light' ? theme : null;
  } catch {
    return null;
  }
};

type UsePreviewWhiteboardArgs = {
  theme: 'light' | 'dark';
  appThemePresetId: MermaidThemePresetId;
  previewZoomPercent: number;
  onPreviewZoomPercentChange: (next: number) => void;
  onRequestPreviewZoomSync: (next: number) => void;
  previewMode: 'preview' | 'whiteboard';
  onPreviewModeChange: (next: 'preview' | 'whiteboard') => void;
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  activeDiagramType: DiagramType | null;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  mermaidCode: string;
  codeForRender: string;
  svgMarkup: string;
  historyRevisionId: string | null;
  whiteboardSceneJson: string | null;
  whiteboardBundleJson: string | null;
  previewBackgroundColor: string | null;
  selectedThemePreset: MermaidThemePresetId | null;
  isThemePresetMixed: boolean;
  onSaveWhiteboardSceneJson: (sceneJson: string | null) => Promise<unknown> | unknown;
};

export const usePreviewWhiteboard = ({
  theme,
  appThemePresetId,
  previewZoomPercent,
  onPreviewZoomPercentChange,
  onRequestPreviewZoomSync,
  previewMode,
  onPreviewModeChange,
  isBuildDocsMode,
  isMarkdownMode,
  activeDiagramType,
  markdownMermaidBlocks,
  mermaidCode,
  codeForRender,
  svgMarkup,
  historyRevisionId,
  whiteboardSceneJson,
  whiteboardBundleJson,
  previewBackgroundColor,
  selectedThemePreset,
  isThemePresetMixed,
  onSaveWhiteboardSceneJson,
}: UsePreviewWhiteboardArgs) => {
  const WHITEBOARD_SUPPORTED_TYPES = useMemo<Set<DiagramType>>(
    () => new Set(['flowchart', 'sequence', 'class']),
    []
  );
  const [whiteboardResetKey, setWhiteboardResetKey] = useState(0);
  const [isWhiteboardDirty, setIsWhiteboardDirty] = useState(false);
  const [whiteboardInitialSceneOverride, setWhiteboardInitialSceneOverride] = useState<string | null | undefined>(undefined);
  const [isWhiteboardAutoSync, setIsWhiteboardAutoSync] = useState(false);
  const [whiteboardZoomPercent, setWhiteboardZoomPercent] = useState(100);
  const [isNotebookExcalidrawMode, setIsNotebookExcalidrawMode] = useState(false);
  const [notebookExcalidrawScene, setNotebookExcalidrawScene] = useState<ExcalidrawInitialDataState | null>(null);
  const [excalidrawThemeByDiagramKey, setExcalidrawThemeByDiagramKey] = useState<Record<string, 'light' | 'dark'>>(() => {
    try {
      const raw = window.localStorage.getItem(EXCALIDRAW_THEME_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const record = parsed as Record<string, unknown>;
      const next: Record<string, 'light' | 'dark'> = {};
      for (const [key, value] of Object.entries(record)) {
        if (value === 'light' || value === 'dark') next[key] = value;
      }
      return next;
    } catch {
      return {};
    }
  });
  const [excalidrawCanvasBackgroundByDiagramKey, setExcalidrawCanvasBackgroundByDiagramKey] = useState<
    Record<string, { light?: string | null; dark?: string | null }>
  >(() => {
    try {
      const raw = window.localStorage.getItem(EXCALIDRAW_CANVAS_BG_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const record = parsed as Record<string, unknown>;
      const next: Record<string, { light?: string | null; dark?: string | null }> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const light = typeof v.light === 'string' ? v.light : (v.light === null ? null : undefined);
        const dark = typeof v.dark === 'string' ? v.dark : (v.dark === null ? null : undefined);
        if (light === undefined && dark === undefined) continue;
        next[key] = { ...(light !== undefined ? { light } : {}), ...(dark !== undefined ? { dark } : {}) };
      }
      return next;
    } catch {
      return {};
    }
  });

  const lastNotebookExcalidrawSignatureRef = useRef<string>('');
  const inFlightNotebookExcalidrawSignatureRef = useRef<string>('');
  const lastWhiteboardSourceRef = useRef<{ code: string; svg: string } | null>(null);

  const diagramThemeKey = useMemo(() => {
    const code = codeForRender.trim();
    if (code) return `diagram:${hashString(code)}`;
    const scene = whiteboardSceneJson?.trim();
    if (scene) return `whiteboard:${hashString(scene)}`;
    if (historyRevisionId) return `whiteboard:${historyRevisionId}`;
    return null;
  }, [codeForRender, historyRevisionId, whiteboardSceneJson]);

  const notebookThemeKey = useMemo(() => {
    const markdown = mermaidCode.trim();
    if (!markdown) return 'notebook:empty';
    return `notebook:${hashString(markdown)}`;
  }, [mermaidCode]);

  const preferredDiagramExcalidrawTheme = useMemo<'light' | 'dark'>(() => {
    if (!isThemePresetMixed && selectedThemePreset) {
      const preset = MERMAID_THEME_PRESETS.find((p) => p.id === selectedThemePreset);
      if (preset?.themeVariables?.darkMode === true) return 'dark';
      if (preset?.themeVariables?.darkMode === false) return 'light';
    }
    const vars = extractFrontmatterThemeVariables(codeForRender);
    if (typeof vars?.darkMode === 'boolean') return vars.darkMode ? 'dark' : 'light';
    if (typeof previewBackgroundColor === 'string' && previewBackgroundColor.trim()) {
      const dark = isDarkColor(previewBackgroundColor);
      if (dark !== null) return dark ? 'dark' : 'light';
    }
    return theme;
  }, [codeForRender, isThemePresetMixed, previewBackgroundColor, selectedThemePreset, theme]);

  const preferredNotebookExcalidrawTheme = useMemo<'light' | 'dark'>(() => {
    const presetId = !isThemePresetMixed && selectedThemePreset ? selectedThemePreset : appThemePresetId;
    const preset = MERMAID_THEME_PRESETS.find((p) => p.id === presetId);
    if (preset?.themeVariables?.darkMode === true) return 'dark';
    if (preset?.themeVariables?.darkMode === false) return 'light';
    const vars = extractFrontmatterThemeVariables(mermaidCode);
    if (typeof vars?.darkMode === 'boolean') return vars.darkMode ? 'dark' : 'light';
    if (typeof previewBackgroundColor === 'string' && previewBackgroundColor.trim()) {
      const dark = isDarkColor(previewBackgroundColor);
      if (dark !== null) return dark ? 'dark' : 'light';
    }
    return theme;
  }, [appThemePresetId, isThemePresetMixed, mermaidCode, previewBackgroundColor, selectedThemePreset, theme]);

  const excalidrawTheme = useMemo<'light' | 'dark'>(() => {
    const stored = diagramThemeKey ? excalidrawThemeByDiagramKey[diagramThemeKey] : undefined;
    const fromScene = readExcalidrawThemeFromSceneJson(whiteboardSceneJson);
    return stored ?? fromScene ?? preferredDiagramExcalidrawTheme;
  }, [diagramThemeKey, excalidrawThemeByDiagramKey, preferredDiagramExcalidrawTheme, whiteboardSceneJson]);

  const notebookExcalidrawTheme = useMemo<'light' | 'dark'>(() => {
    return excalidrawThemeByDiagramKey[notebookThemeKey] ?? preferredNotebookExcalidrawTheme;
  }, [excalidrawThemeByDiagramKey, notebookThemeKey, preferredNotebookExcalidrawTheme]);

  const diagramCanvasBackgroundByTheme = useMemo(() => {
    return diagramThemeKey ? (excalidrawCanvasBackgroundByDiagramKey[diagramThemeKey] ?? null) : null;
  }, [diagramThemeKey, excalidrawCanvasBackgroundByDiagramKey]);

  const notebookCanvasBackgroundByTheme = useMemo(() => {
    return excalidrawCanvasBackgroundByDiagramKey[notebookThemeKey] ?? null;
  }, [excalidrawCanvasBackgroundByDiagramKey, notebookThemeKey]);

  const isWhiteboardSupported = Boolean(activeDiagramType && WHITEBOARD_SUPPORTED_TYPES.has(activeDiagramType));
  const canWhiteboard = Boolean(
    !isBuildDocsMode
    && !isMarkdownMode
    && isWhiteboardSupported
    && svgMarkup.trim().length > 0
    && historyRevisionId
  );

  const canNotebookExcalidraw = Boolean(
    !isBuildDocsMode
    && isMarkdownMode
    && markdownMermaidBlocks.length > 0
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(EXCALIDRAW_THEME_STORAGE_KEY, JSON.stringify(excalidrawThemeByDiagramKey));
    } catch {
      // ignore
    }
  }, [excalidrawThemeByDiagramKey]);

  useEffect(() => {
    if (!diagramThemeKey) return;
    setExcalidrawThemeByDiagramKey((prev) => {
      if (prev[diagramThemeKey]) return prev;
      return { ...prev, [diagramThemeKey]: preferredDiagramExcalidrawTheme };
    });
  }, [diagramThemeKey, preferredDiagramExcalidrawTheme]);

  useEffect(() => {
    if (!diagramThemeKey) return;
    setExcalidrawThemeByDiagramKey((prev) => {
      const current = prev[diagramThemeKey];
      if (!current) return prev;
      if (current === preferredDiagramExcalidrawTheme) return prev;
      if (current !== theme) return prev;
      return { ...prev, [diagramThemeKey]: preferredDiagramExcalidrawTheme };
    });
  }, [diagramThemeKey, preferredDiagramExcalidrawTheme, theme]);

  useEffect(() => {
    const key = notebookThemeKey;
    setExcalidrawThemeByDiagramKey((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: preferredNotebookExcalidrawTheme };
    });
  }, [notebookThemeKey, preferredNotebookExcalidrawTheme]);

  useEffect(() => {
    const key = notebookThemeKey;
    setExcalidrawThemeByDiagramKey((prev) => {
      const current = prev[key];
      if (!current) return prev;
      if (current === preferredNotebookExcalidrawTheme) return prev;
      if (current !== theme) return prev;
      return { ...prev, [key]: preferredNotebookExcalidrawTheme };
    });
  }, [notebookThemeKey, preferredNotebookExcalidrawTheme, theme]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EXCALIDRAW_CANVAS_BG_STORAGE_KEY,
        JSON.stringify(excalidrawCanvasBackgroundByDiagramKey)
      );
    } catch {
      // ignore
    }
  }, [excalidrawCanvasBackgroundByDiagramKey]);

  useEffect(() => {
    if (!diagramThemeKey) return;
    const fromScene = readExcalidrawThemeFromSceneJson(whiteboardSceneJson);
    if (!fromScene) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExcalidrawThemeByDiagramKey((prev) => {
      if (prev[diagramThemeKey] === fromScene) return prev;
      if (prev[diagramThemeKey]) return prev;
      return { ...prev, [diagramThemeKey]: fromScene };
    });
  }, [diagramThemeKey, whiteboardSceneJson]);

  useEffect(() => {
    if (isNotebookExcalidrawMode && !canNotebookExcalidraw) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsNotebookExcalidrawMode(false);
    }
  }, [canNotebookExcalidraw, isNotebookExcalidrawMode]);

  useEffect(() => {
    if (previewMode === 'whiteboard' && !canWhiteboard) {
      onPreviewModeChange('preview');
    }
  }, [canWhiteboard, onPreviewModeChange, previewMode]);

  useEffect(() => {
    if (!isNotebookExcalidrawMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotebookExcalidrawScene(null);
      lastNotebookExcalidrawSignatureRef.current = '';
      inFlightNotebookExcalidrawSignatureRef.current = '';
      return;
    }
    if (!isMarkdownMode || isBuildDocsMode) return;
    if (!markdownMermaidBlocks.length) {
      setNotebookExcalidrawScene(null);
      return;
    }

    let cancelled = false;
    const markdownHash = hashString(mermaidCode.trim());
    const blocksHash = hashString(markdownMermaidBlocks.map((b) => b.code.trim()).join('\n---\n'));
    const whiteboardHash = hashString(whiteboardBundleJson?.trim() ?? '');
    const basePresetId = (!isThemePresetMixed && selectedThemePreset) ? selectedThemePreset : appThemePresetId;
    const signature = `${notebookExcalidrawTheme}:${previewBackgroundColor ?? ''}:${String(basePresetId)}:${markdownHash}:${blocksHash}:${whiteboardHash}`;
    if (signature === lastNotebookExcalidrawSignatureRef.current) return;
    if (signature === inFlightNotebookExcalidrawSignatureRef.current) return;
    inFlightNotebookExcalidrawSignatureRef.current = signature;

    const timer = window.setTimeout(() => {
      void (async () => {
        const nextScene = await buildNotebookExcalidrawScene({
          mermaidCode,
          markdownBlocks: markdownMermaidBlocks,
          theme: notebookExcalidrawTheme,
          basePresetId,
          previewBackgroundColor,
          whiteboardBundleJson,
          shouldCancel: () => cancelled,
        });
        if (cancelled) return;
        if (!nextScene) {
          setNotebookExcalidrawScene(null);
          return;
        }

        setNotebookExcalidrawScene(nextScene);
        lastNotebookExcalidrawSignatureRef.current = signature;
        inFlightNotebookExcalidrawSignatureRef.current = '';
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (inFlightNotebookExcalidrawSignatureRef.current === signature) {
        inFlightNotebookExcalidrawSignatureRef.current = '';
      }
    };
  }, [
    notebookExcalidrawTheme,
    isBuildDocsMode,
    isMarkdownMode,
    isNotebookExcalidrawMode,
    isThemePresetMixed,
    mermaidCode,
    markdownMermaidBlocks,
    previewBackgroundColor,
    selectedThemePreset,
    appThemePresetId,
    whiteboardBundleJson,
  ]);

  const handleToggleWhiteboard = useCallback(() => {
    setIsWhiteboardDirty(false);
    setWhiteboardInitialSceneOverride(undefined);
    if (previewMode === 'whiteboard') {
      onRequestPreviewZoomSync(whiteboardZoomPercent);
      onPreviewZoomPercentChange(whiteboardZoomPercent);
      onPreviewModeChange('preview');
      return;
    }
    setWhiteboardZoomPercent(previewZoomPercent);
    onPreviewModeChange('whiteboard');
  }, [
    onPreviewModeChange,
    onPreviewZoomPercentChange,
    onRequestPreviewZoomSync,
    previewMode,
    previewZoomPercent,
    whiteboardZoomPercent,
  ]);

  const pinnedMode = useMemo<'mermaid' | 'ed'>(() => {
    if (isBuildDocsMode) return 'mermaid';
    if (isMarkdownMode) return isNotebookExcalidrawMode ? 'ed' : 'mermaid';
    return previewMode === 'whiteboard' ? 'ed' : 'mermaid';
  }, [isBuildDocsMode, isMarkdownMode, isNotebookExcalidrawMode, previewMode]);

  const pinnedCanEd = useMemo(() => {
    if (isBuildDocsMode) return false;
    if (isMarkdownMode) return canNotebookExcalidraw;
    return canWhiteboard;
  }, [canNotebookExcalidraw, canWhiteboard, isBuildDocsMode, isMarkdownMode]);

  const pinnedDirty = useMemo(() => {
    if (isBuildDocsMode) return false;
    if (isMarkdownMode) return false;
    return isWhiteboardDirty;
  }, [isBuildDocsMode, isMarkdownMode, isWhiteboardDirty]);

  const pinnedEdDisabledReason = useMemo(() => {
    if (pinnedCanEd) return null;
    if (isBuildDocsMode) return 'ED is disabled in Prompts';
    if (isMarkdownMode) return 'ED is unavailable in this view';
    return 'ED is unavailable for this diagram';
  }, [isBuildDocsMode, isMarkdownMode, pinnedCanEd]);

  const handlePinnedSetMode = useCallback((next: 'mermaid' | 'ed') => {
    if (next === pinnedMode) return;
    if (next === 'ed' && !pinnedCanEd) return;
    if (isBuildDocsMode) return;
    if (isMarkdownMode) {
      setIsNotebookExcalidrawMode(next === 'ed');
      return;
    }
    handleToggleWhiteboard();
  }, [handleToggleWhiteboard, isBuildDocsMode, isMarkdownMode, pinnedCanEd, pinnedMode]);

  const handleToggleNotebookExcalidraw = useCallback(() => {
    setIsNotebookExcalidrawMode((value) => !value);
  }, []);

  const handleSetExcalidrawTheme = useCallback((nextTheme: 'light' | 'dark') => {
    const key = diagramThemeKey;
    if (!key) return;
    setExcalidrawThemeByDiagramKey((prev) => (prev[key] === nextTheme ? prev : { ...prev, [key]: nextTheme }));
  }, [diagramThemeKey]);

  const handleSetNotebookExcalidrawTheme = useCallback((nextTheme: 'light' | 'dark') => {
    const key = notebookThemeKey;
    setExcalidrawThemeByDiagramKey((prev) => (prev[key] === nextTheme ? prev : { ...prev, [key]: nextTheme }));
  }, [notebookThemeKey]);

  const handleSetDiagramCanvasBackgroundByTheme = useCallback((next: { light: string | null; dark: string | null }) => {
    if (!diagramThemeKey) return;
    const key = diagramThemeKey;
    setExcalidrawCanvasBackgroundByDiagramKey((prev) => {
      const current = prev[key] ?? {};
      if (current.light === next.light && current.dark === next.dark) return prev;
      return { ...prev, [key]: { light: next.light, dark: next.dark } };
    });
  }, [diagramThemeKey]);

  const handleSetNotebookCanvasBackgroundByTheme = useCallback((next: { light: string | null; dark: string | null }) => {
    const key = notebookThemeKey;
    setExcalidrawCanvasBackgroundByDiagramKey((prev) => {
      const current = prev[key] ?? {};
      if (current.light === next.light && current.dark === next.dark) return prev;
      return { ...prev, [key]: { light: next.light, dark: next.dark } };
    });
  }, [notebookThemeKey]);

  const handleWhiteboardSyncFromCode = useCallback(() => {
    if (!canWhiteboard) return;
    const ok = window.confirm('Sync from Mermaid code?\n\nThis will overwrite the current whiteboard scene.');
    if (!ok) return;
    setIsWhiteboardDirty(false);
    setWhiteboardInitialSceneOverride(null);
    void Promise.resolve(onSaveWhiteboardSceneJson(null)).catch(() => {});
    setWhiteboardResetKey((v) => v + 1);
  }, [canWhiteboard, onSaveWhiteboardSceneJson]);

  useEffect(() => {
    const snapshot = { code: codeForRender, svg: svgMarkup };
    const prev = lastWhiteboardSourceRef.current;
    lastWhiteboardSourceRef.current = snapshot;

    if (!canWhiteboard || previewMode !== 'whiteboard') return;
    if (!prev) return;
    if (prev.code === snapshot.code && prev.svg === snapshot.svg) return;
    if (!snapshot.svg.trim()) return;

    if (!isWhiteboardAutoSync && isWhiteboardDirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsWhiteboardDirty(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhiteboardInitialSceneOverride(null);
    void Promise.resolve(onSaveWhiteboardSceneJson(null)).catch(() => {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhiteboardResetKey((v) => v + 1);
  }, [
    canWhiteboard,
    codeForRender,
    isWhiteboardAutoSync,
    isWhiteboardDirty,
    onSaveWhiteboardSceneJson,
    previewMode,
    svgMarkup,
  ]);

  return {
    preferredDiagramExcalidrawTheme,
    preferredNotebookExcalidrawTheme,
    isNotebookExcalidrawMode,
    setIsNotebookExcalidrawMode,
    notebookExcalidrawScene,
    excalidrawTheme,
    notebookExcalidrawTheme,
    diagramCanvasBackgroundByTheme,
    notebookCanvasBackgroundByTheme,
    whiteboardResetKey,
    isWhiteboardDirty,
    setIsWhiteboardDirty,
    isWhiteboardAutoSync,
    setIsWhiteboardAutoSync,
    whiteboardInitialSceneOverride,
    whiteboardZoomPercent,
    setWhiteboardZoomPercent,
    canWhiteboard,
    canNotebookExcalidraw,
    pinnedMode,
    pinnedCanEd,
    pinnedDirty,
    pinnedEdDisabledReason,
    handleToggleWhiteboard,
    handleToggleNotebookExcalidraw,
    handlePinnedSetMode,
    handleSetExcalidrawTheme,
    handleSetNotebookExcalidrawTheme,
    handleSetDiagramCanvasBackgroundByTheme,
    handleSetNotebookCanvasBackgroundByTheme,
    handleWhiteboardSyncFromCode,
  };
};
