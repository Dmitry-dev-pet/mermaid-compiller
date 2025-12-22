import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAI } from './useAI';
import { useMermaid } from './useMermaid';
import { useLayout } from './useLayout';
import { useChat } from './useChat';
import { createStudioActions } from './studioActions';
import { useHistory } from './useHistory';
import type { DiagramMarker } from './useHistory';
import { AUTO_FIX_MAX_ATTEMPTS, DEFAULT_MERMAID_STATE } from '../constants';
import { fetchDocsContext, fetchDocsEntries, formatDocsContext } from '../services/docsContextService';
import { buildSystemPrompt } from '../services/llm/prompts';
import { detectLanguage } from '../utils';
import type { DiagramIntent, DiagramType, EditorTab, LLMRequestPreview, Message, PromptPreviewMode, PromptPreviewTab, PromptPreviewView, PromptTokenCounts } from '../types';
import type { DocsEntry } from '../services/docsContextService';
import { detectMermaidDiagramType, extractMermaidBlocksFromMarkdown, extractMermaidCode, isMarkdownLike, replaceMermaidBlockInMarkdown, validateMermaidDiagramCode } from '../services/mermaidService';
import { fixDiagram } from '../services/llmService';

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
  const [promptPreviewByMode, setPromptPreviewByMode] = useState<Record<PromptPreviewMode, PromptPreviewTab | null>>({
    chat: null,
    build: null,
    analyze: null,
    fix: null,
  });
  const [promptPreviewView, setPromptPreviewView] = useState<PromptPreviewView>('redacted');
  const [editorTab, setEditorTab] = useState<EditorTab>('code');
  const [buildDocsEntries, setBuildDocsEntries] = useState<DocsEntry[]>([]);
  const [buildDocsSelection, setBuildDocsSelection] = useState<Record<string, boolean>>({});
  const [buildDocsType, setBuildDocsType] = useState<DiagramType | null>(null);
  const [markdownMermaidDiagnostics, setMarkdownMermaidDiagnostics] = useState<
    Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>
  >([]);
  const [buildDocsActivePath, setBuildDocsActivePath] = useState<string>('');
  const [markdownMermaidActiveIndex, setMarkdownMermaidActiveIndex] = useState(0);

  const isHydratingRef = useRef(true);
  const lastManualRecordedCodeRef = useRef<string>('');
  const buildDocsRequestRef = useRef(0);

  const loadBuildDocsEntries = useCallback(async (type: DiagramType) => {
    const requestId = ++buildDocsRequestRef.current;
    const entries = await fetchDocsEntries(type);
    if (requestId !== buildDocsRequestRef.current) {
      return { entries: [], selection: {} as Record<string, boolean> };
    }

    const nextSelection: Record<string, boolean> = {};
    entries.forEach((entry) => {
      nextSelection[entry.path] = buildDocsSelection[entry.path] ?? true;
    });

    setBuildDocsEntries(entries);
    setBuildDocsSelection(nextSelection);
    setBuildDocsType(type);
    setBuildDocsActivePath((prev) => {
      if (prev && entries.some((entry) => entry.path === prev)) return prev;
      return entries[0]?.path ?? '';
    });
    return { entries, selection: nextSelection };
  }, [buildDocsSelection]);

  const ensureBuildDocsEntries = useCallback(async () => {
    if (buildDocsType === appState.diagramType) {
      return { entries: buildDocsEntries, selection: buildDocsSelection };
    }
    return await loadBuildDocsEntries(appState.diagramType);
  }, [appState.diagramType, buildDocsEntries, buildDocsSelection, buildDocsType, loadBuildDocsEntries]);

  const getBuildDocsContext = useCallback(async () => {
    const { entries, selection } = await ensureBuildDocsEntries();
    const selected = entries.filter((entry) => selection[entry.path] !== false);
    return formatDocsContext(selected);
  }, [ensureBuildDocsEntries]);

  const toggleBuildDocSelection = useCallback((path: string, isIncluded: boolean) => {
    setBuildDocsSelection((prev) => ({
      ...prev,
      [path]: isIncluded,
    }));
  }, []);

  const buildDocsSelectionKey = useMemo(() => {
    if (!buildDocsEntries.length) return '';
    return buildDocsEntries
      .map((entry) => `${entry.path}:${buildDocsSelection[entry.path] !== false ? '1' : '0'}`)
      .join('|');
  }, [buildDocsEntries, buildDocsSelection]);

  const markdownMermaidBlocks = useMemo(() => {
    return extractMermaidBlocksFromMarkdown(mermaidState.code);
  }, [mermaidState.code]);

  useEffect(() => {
    let cancelled = false;
    if (!markdownMermaidBlocks.length) {
      setMarkdownMermaidDiagnostics([]);
      return;
    }
    const validateBlocks = async () => {
      const results = await Promise.all(
        markdownMermaidBlocks.map((block) => validateMermaidDiagramCode(block.code))
      );
      if (cancelled) return;
      setMarkdownMermaidDiagnostics(results);
    };
    void validateBlocks();
    return () => {
      cancelled = true;
    };
  }, [markdownMermaidBlocks]);

  useEffect(() => {
    if (!markdownMermaidBlocks.length) {
      if (markdownMermaidActiveIndex !== 0) {
        setMarkdownMermaidActiveIndex(0);
      }
      if (editorTab === 'markdown_mermaid') {
        setEditorTab('code');
      }
      return;
    }
    if (markdownMermaidActiveIndex >= markdownMermaidBlocks.length) {
      setMarkdownMermaidActiveIndex(0);
    }
  }, [editorTab, markdownMermaidActiveIndex, markdownMermaidBlocks.length]);

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

  useEffect(() => {
    if (buildDocsType === appState.diagramType) return;
    void loadBuildDocsEntries(appState.diagramType);
  }, [appState.diagramType, buildDocsType, loadBuildDocsEntries]);

  useEffect(() => {
    if (!isHistoryReady) return;
    if (isHydratingRef.current) return;
    if (isProcessing) return;
    if (mermaidState.source === 'compiled') return;

    const code = mermaidState.code;
    if (code === lastManualRecordedCodeRef.current) return;

    const timer = window.setTimeout(() => {
      if (isHydratingRef.current) return;
      if (mermaidState.source === 'compiled') return;
      if (code === lastManualRecordedCodeRef.current) return;

      lastManualRecordedCodeRef.current = code;

      const trimmed = code.trim();

      if (!trimmed) {
        appendTimeStep({
          type: 'manual_edit',
          messages: [],
          nextMermaid: null,
          setCurrentRevisionId: null,
        }).catch((e) => console.error('Failed to record manual edit step', e));
        return;
      }

      if (historySession?.currentRevisionId) {
        updateCurrentRevision({
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        }).catch((e) => console.error('Failed to update manual edit revision', e));
        return;
      }

      appendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: {
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        },
      }).catch((e) => console.error('Failed to record manual edit step', e));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    appendTimeStep,
    historySession?.currentRevisionId,
    isHistoryReady,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    mermaidState.source,
    updateCurrentRevision,
  ]);

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
      try {
        await appendTimeStep({
          type: 'fix',
          messages: [],
          meta: { error: 'offline', diagramType: activeBlock.diagramType ?? appState.diagramType },
        });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const diagramType = activeBlock.diagramType ?? appState.diagramType;
      const docs = await fetchDocsContext(diagramType);
      const language = resolveFixLanguage();

      const startCode = activeBlock.code;
      let currentCode = startCode;
      let validation = await validateMermaidDiagramCode(currentCode);
      let attempts = 0;

      while (!validation.isValid && attempts < AUTO_FIX_MAX_ATTEMPTS) {
        attempts += 1;
        const fixedRaw = await fixDiagram(
          currentCode,
          validation.errorMessage || 'Unknown error',
          aiConfig,
          docs,
          language
        );
        const fixedCode = extractMermaidCode(fixedRaw);
        if (!fixedCode.trim()) break;

        currentCode = fixedCode;
        validation = await validateMermaidDiagramCode(currentCode);
        if (validation.isValid) break;
      }

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

      try {
        await appendTimeStep({
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
      } catch (e) {
        console.error('Failed to record history step', e);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Fix failed (${aiConfig.selectedModelId ? `model=${aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      try {
        await appendTimeStep({ type: 'fix', messages: [], meta: { error: message } });
      } catch (err) {
        console.error('Failed to record history step', err);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [
    aiConfig,
    appState.diagramType,
    appendTimeStep,
    baseHandleFixSyntax,
    connectionState.status,
    handleMermaidChange,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    mermaidState.code,
    resolveFixLanguage,
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

    try {
      await appendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: {
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        },
      });
    } catch (e) {
      console.error('Failed to record manual snapshot', e);
    }
  }, [
    appendTimeStep,
    editorTab,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    markdownMermaidActiveIndex,
    markdownMermaidDiagnostics,
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
    setPromptPreviewByMode({ chat: null, build: null, analyze: null, fix: null });
    setEditorTab('code');
    setMermaidState(DEFAULT_MERMAID_STATE);
  };

  const handleDiagramTypeChange = async (type: DiagramType) => {
    setDiagramType(type);
    setDiagramIntent(null);
    setPromptPreviewByMode({ chat: null, build: null, analyze: null, fix: null });
    setEditorTab('build_docs');
    void loadBuildDocsEntries(type);
  };

  const resolvePreviewLanguage = useCallback((inputText: string, relevantMessages: Message[]) => {
    const basis =
      inputText.trim() ||
      relevantMessages
        .slice()
        .reverse()
        .find((m) => m.role === 'user' && m.content.trim().length > 0)?.content ||
      '';
    return basis ? detectLanguage(basis) : 'English';
  }, []);

  const resolvePreviewAnalyzeLanguage = useCallback((relevantMessages: Message[]) => {
    if (appState.analyzeLanguage && appState.analyzeLanguage !== 'auto') {
      return appState.analyzeLanguage;
    }
    return resolvePreviewLanguage('', relevantMessages);
  }, [appState.analyzeLanguage, resolvePreviewLanguage]);

  const getDiagramContextMessage = useCallback((): Message | null => {
    const { code } = resolveActiveMermaidContext();
    if (!code) return null;

    return {
      id: 'preview-diagram-context',
      role: 'user',
      content: `Current Mermaid diagram code (context only; do not output Mermaid code in Chat mode and do not repeat this verbatim):
\`\`\`mermaid
${code}
\`\`\``,
      timestamp: Date.now(),
    };
  }, [resolveActiveMermaidContext]);

  const buildPromptPreview = useCallback(async (mode: PromptPreviewMode, inputText: string): Promise<LLMRequestPreview> => {
    const trimmed = inputText.trim();
    const relevantMessages = messages.filter((m) => m.id !== 'init');

    if (mode === 'analyze' || mode === 'fix') {
      const { code, errorMessage, diagramType, isValid } = resolveActiveMermaidContext();
      const docsContext = await fetchDocsContext(diagramType);
      const language =
        mode === 'analyze'
          ? resolvePreviewAnalyzeLanguage(relevantMessages)
          : resolvePreviewLanguage(trimmed, relevantMessages);
      const systemPrompt = buildSystemPrompt(mode, {
        diagramType,
        docsContext,
        language,
      });

      if (!code) {
        return {
          mode,
          diagramType,
          language,
          systemPrompt,
          docsContext,
          messages: [],
          error: `No Mermaid diagram available for ${mode}.`,
        };
      }

      if (mode === 'analyze') {
        const analyzeMessage: Message = {
          id: 'preview-analyze-message',
          role: 'user',
          content: `Analyze and explain the following Mermaid code:

\`\`\`mermaid
${code}
\`\`\`
`,
          timestamp: Date.now(),
        };

        return {
          mode,
          diagramType,
          language,
          systemPrompt,
          docsContext,
          messages: [analyzeMessage],
        };
      }

      let resolvedError = errorMessage;
      let resolvedValid = isValid;
      if (mode === 'fix' && (!resolvedError || resolvedValid === undefined)) {
        const validation = await validateMermaidDiagramCode(code);
        resolvedError = validation.errorMessage;
        resolvedValid = validation.isValid;
      }

      if (mode === 'fix' && resolvedValid !== false) {
        return {
          mode,
          diagramType,
          language,
          systemPrompt,
          docsContext,
          messages: [],
          error: 'Diagram is valid. Nothing to fix.',
        };
      }

      const fixMessage: Message = {
        id: 'preview-fix-message',
        role: 'user',
        content: `Code:


${code}


Error: ${resolvedError || 'Unknown error'}

Fix it.`,
        timestamp: Date.now(),
      };

      return {
        mode,
        diagramType,
        language,
        systemPrompt,
        docsContext,
        messages: [fixMessage],
      };
    }

    const docsContext = mode === 'chat' ? '' : await getBuildDocsContext();
    const language = resolvePreviewLanguage(trimmed, relevantMessages);
    const promptMode = mode === 'build' ? 'generate' : 'chat';
    const systemPrompt = buildSystemPrompt(promptMode, {
      diagramType: appState.diagramType,
      docsContext,
      language,
    });

    let previewMessages = [...relevantMessages];
    if (mode === 'build') {
      const intentText = trimmed || diagramIntent?.content.trim() || '';
      if (!intentText) {
        return {
          mode,
          diagramType: appState.diagramType,
          language,
          systemPrompt,
          docsContext,
          messages: [],
          error: 'No intent available. Use Chat first or provide a Build prompt.',
        };
      }
      previewMessages = [{
        id: 'preview-intent-message',
        role: 'user',
        content: `Intent:\n${intentText}`,
        timestamp: Date.now(),
      }];
    } else if (trimmed) {
      previewMessages.push({
        id: 'preview-user-message',
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      });
    }

    const diagramContext = getDiagramContextMessage();
    const llmMessages = diagramContext ? [...previewMessages, diagramContext] : previewMessages;

    return {
      mode,
      diagramType: appState.diagramType,
      language,
      systemPrompt,
      docsContext,
      messages: llmMessages,
    };
  }, [
    appState.diagramType,
    diagramIntent?.content,
    fetchDocsContext,
    getBuildDocsContext,
    getDiagramContextMessage,
    messages,
    resolveActiveMermaidContext,
    resolvePreviewAnalyzeLanguage,
    resolvePreviewLanguage,
  ]);

  const setPromptPreview = (
    mode: PromptPreviewMode,
    title: string,
    redactedContent: string,
    rawContent: string,
    tokenCounts?: PromptTokenCounts
  ) => {
    setPromptPreviewByMode((prev) => ({
      ...prev,
      [mode]: {
        title,
        content: redactedContent,
        redactedContent,
        rawContent,
        updatedAt: Date.now(),
        tokenCounts,
      },
    }));
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
