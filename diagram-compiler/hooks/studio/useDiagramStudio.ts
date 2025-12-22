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
import { usePromptPreview } from './usePromptPreview';
import type { DiagramMarker } from '../core/useHistory';
import { AUTO_FIX_MAX_ATTEMPTS, DEFAULT_MERMAID_STATE } from '../../constants';
import { fetchDocsContext } from '../../services/docsContextService';
import { detectLanguage } from '../../utils';
import type { DiagramIntent, DiagramType, EditorTab } from '../../types';
import { detectMermaidDiagramType, extractMermaidCode, isMarkdownLike, replaceMermaidBlockInMarkdown, validateMermaidDiagramCode } from '../../services/mermaidService';
import { fixDiagram } from '../../services/llmService';
import { runAutoFixLoop } from './autoFix';

export const useDiagramStudio = () => {
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, toggleTheme, setAnalyzeLanguage, togglePreviewFullScreen } = useLayout();
  const { messages, setMessages, addMessage, clearMessages, resetMessages, getMessages } = useChat();
  const {
    isHistoryReady,
    historySession,
    historyLoadResult,
    appendTimeStep,
    updateCurrentRevision,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    selectDiagramStep,
    startNewSession,
  } = useHistory();

  const [isProcessing, setIsProcessing] = useState(false);
  const [diagramIntent, setDiagramIntent] = useState<DiagramIntent | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>('code');

  const isHydratingRef = useRef(true);
  const lastManualRecordedCodeRef = useRef<string>('');
  const {
    buildDocsEntries,
    buildDocsSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
    getBuildDocsContext,
    loadBuildDocsEntries,
    toggleBuildDocSelection,
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

  const detectedDiagramType = useMemo(() => {
    if (markdownMermaidBlocks.length > 0) {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex] ?? markdownMermaidBlocks[0];
      return activeBlock?.diagramType ?? detectMermaidDiagramType(activeBlock?.code ?? '');
    }
    if (isMarkdownLike(mermaidState.code)) return null;
    return detectMermaidDiagramType(mermaidState.code);
  }, [markdownMermaidActiveIndex, markdownMermaidBlocks, mermaidState.code]);

  useEffect(() => {
    if (mermaidState.source === 'compiled') return;

    if (detectedDiagramType && detectedDiagramType !== appState.diagramType) {
      setDiagramType(detectedDiagramType);
    }
  }, [
    appState.diagramType,
    detectedDiagramType,
    mermaidState.code,
    mermaidState.source,
    setDiagramType,
  ]);

  const resolveActiveMermaidContext = useCallback(() => {
    if (markdownMermaidBlocks.length) {
      const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
      const diagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
      if (activeBlock?.code.trim()) {
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

  const {
    buildPromptPreview,
    promptPreviewByMode,
    promptPreviewView,
    resetPromptPreview,
    setPromptPreview,
    setPromptPreviewView,
  } = usePromptPreview({
    diagramType: appState.diagramType,
    analyzeLanguage: appState.analyzeLanguage ?? 'auto',
    messages,
    diagramIntent,
    resolveActiveMermaidContext,
    getBuildDocsContext,
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
    }

    isHydratingRef.current = false;
  }, [historyLoadResult, setMermaidState, setMessages]);

  useEffect(() => {
    if (!isHistoryReady) return;
    if (historyLoadResult) return;
    isHydratingRef.current = false;
  }, [historyLoadResult, isHistoryReady]);

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

  const { handleChatMessage, handleBuildFromPrompt, handleRecompile, handleFixSyntax: baseHandleFixSyntax, handleAnalyze } =
    createStudioActions({
      aiConfig,
      connectionState,
      appState,
      mermaidState,
      diagramIntent,
      setDiagramIntent,
      setMermaidState,
      addMessage,
      getMessages,
      getDiagramContextCode: () => resolveActiveMermaidContext().code,
      getBuildDocsContext,
      setIsProcessing,
      recordTimeStep: appendTimeStep,
    });

  const resolveFixLanguage = useCallback(() => {
    const basis = messages
      .slice()
      .reverse()
      .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;
    if (!basis) return 'English';
    return detectLanguage(basis);
  }, [messages]);

  const handleFixSyntax = useCallback(async () => {
    const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
    const activeDiagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
    const shouldFixMarkdownBlock = !!activeBlock && activeDiagnostics?.isValid === false;

    if (!shouldFixMarkdownBlock) {
      await baseHandleFixSyntax();
      return;
    }

    if (connectionState.status !== 'connected') {
      await safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', diagramType: activeBlock.diagramType ?? appState.diagramType },
      });
      return;
    }

    setIsProcessing(true);
    try {
      const diagramType = activeBlock.diagramType ?? appState.diagramType;
      const docs = await fetchDocsContext(diagramType);
      const language = resolveFixLanguage();

      const startCode = activeBlock.code;
      const initialValidation = await validateMermaidDiagramCode(startCode);
      const { code: currentCode, validation, attempts } = await runAutoFixLoop({
        initialCode: startCode,
        initialValidation,
        maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        validate: validateMermaidDiagramCode,
        fix: async (code, errorMessage) => {
          const fixedRaw = await fixDiagram(
            code,
            errorMessage,
            aiConfig,
            docs,
            language
          );
          return extractMermaidCode(fixedRaw);
        },
      });

      const changed = currentCode !== startCode;
      const cleared = !currentCode.trim();
      const nextMarkdown = changed || cleared
        ? replaceMermaidBlockInMarkdown(mermaidState.code, activeBlock, currentCode)
        : mermaidState.code;

      if (changed || cleared) {
        handleMermaidChange(nextMarkdown);
      }

      const nextMermaid = changed || cleared
        ? {
            code: nextMarkdown,
            isValid: true,
            errorMessage: undefined,
            errorLine: undefined,
          }
        : null;

      await safeAppendTimeStep({
        type: 'fix',
        messages: [],
        nextMermaid,
        setCurrentRevisionId: cleared ? null : undefined,
        meta: {
          attempts,
          changed,
          isValid: !!validation.isValid,
          cleared,
          diagramType,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Fix failed (${aiConfig.selectedModelId ? `model=${aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await safeAppendTimeStep({ type: 'fix', messages: [], meta: { error: message } });
    } finally {
      setIsProcessing(false);
    }
  }, [
    aiConfig,
    appState.diagramType,
    baseHandleFixSyntax,
    connectionState.status,
    handleMermaidChange,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    mermaidState.code,
    resolveFixLanguage,
    safeAppendTimeStep,
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

  const startNewProject = async () => {
    if (isProcessing) return;
    await startNewSession();
    resetMessages();
    lastManualRecordedCodeRef.current = '';
    setDiagramIntent(null);
    resetPromptPreview();
    setEditorTab('code');
    setMermaidState(DEFAULT_MERMAID_STATE);
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
    messages,
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
    diagramIntent,
    promptPreviewByMode,
    promptPreviewView,
    editorTab,
    buildDocsEntries,
    buildDocsSelection,
    toggleBuildDocSelection,
    buildDocsSelectionKey,
    buildDocsActivePath,
    setBuildDocsActivePath,
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
    toggleTheme,
    setAnalyzeLanguage,
    togglePreviewFullScreen,
    buildPromptPreview,
    setPromptPreview,
    setPromptPreviewView,
    setEditorTab,
  };
};
