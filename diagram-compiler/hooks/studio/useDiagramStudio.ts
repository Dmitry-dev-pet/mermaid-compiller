import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAI } from '../core/useAI';
import { useMermaid } from '../core/useMermaid';
import { useLayout } from '../core/useLayout';
import { useChat } from '../core/useChat';
import { createStudioActions } from './studioActions';
import { useHistory } from '../core/useHistory';
import { getRevision } from '../../services/history/store';
import { useBuildDocs } from './useBuildDocs';
import { useMarkdownMermaid } from './useMarkdownMermaid';
import { useOperationLog } from './useOperationLog';
import { useManualEditRecorder } from './useManualEditRecorder';
import { usePromptPreview } from './usePromptPreview';
import { useNotebookChat, useNotebookChatView } from './useNotebookChat';
import { useProjects } from './useProjects';
import type { DiagramMarker } from '../core/useHistory';
import { DEFAULT_MERMAID_STATE } from '../../constants';
import type { DiagramIntent, DiagramType, DocsMode, EditorTab, MermaidState, ModelParams, Message } from '../../types';
import {
  appendEmptyMermaidBlockToMarkdown,
  createMermaidNotebookMarkdown,
  detectMermaidDiagramType,
  extractMermaidBlocksFromMarkdown,
  isMarkdownLike,
} from '../../services/mermaidService';
import { trackAnalyticsEvent as trackAnalyticsEventService } from '../../services/analyticsService';
import { createAnalyticsAdapter } from '../../services/analyticsAdapter';
import { useNotebookBuild } from './useNotebookBuild';
import { useFixFlow } from './useFixFlow';
import { useNotebookContext } from './useNotebookContext';
import { MAIN_CHAT_CONTEXT_ID, resolveChatContextId, resolveOperationLogContextId } from '../../utils/contextIds';
import type { LLMRequestStartNotice } from '../../services/llmRequestRunner';
import {
  ensureWhiteboardBundle,
  resolveWhiteboardSceneForBlock,
  updateWhiteboardBundleForBlock,
} from '../../services/history/whiteboardBundle';

export const useDiagramStudio = () => {
  const [activeLLMRequest, setActiveLLMRequest] = useState<LLMRequestStartNotice | null>(null);
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, setMainDiagramTypes, setThemePreset, toggleTheme, setAnalyzeLanguage, setLLMTimeoutMs, togglePreviewFullScreen } = useLayout();
  const {
    messages,
    setMessages,
    setMessagesForContext,
    addMessage,
    clearMessages,
    resetMessages,
    getMessages,
    getMessagesForContext,
    activeContextId,
    setActiveContextId,
  } = useChat();
  const [modelParams, setModelParams] = useState<ModelParams | null>(null);
  const {
    isHistoryReady,
    historySession,
    historyLoadResult,
    historySteps,
    appendTimeStep,
    updateCurrentRevision,
    updateCurrentRevisionWhiteboard,
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
  const [diagramIntentByContext, setDiagramIntentByContext] = useState<Record<string, DiagramIntent | null>>({});
  const [editorTab, setEditorTab] = useState<EditorTab>('code');
  const [buildDocsScope, setBuildDocsScope] = useState<'notebook' | 'diagram'>('notebook');
  const prevEditorTabRef = useRef<EditorTab>('code');
  const nextBuildDocsScopeRef = useRef<'notebook' | 'diagram' | null>(null);
  const prevBuildDocsScopeRef = useRef<'notebook' | 'diagram'>('notebook');
  const [previewMermaidState, setPreviewMermaidState] = useState<MermaidState | null>(null);
  const previewCacheRef = useRef<Record<string, MermaidState>>({});
  const previewLoadingRef = useRef<Set<string>>(new Set());
  const [whiteboardSceneJson, setWhiteboardSceneJson] = useState<string | null>(null);
  const [whiteboardBundleJson, setWhiteboardBundleJson] = useState<string | null>(null);
  const whiteboardRawRef = useRef<string | null>(null);

  const isHydratingRef = useRef(true);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const hydratedRevisionIdRef = useRef<string | null>(null);
  const seededNotebookSessionIdsRef = useRef<Set<string>>(new Set());
  const lastManualRecordedCodeRef = useRef<string>('');
  const diagramTypeWaitRef = useRef<{ target: DiagramType; resolve: () => void } | null>(null);
  const clearProjectPreview = useCallback(() => {
    setPreviewMermaidState(null);
  }, []);

  const setNextBuildDocsScope = useCallback((scope: 'notebook' | 'diagram' | null) => {
    if (!scope) {
      nextBuildDocsScopeRef.current = null;
      return;
    }
    if (editorTab === 'build_docs') {
      setBuildDocsScope(scope);
      return;
    }
    nextBuildDocsScopeRef.current = scope;
  }, [editorTab, setBuildDocsScope]);

  useLayoutEffect(() => {
    const prev = prevEditorTabRef.current;
    if (editorTab === 'build_docs' && prev !== 'build_docs') {
      const override = nextBuildDocsScopeRef.current;
      if (override) {
        setBuildDocsScope(override);
        nextBuildDocsScopeRef.current = null;
      } else {
        setBuildDocsScope(prev === 'markdown_mermaid' ? 'diagram' : 'notebook');
      }
    }
    prevEditorTabRef.current = editorTab;
  }, [editorTab]);

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

  const resolveWhiteboardSceneForActiveContext = useCallback((raw: string | null): string | null => {
    const isMarkdownBlock = markdownMermaidBlocks.length > 0;
    if (!isMarkdownBlock) return raw?.trim() ? raw : null;
    return resolveWhiteboardSceneForBlock(raw, markdownMermaidActiveIndex);
  }, [markdownMermaidActiveIndex, markdownMermaidBlocks.length]);

  const {
    operationLogs,
    activeOperationLog,
    setOperationLogs,
    startOperation,
    addOperationEvent,
    finishOperation,
    getOperationLog,
    hydrateOperationLogs,
  } = useOperationLog();

  const notebookContext = useNotebookContext({
    editorTab,
    buildDocsScope,
    mermaidCode: mermaidState.code,
    markdownBlocksLength: markdownMermaidBlocks.length,
  });
  const {
    isNotebookChatMode,
    isNotebookDataEnabled,
    isNotebookChatEnabled,
  } = notebookContext;

  const getNotebookChatIndex = useCallback(() => {
    if (!isNotebookChatMode) return null;
    const index = typeof markdownMermaidActiveIndex === 'number' ? markdownMermaidActiveIndex : 0;
    return Math.max(0, Math.min(index, Math.max(0, markdownMermaidBlocks.length - 1)));
  }, [isNotebookChatMode, markdownMermaidActiveIndex, markdownMermaidBlocks.length]);

  const activeChatContextId = useMemo(() => {
    return resolveChatContextId(isNotebookChatMode, getNotebookChatIndex());
  }, [getNotebookChatIndex, isNotebookChatMode]);

  useEffect(() => {
    if (activeContextId !== activeChatContextId) {
      setActiveContextId(activeChatContextId);
    }
  }, [activeChatContextId, activeContextId, setActiveContextId]);

  const safeAppendTimeStep = useCallback((args: Parameters<typeof appendTimeStep>[0]) => {
    const nextMeta = { ...(args.meta ?? {}) } as Record<string, unknown>;
    const isNotebookScope =
      isNotebookChatMode
      && (args.type === 'build' || args.type === 'chat' || args.type === 'analyze');
    if (typeof nextMeta.contextId !== 'string') {
      if (nextMeta.mode === 'notebook' && typeof nextMeta.blockIndex === 'number') {
        nextMeta.contextId = `block:${nextMeta.blockIndex}`;
      } else {
        nextMeta.contextId = activeChatContextId;
      }
    }
    if (!('mode' in nextMeta)) {
      nextMeta.mode = isNotebookScope
        ? 'notebook'
        : isMarkdownLike(mermaidState.code)
          ? 'markdown'
          : 'mermaid';
    }
    if (
      (isNotebookScope || editorTab === 'markdown_mermaid')
      && typeof nextMeta.blockIndex !== 'number'
      && markdownMermaidBlocks.length > 0
    ) {
      nextMeta.blockIndex = Math.max(0, Math.min(markdownMermaidActiveIndex, markdownMermaidBlocks.length - 1));
      nextMeta.totalBlocks = markdownMermaidBlocks.length;
    }
    return appendTimeStep({ ...args, meta: nextMeta }).catch((e) => {
      console.error('Failed to record history step', e);
    });
  }, [
    activeChatContextId,
    appendTimeStep,
    editorTab,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks.length,
    mermaidState.code,
    isNotebookChatMode,
  ]);

  const startOperationForContext = useCallback(
    (title: string, contextId?: string) => startOperation(title, contextId ?? activeChatContextId),
    [activeChatContextId, startOperation]
  );

  const addMessageForActiveContext = useCallback(
    (role: Message['role'], content: string, mode?: Message['mode']) =>
      addMessage(role, content, mode, activeChatContextId),
    [activeChatContextId, addMessage]
  );

  const getMessagesForActiveContext = useCallback(
    () => getMessages(activeChatContextId),
    [activeChatContextId, getMessages]
  );

  const activeMessages =
    activeContextId === activeChatContextId
      ? messages
      : getMessagesForContext(activeChatContextId);

  const diagramIntent = useMemo(
    () => diagramIntentByContext[activeChatContextId] ?? null,
    [activeChatContextId, diagramIntentByContext]
  );

  const setDiagramIntentForActiveContext = useCallback(
    (intent: DiagramIntent | null) => {
      setDiagramIntentByContext((prev) => ({
        ...prev,
        [activeChatContextId]: intent,
      }));
    },
    [activeChatContextId]
  );

  const resetDiagramIntents = useCallback(() => {
    setDiagramIntentByContext({});
  }, []);

  const safeRecordTimeStep = useCallback((args: Parameters<typeof appendTimeStep>[0]) => {
    if ((args.type === 'chat' || args.type === 'analyze' || args.type === 'build') && isNotebookChatMode) {
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

  const historyModeByStepId = useMemo(() => {
    const map = new Map<string, string | undefined>();
    historySteps.forEach((step) => {
      const meta = step.meta as Record<string, unknown> | undefined;
      map.set(step.id, typeof meta?.mode === 'string' ? meta.mode : undefined);
    });
    return map;
  }, [historySteps]);

  const editorDiagramMarkers = useMemo(() => {
    const isMarkdownContext = isMarkdownLike(mermaidState.code) && markdownMermaidBlocks.length > 0;
    const isDiagramTab = editorTab === 'markdown_mermaid';
    return diagramMarkers.filter((marker) => {
      const mode = historyModeByStepId.get(marker.stepId);
      if (isMarkdownContext) {
        if (marker.type !== 'build') return false;
        if (isDiagramTab) {
          const meta = (marker.meta ?? {}) as Record<string, unknown>;
          const blockIndex = typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
          return blockIndex === markdownMermaidActiveIndex;
        }
        return mode === 'markdown' || mode === 'markdown_all' || mode === 'notebook';
      }
      return mode !== 'markdown' && mode !== 'markdown_all' && mode !== 'notebook';
    });
  }, [
    diagramMarkers,
    editorTab,
    historyModeByStepId,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks.length,
    mermaidState.code,
  ]);

  const toggleScrollSync = useCallback(() => {
    setAppState((prev) => ({ ...prev, isScrollSyncEnabled: !prev.isScrollSyncEnabled }));
  }, [setAppState]);

  const setNotebookBuildCount = useCallback((count: number | string | null) => {
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

  const resolvedAppDiagramType = useMemo<DiagramType>(() => {
    if (appState.diagramType !== 'auto') return appState.diagramType;
    return detectedDiagramType ?? 'flowchart';
  }, [appState.diagramType, detectedDiagramType]);

  const notebookDiagramTypeByBlock = useMemo(() => {
    const map = new Map<number, DiagramType>();
    historySteps.forEach((step) => {
      const meta = step.meta as Record<string, unknown> | undefined;
      if (!meta || meta.mode !== 'notebook') return;
      const blockIndex = typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
      const diagramType = typeof meta.diagramType === 'string' ? (meta.diagramType as DiagramType) : null;
      if (blockIndex === null || !diagramType) return;
      map.set(blockIndex, diagramType);
    });
    return map;
  }, [historySteps]);

  const docsDiagramType = useMemo<DiagramType>(() => {
    if (markdownMermaidBlocks.length > 0) {
      const plannedType =
        notebookDiagramTypeByBlock.get(markdownMermaidActiveIndex)
        ?? notebookDiagramTypeByBlock.get(0)
        ?? null;
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex] ?? markdownMermaidBlocks[0];
      return plannedType ?? activeBlock?.diagramType ?? resolvedAppDiagramType;
    }
    return resolvedAppDiagramType;
  }, [
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    notebookDiagramTypeByBlock,
    resolvedAppDiagramType,
  ]);

  const {
    buildDocsEntries,
    buildDocsSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    setBuildDocsActivePathForMode,
    getDocsContext,
    getViewerDocsContext,
    getDocsSelectionSummary,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
    docsMode,
    setDocsMode,
    systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode,
    setBuildDocSelectionForMode,
    resetDocsSelectionsToDefault,
    buildDocsType,
  } = useBuildDocs(docsDiagramType);

  useEffect(() => {
    if (appState.diagramType === 'auto') return;
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
          diagramType:
            notebookDiagramTypeByBlock.get(markdownMermaidActiveIndex)
            ?? activeBlock.diagramType
            ?? resolvedAppDiagramType,
          isValid: diagnostics?.isValid,
        };
      }
    }
    const rawCode = mermaidState.code.trim();
    if (isMarkdownLike(rawCode)) {
      return {
        code: '',
        errorMessage: undefined,
        diagramType: resolvedAppDiagramType,
        isValid: true,
      };
    }
    return {
      code: rawCode,
      errorMessage: mermaidState.errorMessage,
      diagramType: detectedDiagramType ?? resolvedAppDiagramType,
      isValid: mermaidState.isValid,
    };
  }, [
    detectedDiagramType,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    mermaidState.code,
    mermaidState.errorMessage,
    mermaidState.isValid,
    notebookDiagramTypeByBlock,
    resolvedAppDiagramType,
  ]);

  const chatMessagesForView = useNotebookChatView({ isNotebookChatMode, messages: activeMessages });

  const filteredOperationLogs = useMemo(() => {
    return operationLogs.filter((log) => resolveOperationLogContextId(log) === activeChatContextId);
  }, [activeChatContextId, operationLogs]);

  const filteredActiveOperationLog = useMemo(() => {
    for (let i = filteredOperationLogs.length - 1; i >= 0; i -= 1) {
      if (filteredOperationLogs[i].status === 'running') return filteredOperationLogs[i];
    }
    return null;
  }, [filteredOperationLogs]);

  const activeOperationKind = useMemo(() => {
    const title = filteredActiveOperationLog?.events?.[0]?.title?.toLowerCase() ?? '';
    if (!title) return null;
    if (title.includes('чат')) return 'chat';
    if (title.includes('сборка') || title.includes('notebook build') || title === 'build') return 'build';
    if (title.includes('анализ')) return 'analyze';
    if (title.includes('исправление')) return 'fix';
    if (title.includes('пересборка') || title.includes('recompile')) return 'compile';
    return null;
  }, [filteredActiveOperationLog]);

  const {
    buildPromptPreview,
    promptPreviewByMode,
    resetPromptPreview,
    setPromptPreview,
  } = usePromptPreview({
    diagramType: editorTab === 'build_docs' ? (buildDocsType ?? docsDiagramType) : docsDiagramType,
    mainDiagramTypes: appState.mainDiagramTypes,
    analyzeLanguage: appState.analyzeLanguage ?? 'auto',
    appLanguage: appState.language ?? 'auto',
    isNotebookChatMode,
    isNotebookDataEnabled,
    promptScope: editorTab === 'build_docs' ? buildDocsScope : null,
    messages: chatMessagesForView,
    diagramIntent,
    resolveActiveMermaidContext,
    getDocsContext: editorTab === 'build_docs' ? getViewerDocsContext : getDocsContext,
  });

  useEffect(() => {
    if (editorTab !== 'build_docs') {
      prevBuildDocsScopeRef.current = buildDocsScope;
      return;
    }
    const prevScope = prevBuildDocsScopeRef.current;
    if (prevScope !== buildDocsScope) {
      prevBuildDocsScopeRef.current = buildDocsScope;
      resetPromptPreview();
    }
  }, [buildDocsScope, editorTab, resetPromptPreview]);

  const { buildDocsIntentText } = useNotebookChat({
    isNotebookChatMode,
    isNotebookDataEnabled,
    getNotebookChatIndex,
    markdownMermaidBlocksLength: markdownMermaidBlocks.length,
    markdownMermaidActiveIndex,
    historySteps,
    getMessagesForContext,
    setMessagesForContext,
    diagramIntent,
    setDiagramIntent: setDiagramIntentForActiveContext,
    systemPrompt: promptPreviewByMode.chat?.systemPrompt ?? '',
    systemPromptRedacted: promptPreviewByMode.chat?.systemPromptRedacted ?? '',
    isSystemPromptRaw: systemPromptRawByMode.chat,
  });
  const resolvedBuildDocsIntentText = useMemo(() => buildDocsIntentText?.trim() || '', [buildDocsIntentText]);

  useEffect(() => {
    if (!historyLoadResult) return;
    const sessionId = historyLoadResult.session.id;
    if (hydratedSessionIdRef.current === sessionId) return;
    hydratedSessionIdRef.current = sessionId;

    setMessagesForContext('main', (prev) => {
      const init = prev.find((m) => m.id === 'init');
      const docMessages = historySteps
        .filter((step) => {
          const meta = step.meta as Record<string, unknown> | undefined;
          return meta?.mode !== 'notebook';
        })
        .flatMap((step) => step.messages ?? [])
        .filter((m) => m.id !== 'init');
      return init ? [init, ...docMessages] : docMessages;
    });

    if (historyLoadResult.currentRevisionMermaid !== null) {
      const code = historyLoadResult.currentRevisionMermaid;
      const diag = historyLoadResult.currentRevisionDiagnostics;

      lastManualRecordedCodeRef.current = code;
      const rawWhiteboard = historyLoadResult.currentRevisionWhiteboard ?? null;
      whiteboardRawRef.current = rawWhiteboard;
      setWhiteboardBundleJson(rawWhiteboard);
      setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(rawWhiteboard));
      hydratedRevisionIdRef.current = historyLoadResult.session.currentRevisionId ?? null;
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
      whiteboardRawRef.current = null;
      setWhiteboardBundleJson(null);
      setWhiteboardSceneJson(null);
      hydratedRevisionIdRef.current = null;
      setMermaidState(DEFAULT_MERMAID_STATE);
    }

    isHydratingRef.current = false;
  }, [historyLoadResult, historySteps, resolveWhiteboardSceneForActiveContext, setMermaidState, setMessagesForContext]);

  useEffect(() => {
    const revId = historySession?.currentRevisionId ?? null;
    if (revId === hydratedRevisionIdRef.current) return;
    hydratedRevisionIdRef.current = revId;
    if (!revId) {
      whiteboardRawRef.current = null;
      setWhiteboardBundleJson(null);
      setWhiteboardSceneJson(null);
      return;
    }
    void getRevision(revId).then((rev) => {
      const raw = rev?.whiteboard ?? null;
      whiteboardRawRef.current = raw;
      setWhiteboardBundleJson(raw);
      setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(raw));
    });
  }, [getRevision, historySession?.currentRevisionId, resolveWhiteboardSceneForActiveContext]);

  const saveWhiteboardForCurrentRevision = useCallback(async (sceneJson: string | null) => {
    const isMarkdownBlock = markdownMermaidBlocks.length > 0;
    const nextRaw = (() => {
      const trimmed = sceneJson?.trim() ? sceneJson : null;
      if (!isMarkdownBlock) return trimmed;
      return updateWhiteboardBundleForBlock(whiteboardRawRef.current, markdownMermaidActiveIndex, trimmed);
    })();

    // Optimistically update local whiteboard state so switching modes keeps the scene.
    whiteboardRawRef.current = nextRaw;
    setWhiteboardBundleJson(nextRaw);
    setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(nextRaw));

    let revisionId = historySession?.currentRevisionId ?? null;
    if (!revisionId) {
      const code = mermaidState.code;
      if (!code.trim()) return null;
      const step = await safeAppendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: {
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        },
      });
      revisionId = (step as { session?: { currentRevisionId?: string | null } } | null)?.session?.currentRevisionId ?? null;
    }

    const updated = await updateCurrentRevisionWhiteboard(nextRaw, revisionId);
    const raw = updated?.whiteboard ?? null;
    if (updated) {
      whiteboardRawRef.current = raw;
      setWhiteboardBundleJson(raw);
      setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(raw));
    }
    return updated;
  }, [
    historySession?.currentRevisionId,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks.length,
    resolveWhiteboardSceneForActiveContext,
    safeAppendTimeStep,
    updateCurrentRevisionWhiteboard,
  ]);

  useEffect(() => {
    // Keep the active whiteboard scene in sync with the selected markdown block.
    // The underlying revision stores a bundle of scenes per block index.
    setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(whiteboardRawRef.current));
  }, [markdownMermaidActiveIndex, markdownMermaidBlocks.length, resolveWhiteboardSceneForActiveContext]);

  useEffect(() => {
    if (!historyLoadResult) return;
    hydrateOperationLogs(historySteps);
  }, [historyLoadResult, historySteps, hydrateOperationLogs]);

  useEffect(() => {
    if (!historySession?.id) return;
    const sessionId = historySession.id;
    if (seededNotebookSessionIdsRef.current.has(sessionId)) return;
    if (historySession.currentRevisionId) {
      seededNotebookSessionIdsRef.current.add(sessionId);
      return;
    }
    if (historySteps.length > 0) {
      seededNotebookSessionIdsRef.current.add(sessionId);
      return;
    }

    seededNotebookSessionIdsRef.current.add(sessionId);
    const markdown = createMermaidNotebookMarkdown({ blocks: 1 });
    lastManualRecordedCodeRef.current = markdown;
    setMermaidState((prev) => ({
      ...prev,
      code: markdown,
      isValid: true,
      lastValidCode: markdown,
      errorMessage: undefined,
      errorLine: undefined,
      source: 'compiled',
      status: 'valid',
    }));
    void safeAppendTimeStep({
      type: 'seed',
      messages: [],
      nextMermaid: {
        code: markdown,
        isValid: true,
        errorMessage: undefined,
        errorLine: undefined,
      },
      meta: { seeded: 'notebook' },
    });
  }, [historySession?.currentRevisionId, historySession?.id, historySteps.length, safeAppendTimeStep, setMermaidState]);

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
    modelParams,
    setModelParams,
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
    resetDiagramIntents,
    setEditorTab,
    setMermaidState,
    setOperationLogs,
    clearProjectPreview,
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

  const openNotebookBlock = useCallback((index: number) => {
    if (!markdownMermaidBlocks.length) return;
    const safeIndex = Math.max(0, Math.min(index, markdownMermaidBlocks.length - 1));
    setMarkdownMermaidActiveIndex(safeIndex);
    setEditorTab('markdown_mermaid');
  }, [markdownMermaidBlocks.length, setMarkdownMermaidActiveIndex]);

  const backToNotebookMainChat = useCallback(() => {
    if (markdownMermaidBlocks.length) {
      setMarkdownMermaidActiveIndex(0);
    }
    setEditorTab('code');
  }, [markdownMermaidBlocks.length, setMarkdownMermaidActiveIndex, setEditorTab]);

  const setDiagramTypeAndWait = useCallback((target: DiagramType) => {
    if (appState.diagramType === target) return Promise.resolve();
    return new Promise<void>((resolve) => {
      diagramTypeWaitRef.current = { target, resolve };
      setDiagramType(target);
    });
  }, [appState.diagramType, setDiagramType]);

  const handleLLMRequestStart = useCallback((notice: LLMRequestStartNotice) => {
    setActiveLLMRequest(notice);
  }, []);

  const { handleNotebookBuild } = useNotebookBuild({
    aiConfig,
    modelParams,
    appState,
    connectionState,
    messages: activeMessages,
    diagramIntent,
    addMessage: addMessageForActiveContext,
    setMessages,
    safeAppendTimeStep,
    setIsProcessing,
    setMarkdownMermaidActiveIndex,
    setEditorTab,
    setDiagramTypeAndWait,
    setMermaidState,
    getDocsContext,
    getDocsSelectionSummary,
    loadBuildDocsEntries,
    startOperation: (title) => startOperation(title, 'main'),
    addOperationEvent,
    finishOperation,
    getOperationLog,
    onLLMRequestStart: handleLLMRequestStart,
  });

  const analyticsAdapter = useMemo(() => {
    return createAnalyticsAdapter({
      aiConfig,
      appState,
      modelParams,
      getDocsUsageSummary: getDocsSelectionSummary,
      resolveDiagramType: () => resolveActiveMermaidContext().diagramType ?? appState.diagramType,
      trackEvent: trackAnalyticsEventService,
    });
  }, [
    aiConfig,
    appState,
    getDocsSelectionSummary,
    modelParams,
    resolveActiveMermaidContext,
  ]);

  const getAnalyticsContext = useCallback((mode: DocsMode) => {
    return analyticsAdapter.getContext(mode);
  }, [analyticsAdapter]);

  const trackAnalyticsEvent = useCallback((event: string, payload?: Record<string, unknown>) => {
    analyticsAdapter.track(event, payload);
  }, [analyticsAdapter]);

  const trackAnalyticsWithContext = useCallback((event: string, mode: DocsMode, payload?: Record<string, unknown>) => {
    return analyticsAdapter.trackWithContext(event, mode, payload);
  }, [analyticsAdapter]);

  const {
    handleChatMessage: baseHandleChatMessage,
    handleBuildFromPrompt: baseHandleBuildFromPrompt,
    handleRecompile,
    handleFixSyntax: baseHandleFixSyntax,
    handleAnalyze,
  } =
    createStudioActions({
      aiConfig,
      connectionState,
      appState,
      isNotebookChatEnabled,
      isNotebookChatMode,
      modelParams,
      mermaidState,
      diagramIntent,
      setDiagramIntent: setDiagramIntentForActiveContext,
      setMermaidState,
      addMessage: addMessageForActiveContext,
      getMessages: getMessagesForActiveContext,
      getDiagramContextCode: () => resolveActiveMermaidContext().code,
      resolveMermaidUpdateTarget,
      getNotebookChatIndex,
      getAnalyticsContext,
      trackAnalyticsEvent,
      trackAnalyticsWithContext,
      getDocsContext,
      getDocsSelectionSummary,
      setIsProcessing,
      recordTimeStep: safeRecordTimeStep,
      startOperation: startOperationForContext,
      addOperationEvent,
      finishOperation,
      getOperationLog,
      historySession,
      onLLMRequestStart: handleLLMRequestStart,
    });

  const { handleFixSyntax } = useFixFlow({
    aiConfig,
    modelParams,
    appDiagramType: resolvedAppDiagramType,
    connectionStatus: connectionState.status,
    messages: activeMessages,
    mermaidState,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
    handleMermaidChange,
    addMessage: addMessageForActiveContext,
    setMessages,
    safeAppendTimeStep,
    getDocsContext,
    getDocsSelectionSummary,
    trackAnalyticsWithContext,
    setIsProcessing,
    baseHandleFixSyntax,
    onLLMRequestStart: handleLLMRequestStart,
    llmTimeoutMs: appState.llmTimeoutMs,
    startOperation: startOperationForContext,
    addOperationEvent,
    finishOperation,
    getOperationLog,
  });

  const runWithActiveDiagramContext = useCallback(async <T,>(action: () => Promise<T>) => {
    const originalDiagramType = appState.diagramType;
    const targetDiagramType = resolveActiveMermaidContext().diagramType ?? originalDiagramType;
    try {
      await setDiagramTypeAndWait(targetDiagramType);
      await loadBuildDocsEntries(targetDiagramType);
      return await action();
    } finally {
      await setDiagramTypeAndWait(originalDiagramType);
    }
  }, [
    appState.diagramType,
    loadBuildDocsEntries,
    resolveActiveMermaidContext,
    setDiagramTypeAndWait,
  ]);

  useEffect(() => {
    if (!isProcessing && activeLLMRequest) {
      setActiveLLMRequest(null);
    }
  }, [activeLLMRequest, isProcessing]);

  const handleChatMessage = useCallback(async (text: string) => {
    if (activeChatContextId === MAIN_CHAT_CONTEXT_ID) {
      return baseHandleChatMessage(text);
    }

    return runWithActiveDiagramContext(() => baseHandleChatMessage(text));
  }, [
    baseHandleChatMessage,
    activeChatContextId,
    runWithActiveDiagramContext,
  ]);

  const handleBuildFromPrompt = useCallback(async (text?: string) => {
    if (activeChatContextId === MAIN_CHAT_CONTEXT_ID) {
      await handleNotebookBuild(text);
      return;
    }

    await runWithActiveDiagramContext(() => baseHandleBuildFromPrompt(text));
  }, [
    baseHandleBuildFromPrompt,
    activeChatContextId,
    handleNotebookBuild,
    runWithActiveDiagramContext,
  ]);

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

  const goToDiagramStep = async (marker: DiagramMarker | Pick<DiagramMarker, 'stepId'> | string) => {
    const stepId = typeof marker === 'string' ? marker : marker.stepId;
    const markerMeta =
      typeof marker === 'string'
        ? null
        : ('meta' in marker ? (marker.meta ?? null) : null);
    const revision = await selectDiagramStep(stepId);
    if (!revision) return;

    lastManualRecordedCodeRef.current = revision.mermaid;
    const rawWhiteboard = revision.whiteboard ?? null;
    whiteboardRawRef.current = rawWhiteboard;
    setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(rawWhiteboard));
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
    if (isMarkdownLike(revision.mermaid)) {
      const blocks = extractMermaidBlocksFromMarkdown(revision.mermaid);
      const metaBlockIndex = markerMeta && typeof markerMeta.blockIndex === 'number'
        ? markerMeta.blockIndex
        : null;
      const safeMetaIndex =
        metaBlockIndex !== null && metaBlockIndex >= 0 && metaBlockIndex < blocks.length
          ? metaBlockIndex
          : null;
      const firstNonEmptyIndex = blocks.findIndex((block) => block.code.trim().length > 0);
      const nextIndex =
        safeMetaIndex !== null
          ? safeMetaIndex
          : firstNonEmptyIndex >= 0
            ? firstNonEmptyIndex
            : 0;
      setMarkdownMermaidActiveIndex(nextIndex);
    }
  };

  const handleDiagramTypeChange = async (type: DiagramType) => {
    setDiagramType(type);
    setDiagramIntentForActiveContext(null);
    resetPromptPreview();
    setNotebookBuildCount(type === 'auto' ? null : 1);
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
    editorDiagramMarkers,
    selectedStepId,
    projects,
    activeProjectId,
    diagramIntent,
    promptPreviewByMode,
    editorTab,
    buildDocsScope,
    buildDocsEntries,
    buildDocsSelection,
    toggleBuildDocSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    setBuildDocsActivePathForMode,
    loadBuildDocsEntries,
    docsMode,
    setDocsMode,
    systemPromptRawByMode,
    setSystemPromptRaw,
    buildDocsSelectionsByMode,
    setBuildDocSelectionForMode,
    resetDocsSelectionsToDefault,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    markdownMermaidActiveIndex,
    setMarkdownMermaidActiveIndex,
    detectedDiagramType,
    goToDiagramStep,
    startResize,
    setDiagramType: handleDiagramTypeChange,
    setMainDiagramTypes,
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
    setThemePreset,
    setAnalyzeLanguage,
    setLLMTimeoutMs,
    togglePreviewFullScreen,
    toggleScrollSync,
    setNotebookBuildCount,
    buildDocsIntentText: resolvedBuildDocsIntentText,
    buildPromptPreview,
    setPromptPreview,
    setEditorTab,
    setNextBuildDocsScope,
    startMarkdownNotebook,
    appendMarkdownMermaidBlock,
    openNotebookBlock,
    backToNotebookMainChat,
    isNotebookChatMode,
    operationLogs: filteredOperationLogs,
    activeOperationLog: filteredActiveOperationLog,
    activeOperationKind,
    onLLMRequestStart: handleLLMRequestStart,

    historySessionCurrentRevisionId: historySession?.currentRevisionId ?? null,
    whiteboardSceneJson,
    whiteboardBundleJson,
    saveWhiteboardForCurrentRevision,
  };
};
