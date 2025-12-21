import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAI } from './useAI';
import { useMermaid } from './useMermaid';
import { useLayout } from './useLayout';
import { useChat } from './useChat';
import { createStudioActions } from './studioActions';
import { useHistory } from './useHistory';
import type { DiagramMarker } from './useHistory';
import { DEFAULT_MERMAID_STATE } from '../constants';
import { fetchDocsEntries, formatDocsContext } from '../services/docsContextService';
import { buildSystemPrompt } from '../services/llm/prompts';
import { detectLanguage } from '../utils';
import type { DiagramIntent, DiagramType, EditorTab, LLMRequestPreview, Message, PromptPreviewMode, PromptPreviewTab, PromptPreviewView, PromptTokenCounts } from '../types';
import type { DocsEntry } from '../services/docsContextService';

export const useDiagramStudio = () => {
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, toggleTheme, setAnalyzeLanguage, togglePreviewFullScreen } = useLayout();
  const { messages, setMessages, addMessage, clearMessages, resetMessages, getMessages } = useChat();
  const {
    isHistoryReady,
    historyLoadResult,
    appendTimeStep,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    selectDiagramStep,
    startNewSession,
  } =
    useHistory();

  const [isProcessing, setIsProcessing] = useState(false);
  const [diagramIntent, setDiagramIntent] = useState<DiagramIntent | null>(null);
  const [promptPreviewByMode, setPromptPreviewByMode] = useState<Record<PromptPreviewMode, PromptPreviewTab | null>>({
    chat: null,
    build: null,
  });
  const [promptPreviewView, setPromptPreviewView] = useState<PromptPreviewView>('redacted');
  const [editorTab, setEditorTab] = useState<EditorTab>('code');
  const [buildDocsEntries, setBuildDocsEntries] = useState<DocsEntry[]>([]);
  const [buildDocsSelection, setBuildDocsSelection] = useState<Record<string, boolean>>({});
  const [buildDocsType, setBuildDocsType] = useState<DiagramType | null>(null);
  const [buildDocsActivePath, setBuildDocsActivePath] = useState<string>('');

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

      appendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: code.trim()
          ? {
              code,
              isValid: mermaidState.isValid,
              errorMessage: mermaidState.errorMessage,
              errorLine: mermaidState.errorLine,
            }
          : null,
        setCurrentRevisionId: code.trim() ? undefined : null,
      }).catch((e) => console.error('Failed to record manual edit step', e));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    appendTimeStep,
    isHistoryReady,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    mermaidState.source,
  ]);

  const { handleChatMessage, handleBuildFromPrompt, handleRecompile, handleFixSyntax, handleAnalyze } =
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
      getBuildDocsContext,
      setIsProcessing,
      recordTimeStep: appendTimeStep,
    });

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
    setPromptPreviewByMode({ chat: null, build: null });
    setEditorTab('code');
    setMermaidState(DEFAULT_MERMAID_STATE);
  };

  const handleDiagramTypeChange = async (type: DiagramType) => {
    setDiagramType(type);
    setDiagramIntent(null);
    setPromptPreviewByMode({ chat: null, build: null });
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

  const getDiagramContextMessage = useCallback((): Message | null => {
    const code = mermaidState.code.trim();
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
  }, [mermaidState.code]);

  const buildPromptPreview = useCallback(async (mode: PromptPreviewMode, inputText: string): Promise<LLMRequestPreview> => {
    const trimmed = inputText.trim();
    const relevantMessages = messages.filter((m) => m.id !== 'init');

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
  }, [appState.diagramType, diagramIntent?.content, getBuildDocsContext, getDiagramContextMessage, messages, resolvePreviewLanguage]);

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
