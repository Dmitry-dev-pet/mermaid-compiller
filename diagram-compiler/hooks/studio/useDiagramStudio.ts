import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAI } from '../core/useAI';
import { useMermaid } from '../core/useMermaid';
import { useLayout } from '../core/useLayout';
import { useChat } from '../core/useChat';
import { createStudioActions } from './studioActions';
import { useHistory } from '../core/useHistory';
import { useBuildDocs } from './useBuildDocs';
import { useMarkdownMermaid } from './useMarkdownMermaid';
import { useManualEditRecorder } from './useManualEditRecorder';
import { useInteractionRecorder } from './useInteractionRecorder';
import { usePromptPreview } from './usePromptPreview';
import { useNotebookChat, useNotebookChatView } from './useNotebookChat';
import { useProjects } from './useProjects';
import type { DiagramMarker } from '../core/useHistory';
import { DEFAULT_MERMAID_STATE } from '../../constants';
import type { DiagramIntent, DiagramType, DocsMode, EditorTab, MermaidState } from '../../types';
import {
  appendEmptyMermaidBlockToMarkdown,
  createMermaidNotebookMarkdown,
  detectMermaidDiagramType,
  isMarkdownLike,
} from '../../services/mermaidService';
import { trackAnalyticsEvent } from '../../services/analyticsService';
import { useNotebookBuild } from './useNotebookBuild';
import { useFixFlow } from './useFixFlow';

export const useDiagramStudio = () => {
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, toggleTheme, setAnalyzeLanguage, togglePreviewFullScreen } = useLayout();
  const { messages, setMessages, addMessage, clearMessages, resetMessages, getMessages } = useChat();
  const interactionRecorder = useInteractionRecorder();
  const {
    isHistoryReady,
    historySession,
    historyLoadResult,
    historySteps,
    appendTimeStep,
    updateCurrentRevision,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    selectDiagramStep,
    startNewSession,
    sessions,
    loadSession,
    renameHistorySession,
    saveSessionSettings,
    scheduleDeleteSession,
    undoDeleteSession,
    deleteUndoMs: historyDeleteUndoMs,
    loadSessionPreview,
    loadSessionSnapshot,
  } = useHistory();

  const [isProcessing, setIsProcessing] = useState(false);
  const [diagramIntent, setDiagramIntent] = useState<DiagramIntent | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('code');
  const [previewMermaidState, setPreviewMermaidState] = useState<MermaidState | null>(null);
  const previewCacheRef = useRef<Record<string, MermaidState>>({});
  const previewLoadingRef = useRef<Set<string>>(new Set());

  const isHydratingRef = useRef(true);
  const lastManualRecordedCodeRef = useRef<string>('');
  const diagramTypeWaitRef = useRef<{ target: DiagramType; resolve: () => void } | null>(null);
  const {
    buildDocsEntries,
    buildDocsSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    getDocsContext,
    getDocsSelectionSummary,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
    docsMode,
    setDocsMode,
    systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode,
    setBuildDocSelectionForMode,
  } = useBuildDocs(appState.diagramType);

  const {
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
  } = useMarkdownMermaid({
    code: mermaidState.code,
    editorTab,
    setEditorTab,
  });

  const safeAppendTimeStep = useCallback((args: Parameters<typeof appendTimeStep>[0]) => {
    return appendTimeStep(args).catch((e) => {
      console.error('Failed to record history step', e);
    });
  }, [appendTimeStep]);

  const notebookContext = useMemo(() => {
    const isEnabled = appState.isNotebookBuildEnabled;
    const hasBlocks = markdownMermaidBlocks.length > 0;
    const isMarkdownTab = editorTab === 'markdown_mermaid';
    return {
      isEnabled,
      hasBlocks,
      isMarkdownTab,
      isNotebookChatMode: isEnabled && isMarkdownTab && isMarkdownLike(mermaidState.code) && hasBlocks,
      isNotebookDiagramChat: isEnabled && isMarkdownTab && hasBlocks,
      isNotebookDataEnabled: isEnabled && hasBlocks,
      isNotebookChatEnabled: isEnabled && !isMarkdownTab,
    };
  }, [appState.isNotebookBuildEnabled, editorTab, markdownMermaidBlocks.length, mermaidState.code]);
  const {
    isNotebookChatMode,
    isNotebookDiagramChat,
    isNotebookDataEnabled,
    isNotebookChatEnabled,
  } = notebookContext;

  const getNotebookChatIndex = useCallback(() => {
    if (!isNotebookChatMode) return null;
    const index = typeof markdownMermaidActiveIndex === 'number' ? markdownMermaidActiveIndex : 0;
    return Math.max(0, Math.min(index, Math.max(0, markdownMermaidBlocks.length - 1)));
  }, [isNotebookChatMode, markdownMermaidActiveIndex, markdownMermaidBlocks.length]);

  const safeRecordTimeStep = useCallback((args: Parameters<typeof appendTimeStep>[0]) => {
    if (args.type === 'chat' && isNotebookChatMode) {
      const blockIndex = getNotebookChatIndex();
      if (blockIndex !== null) {
        return safeAppendTimeStep({
          ...args,
          meta: {
            ...args.meta,
            mode: 'notebook',
            blockIndex,
          },
        });
      }
    }
    return safeAppendTimeStep(args);
  }, [getNotebookChatIndex, isNotebookChatMode, safeAppendTimeStep]);

  const toggleScrollSync = useCallback(() => {
    setAppState((prev) => ({ ...prev, isScrollSyncEnabled: !prev.isScrollSyncEnabled }));
  }, [setAppState]);

  const setNotebookBuildEnabled = useCallback((enabled: boolean) => {
    setAppState((prev) => ({ ...prev, isNotebookBuildEnabled: enabled }));
  }, [setAppState]);

  const setNotebookBuildCount = useCallback((count: number | null) => {
    setAppState((prev) => ({ ...prev, notebookBuildCount: count }));
  }, [setAppState]);

  useEffect(() => {
    const pending = diagramTypeWaitRef.current;
    if (pending && appState.diagramType === pending.target) {
      diagramTypeWaitRef.current = null;
      pending.resolve();
    }
  }, [appState.diagramType]);

  const detectedDiagramType = useMemo(() => {
    if (editorTab === 'markdown_mermaid') {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex] ?? markdownMermaidBlocks[0];
      return activeBlock?.diagramType ?? detectMermaidDiagramType(activeBlock?.code ?? '');
    }
    if (editorTab !== 'code') return null;
    if (isMarkdownLike(mermaidState.code)) return null;
    return detectMermaidDiagramType(mermaidState.code);
  }, [editorTab, markdownMermaidActiveIndex, markdownMermaidBlocks, mermaidState.code]);

  useEffect(() => {
    if (!detectedDiagramType) return;
    if (editorTab !== 'code' && editorTab !== 'markdown_mermaid') return;
    if (editorTab === 'code' && mermaidState.source === 'compiled') return;
    if (detectedDiagramType !== appState.diagramType) {
      setDiagramType(detectedDiagramType);
    }
  }, [
    appState.diagramType,
    detectedDiagramType,
    editorTab,
    mermaidState.source,
    setDiagramType,
  ]);

  const resolveActiveMermaidContext = useCallback(() => {
    if (markdownMermaidBlocks.length) {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
      const diagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
      if (activeBlock) {
        return {
          code: activeBlock.code.trim(),
          errorMessage: diagnostics?.errorMessage,
          diagramType: activeBlock.diagramType ?? appState.diagramType,
          isValid: diagnostics?.isValid,
        };
      }
    }
    const rawCode = mermaidState.code.trim();
    if (isMarkdownLike(rawCode)) {
      return {
        code: '',
        errorMessage: undefined,
        diagramType: appState.diagramType,
        isValid: true,
      };
    }
    return {
      code: rawCode,
      errorMessage: mermaidState.errorMessage,
      diagramType: appState.diagramType,
      isValid: mermaidState.isValid,
    };
  }, [
    appState.diagramType,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    mermaidState.code,
    mermaidState.errorMessage,
    mermaidState.isValid,
  ]);

  const chatMessagesForView = useNotebookChatView({ isNotebookChatMode, messages });

  const {
    buildPromptPreview,
    promptPreviewByMode,
    resetPromptPreview,
    setPromptPreview,
  } = usePromptPreview({
    diagramType: appState.diagramType,
    analyzeLanguage: appState.analyzeLanguage ?? 'auto',
    appLanguage: appState.language ?? 'auto',
    isNotebookChatEnabled,
    messages: chatMessagesForView,
    diagramIntent,
    resolveActiveMermaidContext,
    getDocsContext,
  });

  const { buildDocsIntentText } = useNotebookChat({
    isNotebookChatMode,
    isNotebookDataEnabled,
    getNotebookChatIndex,
    markdownMermaidBlocksLength: markdownMermaidBlocks.length,
    markdownMermaidActiveIndex,
    historySteps,
    messages,
    setMessages,
    getMessages,
    diagramIntentContent: diagramIntent?.content ?? null,
    systemPrompt: promptPreviewByMode.chat?.systemPrompt ?? '',
    systemPromptRedacted: promptPreviewByMode.chat?.systemPromptRedacted ?? '',
    isSystemPromptRaw: systemPromptRawByMode.chat,
  });

  useEffect(() => {
    if (!historyLoadResult) return;

    setMessages((prev) => {
      const init = prev.find((m) => m.id === 'init');
      const loaded = historyLoadResult.messages.filter((m) => m.id !== 'init');
      return init ? [init, ...loaded] : loaded;
    });

    if (historyLoadResult.currentRevisionMermaid !== null) {
      const code = historyLoadResult.currentRevisionMermaid;
      const diag = historyLoadResult.currentRevisionDiagnostics;

      lastManualRecordedCodeRef.current = code;
      setMermaidState((prev) => ({
        ...prev,
        code,
        isValid: diag?.isValid ?? true,
        lastValidCode: diag?.isValid === false ? prev.lastValidCode : code,
        errorMessage: diag?.errorMessage,
        errorLine: diag?.errorLine,
        source: 'compiled',
        status: code.trim() ? ((diag?.isValid ?? true) ? 'valid' : 'invalid') : 'empty',
      }));
    } else {
      lastManualRecordedCodeRef.current = '';
      setMermaidState(DEFAULT_MERMAID_STATE);
    }

    isHydratingRef.current = false;
  }, [historyLoadResult, isNotebookChatMode, setMermaidState, setMessages]);

  useEffect(() => {
    if (!isHistoryReady) return;
    if (historyLoadResult) return;
    isHydratingRef.current = false;
  }, [historyLoadResult, isHistoryReady]);

  const {
    projects,
    activeProjectId,
    startNewProject,
    openProject,
    renameProject,
    removeProject,
    undoRemoveProject,
    deleteUndoMs: projectsUndoMs,
  } = useProjects({
    isProcessing,
    appState,
    setAppState,
    aiConfig,
    setAiConfig,
    historySession,
    sessions,
    startNewSession,
    loadSession,
    renameHistorySession,
    scheduleDeleteSession,
    undoDeleteSession,
    deleteUndoMs: historyDeleteUndoMs,
    saveSessionSettings,
    loadSessionPreview,
    loadSessionSnapshot,
    resetMessages,
    resetPromptPreview,
    setDiagramIntent,
    setEditorTab,
    setMermaidState,
    lastManualRecordedCodeRef,
    isHydratingRef,
  });

  const buildPreviewState = useCallback((snapshot: { code: string; diagnostics?: { isValid?: boolean; errorMessage?: string; errorLine?: number } | null }) => {
    const code = snapshot.code ?? '';
    const isValid = snapshot.diagnostics?.isValid ?? true;
    return {
      code,
      isValid,
      lastValidCode: isValid ? code : '',
      errorMessage: snapshot.diagnostics?.errorMessage,
      errorLine: snapshot.diagnostics?.errorLine,
      source: 'compiled',
      status: code.trim()
        ? (isValid ? 'valid' : 'invalid')
        : 'empty',
    } as MermaidState;
  }, []);

  const showProjectPreview = useCallback(async (sessionId: string) => {
    if (previewCacheRef.current[sessionId]) {
      setPreviewMermaidState(previewCacheRef.current[sessionId]);
      return;
    }
    if (previewLoadingRef.current.has(sessionId)) return;
    previewLoadingRef.current.add(sessionId);
    const snapshot = await loadSessionSnapshot(sessionId);
    previewLoadingRef.current.delete(sessionId);
    if (!snapshot) return;
    const nextState = buildPreviewState(snapshot);
    previewCacheRef.current[sessionId] = nextState;
    setPreviewMermaidState(nextState);
  }, [buildPreviewState, loadSessionSnapshot]);

  const clearProjectPreview = useCallback(() => {
    setPreviewMermaidState(null);
  }, []);

  useEffect(() => {
    if (editorTab !== 'build_docs') return;
    if (buildDocsEntries.length > 0) return;
    void loadBuildDocsEntries(appState.diagramType);
  }, [appState.diagramType, buildDocsEntries.length, editorTab, loadBuildDocsEntries]);


  useManualEditRecorder({
    isHistoryReady,
    isHydratingRef,
    isProcessing,
    mermaidState,
    lastManualRecordedCodeRef,
    historySessionCurrentRevisionId: historySession?.currentRevisionId,
    appendTimeStep,
    updateCurrentRevision,
  });

  const resolveMermaidUpdateTarget = useCallback(() => {
    if (markdownMermaidBlocks.length > 0) {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex] ?? markdownMermaidBlocks[0];
      if (activeBlock) return { mode: 'markdown' as const, block: activeBlock };
    }
    return { mode: 'code' as const };
  }, [markdownMermaidActiveIndex, markdownMermaidBlocks]);

  const startMarkdownNotebook = useCallback((args?: { blocks?: number }) => {
    if (isProcessing) return;

    const fallback = () => {
      const nextMarkdown = createMermaidNotebookMarkdown({ blocks: args?.blocks ?? 3 });
      handleMermaidChange(nextMarkdown);
      setMarkdownMermaidActiveIndex(0);
      setEditorTab('markdown_mermaid');
    };

    void (async () => {
      try {
        const res = await fetch('/diagram-notebook.md', { cache: 'no-cache' });
        if (!res.ok) return fallback();
        const template = await res.text();
        if (!template.trim()) return fallback();
        handleMermaidChange(template);
        setMarkdownMermaidActiveIndex(0);
        setEditorTab('markdown_mermaid');
      } catch {
        fallback();
      }
    })();
  }, [handleMermaidChange, isProcessing, setMarkdownMermaidActiveIndex]);

  const appendMarkdownMermaidBlock = useCallback(() => {
    if (isProcessing) return;
    const nextMarkdown = appendEmptyMermaidBlockToMarkdown(mermaidState.code);
    handleMermaidChange(nextMarkdown);
    setMarkdownMermaidActiveIndex(markdownMermaidBlocks.length);
    setEditorTab('markdown_mermaid');
  }, [
    handleMermaidChange,
    isProcessing,
    markdownMermaidBlocks.length,
    mermaidState.code,
    setMarkdownMermaidActiveIndex,
  ]);

  const setDiagramTypeAndWait = useCallback((target: DiagramType) => {
    if (appState.diagramType === target) return Promise.resolve();
    return new Promise<void>((resolve) => {
      diagramTypeWaitRef.current = { target, resolve };
      setDiagramType(target);
    });
  }, [appState.diagramType, setDiagramType]);

  const { handleNotebookBuild } = useNotebookBuild({
    aiConfig,
    appState,
    connectionState,
    messages,
    diagramIntent,
    addMessage,
    safeAppendTimeStep,
    setIsProcessing,
    setMarkdownMermaidActiveIndex,
    setEditorTab,
    setDiagramTypeAndWait,
    setMermaidState,
    getDocsContext,
    loadBuildDocsEntries,
  });

  const getAnalyticsContext = useCallback(async (mode: DocsMode) => {
    const docsUsage = await getDocsSelectionSummary(mode);
    const activeContext = resolveActiveMermaidContext();
    return {
      provider: aiConfig.provider,
      model: aiConfig.selectedModelId || null,
      modelParams: { temperature: 0.2 },
      modelFilters: aiConfig.filtersByProvider[aiConfig.provider] ?? null,
      diagramType: activeContext.diagramType ?? appState.diagramType,
      language: appState.language ?? null,
      analyzeLanguage: appState.analyzeLanguage ?? null,
      docsUsage,
    };
  }, [
    aiConfig.filtersByProvider,
    aiConfig.provider,
    aiConfig.selectedModelId,
    appState.analyzeLanguage,
    appState.diagramType,
    appState.language,
    getDocsSelectionSummary,
    resolveActiveMermaidContext,
  ]);

  const { handleChatMessage, handleBuildFromPrompt: baseHandleBuildFromPrompt, handleRecompile, handleFixSyntax: baseHandleFixSyntax, handleAnalyze } =
    createStudioActions({
      aiConfig,
      connectionState,
      appState,
      isNotebookChatEnabled,
      mermaidState,
      diagramIntent,
      setDiagramIntent,
      setMermaidState,
      addMessage,
      getMessages,
      getDiagramContextCode: () => resolveActiveMermaidContext().code,
      resolveMermaidUpdateTarget,
      getAnalyticsContext,
      trackAnalyticsEvent,
      getDocsContext,
      setIsProcessing,
      recordTimeStep: safeRecordTimeStep,
    });

  const { handleFixSyntax } = useFixFlow({
    aiConfig,
    appDiagramType: appState.diagramType,
    connectionStatus: connectionState.status,
    messages,
    mermaidState,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
    handleMermaidChange,
    addMessage,
    safeAppendTimeStep,
    getDocsContext,
    getAnalyticsContext,
    setIsProcessing,
    baseHandleFixSyntax,
  });

  const handleBuildFromPrompt = useCallback(async (text?: string) => {
    if (appState.isNotebookBuildEnabled && editorTab !== 'markdown_mermaid') {
      await handleNotebookBuild(text);
      return;
    }
    await baseHandleBuildFromPrompt(text);
  }, [appState.isNotebookBuildEnabled, baseHandleBuildFromPrompt, editorTab, handleNotebookBuild]);

  const handleManualSnapshot = useCallback(async () => {
    if (isProcessing) return;
    const code = mermaidState.code;
    if (!code.trim()) return;
    const activeDiagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
    const isMarkdownSnapshot = editorTab === 'markdown_mermaid';
    const isSnapshotInvalid = isMarkdownSnapshot
      ? activeDiagnostics?.isValid === false
      : !mermaidState.isValid;
    if (isSnapshotInvalid) return;
    lastManualRecordedCodeRef.current = code;

    await safeAppendTimeStep({
      type: 'manual_edit',
      messages: [],
      nextMermaid: {
        code,
        isValid: mermaidState.isValid,
        errorMessage: mermaidState.errorMessage,
        errorLine: mermaidState.errorLine,
      },
    });
  }, [
    editorTab,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    markdownMermaidActiveIndex,
    markdownMermaidDiagnostics,
    safeAppendTimeStep,
  ]);

  const goToDiagramStep = async (marker: Pick<DiagramMarker, 'stepId'> | string) => {
    const stepId = typeof marker === 'string' ? marker : marker.stepId;
    const revision = await selectDiagramStep(stepId);
    if (!revision) return;

    lastManualRecordedCodeRef.current = revision.mermaid;
    setMermaidState((prev) => ({
      ...prev,
      code: revision.mermaid,
      isValid: revision.diagnostics?.isValid ?? true,
      lastValidCode: revision.diagnostics?.isValid === false ? prev.lastValidCode : revision.mermaid,
      errorMessage: revision.diagnostics?.errorMessage,
      errorLine: revision.diagnostics?.errorLine,
      status: revision.mermaid.trim()
        ? (revision.diagnostics?.isValid ?? true)
          ? 'valid'
          : 'invalid'
        : 'empty',
      source: 'compiled',
    }));
  };


  const handleDiagramTypeChange = async (type: DiagramType) => {
    setDiagramType(type);
    setDiagramIntent(null);
    resetPromptPreview();
    setEditorTab('build_docs');
    void loadBuildDocsEntries(type);
  };

  return {
    aiConfig,
    setAiConfig,
    connectionState,
    mermaidState,
    messages: chatMessagesForView,
    setMessages, // Kept for compatibility if needed, though addMessage/clearMessages is preferred
    appState,
    setAppState,
    isProcessing,
    connectAI,
    disconnectAI,
    handleMermaidChange,
    handleChatMessage,
    handleBuildFromPrompt,
    handleRecompile,
    handleFixSyntax,
    handleAnalyze,
    handleManualSnapshot,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    projects,
    activeProjectId,
    diagramIntent,
    promptPreviewByMode,
    editorTab,
    buildDocsEntries,
    buildDocsSelection,
    toggleBuildDocSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    docsMode,
    setDocsMode,
    systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode,
    setBuildDocSelectionForMode,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
    detectedDiagramType,
    goToDiagramStep,
    startResize,
    setDiagramType: handleDiagramTypeChange,
    clearMessages,
    startNewProject,
    openProject,
    renameProject,
    removeProject,
    undoRemoveProject,
    deleteUndoMs: projectsUndoMs,
    loadSessionPreview,
    showProjectPreview,
    clearProjectPreview,
    previewMermaidState,
    toggleTheme,
    setAnalyzeLanguage,
    togglePreviewFullScreen,
    toggleScrollSync,
    setNotebookBuildEnabled,
    setNotebookBuildCount,
    isNotebookDiagramChat,
    buildDocsIntentText,
    buildPromptPreview,
    setPromptPreview,
    setEditorTab,
    startMarkdownNotebook,
    appendMarkdownMermaidBlock,
    interactionRecorder,
  };
};
