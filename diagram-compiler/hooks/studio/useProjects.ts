import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { AIConfig, AppState, DiagramIntent, EditorTab, MermaidState, ModelParams } from '../../types';
import type { HistorySession, SessionPreview, SessionSettings, SessionSnapshot } from '../../services/history/types';
import { DEFAULT_MERMAID_STATE } from '../../constants';
import { applySessionSettings, buildSessionSettings } from '../../utils/sessionSettings';

type UseProjectsArgs = {
  isProcessing: boolean;
  appState: AppState;
  setAppState: Dispatch<SetStateAction<AppState>>;
  aiConfig: AIConfig;
  setAiConfig: Dispatch<SetStateAction<AIConfig>>;
  modelParams: ModelParams | null;
  setModelParams: Dispatch<SetStateAction<ModelParams | null>>;
  historySession: HistorySession | null;
  sessions: HistorySession[];
  startNewSession: (args?: { title?: string; settings?: SessionSettings }) => Promise<HistorySession>;
  loadSession: (sessionId: string) => Promise<unknown>;
  renameHistorySession: (sessionId: string, title: string) => Promise<HistorySession | null>;
  scheduleDeleteSession: (sessionId: string) => Promise<void>;
  undoDeleteSession: (sessionId: string) => void;
  deleteUndoMs: number;
  saveSessionSettings: (sessionId: string, settings: SessionSettings) => Promise<HistorySession | null>;
  loadSessionPreview: (sessionId: string) => Promise<SessionPreview | null>;
  loadSessionSnapshot: (sessionId: string) => Promise<SessionSnapshot | null>;
  resetMessages: () => void;
  resetPromptPreview: () => void;
  setDiagramIntent: Dispatch<SetStateAction<DiagramIntent | null>>;
  setEditorTab: Dispatch<SetStateAction<EditorTab>>;
  setMermaidState: Dispatch<SetStateAction<MermaidState>>;
  clearProjectPreview: () => void;
  lastManualRecordedCodeRef: MutableRefObject<string>;
  isHydratingRef: MutableRefObject<boolean>;
};

export const useProjects = ({
  isProcessing,
  appState,
  setAppState,
  aiConfig,
  setAiConfig,
  modelParams,
  setModelParams,
  historySession,
  sessions,
  startNewSession,
  loadSession,
  renameHistorySession,
  scheduleDeleteSession,
  undoDeleteSession,
  deleteUndoMs,
  saveSessionSettings,
  loadSessionPreview,
  loadSessionSnapshot,
  resetMessages,
  resetPromptPreview,
  setDiagramIntent,
  setEditorTab,
  setMermaidState,
  clearProjectPreview,
  lastManualRecordedCodeRef,
  isHydratingRef,
}: UseProjectsArgs) => {
  const skipNextSettingsSaveRef = useRef(false);

  useEffect(() => {
    const settings = historySession?.settings;
    if (!settings) return;
    skipNextSettingsSaveRef.current = true;
    applySessionSettings(settings, setAppState, setAiConfig, setModelParams);
  }, [historySession?.id, historySession?.settings, setAiConfig, setAppState, setModelParams]);

  useEffect(() => {
    if (!historySession?.id) return;
    if (skipNextSettingsSaveRef.current) {
      skipNextSettingsSaveRef.current = false;
      return;
    }
    const settings = buildSessionSettings(appState, aiConfig, modelParams ?? undefined);
    const timer = window.setTimeout(() => {
      saveSessionSettings(historySession.id, settings).catch((e) => {
        console.error('Failed to save session settings', e);
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [aiConfig, appState, historySession?.id, modelParams, saveSessionSettings]);

  const startNewProject = useCallback(async () => {
    if (isProcessing) return;
    clearProjectPreview();
    const nextAppState = { ...appState, diagramType: 'auto', notebookBuildCount: null };
    await startNewSession({ settings: buildSessionSettings(nextAppState, aiConfig, modelParams ?? undefined) });
    setAppState(nextAppState);
    resetMessages();
    lastManualRecordedCodeRef.current = '';
    setDiagramIntent(null);
    resetPromptPreview();
    setEditorTab('code');
    setMermaidState(DEFAULT_MERMAID_STATE);
  }, [
    aiConfig,
    appState,
    clearProjectPreview,
    isProcessing,
    lastManualRecordedCodeRef,
    resetMessages,
    resetPromptPreview,
    setAppState,
    setDiagramIntent,
    setEditorTab,
    setMermaidState,
    startNewSession,
    modelParams,
  ]);

  const openProject = useCallback(async (sessionId: string) => {
    if (isProcessing) return;
    if (historySession?.id === sessionId) return;
    clearProjectPreview();
    isHydratingRef.current = true;
    setDiagramIntent(null);
    resetPromptPreview();
    setEditorTab('code');
    await loadSession(sessionId);
  }, [
    clearProjectPreview,
    historySession?.id,
    isProcessing,
    isHydratingRef,
    loadSession,
    resetPromptPreview,
    setDiagramIntent,
    setEditorTab,
  ]);

  const renameProject = useCallback(async (sessionId: string, title: string) => {
    await renameHistorySession(sessionId, title);
  }, [renameHistorySession]);

  const removeProject = useCallback(async (sessionId: string) => {
    if (isProcessing) return;
    await scheduleDeleteSession(sessionId);
  }, [isProcessing, scheduleDeleteSession]);

  const undoRemoveProject = useCallback((sessionId: string) => {
    undoDeleteSession(sessionId);
  }, [undoDeleteSession]);

  return {
    projects: sessions,
    activeProjectId: historySession?.id ?? null,
    startNewProject,
    openProject,
    renameProject,
    removeProject,
    undoRemoveProject,
    deleteUndoMs,
    loadSessionPreview,
    loadSessionSnapshot,
  };
};
