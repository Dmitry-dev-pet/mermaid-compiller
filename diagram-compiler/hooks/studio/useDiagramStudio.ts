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
import { useProjects } from './useProjects';
import type { DiagramMarker } from '../core/useHistory';
import { AUTO_FIX_MAX_ATTEMPTS, DEFAULT_MERMAID_STATE } from '../../constants';
import { detectLanguage } from '../../utils';
import type { DiagramIntent, DiagramType, DocsMode, EditorTab, MermaidState } from '../../types';
import {
  appendEmptyMermaidBlockToMarkdown,
  createMermaidNotebookMarkdown,
  detectMermaidDiagramType,
  extractMermaidBlocksFromMarkdown,
  extractMermaidCode,
  isMarkdownLike,
  replaceMermaidBlockInMarkdown,
  validateMermaidDiagramCode,
} from '../../services/mermaidService';
import { fixDiagram } from '../../services/llmService';
import { runAutoFixLoop } from './autoFix';
import { trackAnalyticsEvent } from '../../services/analyticsService';

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

  const toggleScrollSync = useCallback(() => {
    setAppState((prev) => ({ ...prev, isScrollSyncEnabled: !prev.isScrollSyncEnabled }));
  }, [setAppState]);

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

  const {
    buildPromptPreview,
    promptPreviewByMode,
    resetPromptPreview,
    setPromptPreview,
  } = usePromptPreview({
    diagramType: appState.diagramType,
    analyzeLanguage: appState.analyzeLanguage ?? 'auto',
    appLanguage: appState.language ?? 'auto',
    messages,
    diagramIntent,
    resolveActiveMermaidContext,
    getDocsContext,
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
  }, [historyLoadResult, setMermaidState, setMessages]);

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
      resolveMermaidUpdateTarget,
      getAnalyticsContext,
      trackAnalyticsEvent,
      getDocsContext,
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

  const summarizeFixOutcome = useCallback((args: {
    indexLabel?: string;
    attempts: number;
    changed: boolean;
    cleared: boolean;
    wasValid: boolean;
    errorMessage?: string;
    finalErrorMessage?: string;
    before?: string;
    after?: string;
  }) => {
    const prefix = args.indexLabel ? `Fix: ${args.indexLabel}. ` : 'Fix: ';
    const status = args.cleared
      ? 'блок очищен'
      : args.wasValid
        ? 'валиден'
        : 'все еще с ошибкой';
    const changeNote = args.changed ? 'код изменен' : 'код без изменений';
    const attemptsNote = `попыток: ${args.attempts}`;
    const rawError = args.finalErrorMessage ?? args.errorMessage ?? '';
    const errorLine = rawError.split(/\r?\n/)[0]?.slice(0, 160) ?? '';
    const errorNote = !args.wasValid && errorLine
      ? `ошибка: ${errorLine}`
      : '';
    let typeNote = '';
    let diagnosisNote = '';
    let diffNote = '';
    if (args.changed && !args.cleared && args.before !== undefined && args.after !== undefined) {
      const beforeLines = args.before.split(/\r?\n/);
      const afterLines = args.after.split(/\r?\n/);
      const beforeType = detectMermaidDiagramType(args.before);
      const afterType = detectMermaidDiagramType(args.after);
      if (beforeType || afterType) {
        typeNote = `тип: ${beforeType ?? 'unknown'} → ${afterType ?? 'unknown'}`;
      }
      const beforeHead = beforeLines.find((line) => line.trim().length > 0) ?? '';
      const afterHead = afterLines.find((line) => line.trim().length > 0) ?? '';
      if (beforeHead && afterHead && beforeHead.trim() !== afterHead.trim()) {
        const hasNonAscii = Array.from(beforeHead).some((char) => char.charCodeAt(0) > 127);
        if ((args.errorMessage ?? '').includes('No diagram type detected')) {
          diagnosisNote = `исправлен заголовок диаграммы: "${beforeHead.trim()}" → "${afterHead.trim()}"`;
        }
        if (!diagnosisNote && hasNonAscii) {
          diagnosisNote = `исправлены некорректные символы в заголовке: "${beforeHead.trim()}" → "${afterHead.trim()}"`;
        }
      }
      const maxLines = Math.max(beforeLines.length, afterLines.length);
      let changedLines = 0;
      let firstDiffLine = -1;
      for (let i = 0; i < maxLines; i += 1) {
        const beforeLine = beforeLines[i] ?? '';
        const afterLine = afterLines[i] ?? '';
        if (beforeLine !== afterLine) {
          changedLines += 1;
          if (firstDiffLine === -1) {
            firstDiffLine = i;
          }
        }
      }
      if (changedLines > 0 && firstDiffLine >= 0) {
        const beforeSample = (beforeLines[firstDiffLine] ?? '').slice(0, 80);
        const afterSample = (afterLines[firstDiffLine] ?? '').slice(0, 80);
        diffNote = `изменено строк: ~${changedLines}; пример L${firstDiffLine + 1}: "${beforeSample}" -> "${afterSample}"`;
      }
    }
    const combinedDiagnosis = [typeNote, diagnosisNote].filter(Boolean).join('; ');
    return [
      `Статус: ${prefix}${status} (${changeNote}, ${attemptsNote})`,
      diffNote ? `Изменения: ${diffNote}` : '',
      combinedDiagnosis ? `Диагноз: ${combinedDiagnosis}` : '',
      errorNote ? `Ошибка: ${errorNote.replace(/^ошибка:\s*/i, '')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, []);

  const runMarkdownFix = useCallback(async (args: {
    block: { code: string };
    markdown: string;
    docs: string;
    language: string;
    initialValidation: Awaited<ReturnType<typeof validateMermaidDiagramCode>>;
  }) => {
    const { block, markdown, docs, language, initialValidation } = args;
    const { code: currentCode, validation, attempts } = await runAutoFixLoop({
      initialCode: block.code,
      initialValidation,
      maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
      validate: (code) => validateMermaidDiagramCode(code, { logError: false }),
      fix: async (code, errorMessage) => {
        const fixedRaw = await fixDiagram(code, errorMessage, aiConfig, docs, language);
        return extractMermaidCode(fixedRaw);
      },
    });

    const changed = currentCode !== block.code;
    const cleared = !currentCode.trim();
    const nextMarkdown = changed || cleared
      ? replaceMermaidBlockInMarkdown(markdown, block, currentCode)
      : markdown;

    const nextMermaid = changed || cleared
      ? {
          code: nextMarkdown,
          isValid: true,
          errorMessage: undefined,
          errorLine: undefined,
        }
      : null;

    return {
      currentCode,
      validation,
      attempts,
      changed,
      cleared,
      nextMarkdown,
      nextMermaid,
    };
  }, [aiConfig]);

  const handleFixAllMarkdownBlocks = useCallback(async () => {
    if (connectionState.status !== 'connected') {
      await safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', mode: 'markdown_all' },
      });
      return;
    }

    const startedAt = Date.now();
    setIsProcessing(true);
    try {
      const docs = await getDocsContext('fix');
      const language = resolveFixLanguage();
      const analyticsContext = await getAnalyticsContext('fix');

      let markdown = mermaidState.code;
      let blocks = extractMermaidBlocksFromMarkdown(markdown);

      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const initialValidation = await validateMermaidDiagramCode(block.code, { logError: false });
        if (initialValidation.isValid !== false) continue;

        setMarkdownMermaidActiveIndex(i);

        const diagramType = block.diagramType ?? appState.diagramType;
        const startMessage = addMessage(
          'assistant',
          `Fix: блок ${i + 1} из ${blocks.length} (${diagramType ?? 'unknown'})`,
          'fix'
        );
        trackAnalyticsEvent('diagram_fix_started', {
          ...analyticsContext,
          diagramType,
          mode: 'fix',
          codeLength: block.code.length,
        });

        const {
          currentCode,
          validation,
          attempts,
          changed,
          cleared,
          nextMarkdown,
          nextMermaid,
        } = await runMarkdownFix({
          block,
          markdown,
          docs,
          language,
          initialValidation,
        });

        if (changed || cleared) {
          handleMermaidChange(nextMarkdown);
          markdown = nextMarkdown;
          blocks = extractMermaidBlocksFromMarkdown(markdown);
        }

        if (validation.isValid === false) {
          const resultMessage = addMessage(
            'assistant',
            summarizeFixOutcome({
              indexLabel: `блок ${i + 1} из ${blocks.length}`,
              attempts,
              changed,
              cleared,
              wasValid: false,
              errorMessage: initialValidation.errorMessage,
              finalErrorMessage: validation.errorMessage,
              before: block.code,
              after: currentCode,
            }),
            'fix'
          );
          const stopMessage = addMessage(
            'assistant',
            `Fix остановлен после блока ${i + 1}: исправление не удалось.`,
            'fix'
          );
          await safeAppendTimeStep({
            type: 'fix',
            messages: [startMessage, resultMessage, stopMessage],
            nextMermaid,
            setCurrentRevisionId: cleared ? null : undefined,
            meta: {
              attempts,
              changed,
              isValid: !!validation.isValid,
              cleared,
              diagramType,
              mode: 'markdown_all',
              blockIndex: i,
              stopped: true,
            },
          });
          return;
        }

        const resultMessage = addMessage(
          'assistant',
          summarizeFixOutcome({
            indexLabel: `блок ${i + 1} из ${blocks.length}`,
            attempts,
            changed,
            cleared,
            wasValid: !!validation.isValid,
            errorMessage: initialValidation.errorMessage,
            finalErrorMessage: validation.errorMessage,
            before: block.code,
            after: currentCode,
          }),
          'fix'
        );
        await safeAppendTimeStep({
          type: 'fix',
          messages: [startMessage, resultMessage],
          nextMermaid,
          setCurrentRevisionId: cleared ? null : undefined,
          meta: {
            attempts,
            changed,
            isValid: !!validation.isValid,
            cleared,
            diagramType,
            mode: 'markdown_all',
            blockIndex: i,
          },
        });

        trackAnalyticsEvent('diagram_fix_success', {
          ...analyticsContext,
          diagramType,
          mode: 'fix',
          attempts,
          changed,
          cleared,
          isValid: !!validation.isValid,
          durationMs: Date.now() - startedAt,
          codeLength: currentCode.length,
          errorLine: validation.errorLine,
        });

      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const analyticsContext = await getAnalyticsContext('fix');
      trackAnalyticsEvent('diagram_fix_failed', {
        ...analyticsContext,
        mode: 'fix',
        error: 'exception',
        durationMs: Date.now() - startedAt,
      });
      alert(`Fix failed (${aiConfig.selectedModelId ? `model=${aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: message, mode: 'markdown_all' }
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    addMessage,
    aiConfig,
    appState.diagramType,
    connectionState.status,
    getAnalyticsContext,
    getDocsContext,
    handleMermaidChange,
    mermaidState.code,
    resolveFixLanguage,
    runMarkdownFix,
    summarizeFixOutcome,
    safeAppendTimeStep,
    setMarkdownMermaidActiveIndex,
  ]);

  const handleFixSyntax = useCallback(async () => {
    const activeBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
    const activeDiagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
    const shouldFixMarkdownBlock = !!activeBlock && activeDiagnostics?.isValid === false;
    const firstInvalidIndex = markdownMermaidDiagnostics.findIndex((diag) => diag?.isValid === false);
    const invalidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === false).length;
    const fallbackInvalidBlock =
      firstInvalidIndex >= 0 ? markdownMermaidBlocks[firstInvalidIndex] : undefined;
    const fallbackInvalidDiagnostics =
      firstInvalidIndex >= 0 ? markdownMermaidDiagnostics[firstInvalidIndex] : undefined;

    if (invalidCount > 1 && markdownMermaidBlocks.length > 0) {
      await handleFixAllMarkdownBlocks();
      return;
    }

    const targetBlock = shouldFixMarkdownBlock ? activeBlock : fallbackInvalidBlock;
    const targetDiagnostics = shouldFixMarkdownBlock ? activeDiagnostics : fallbackInvalidDiagnostics;
    const targetIndex = shouldFixMarkdownBlock ? markdownMermaidActiveIndex : firstInvalidIndex;

    if (!targetBlock || targetDiagnostics?.isValid !== false) {
      await baseHandleFixSyntax();
      return;
    }

    if (!shouldFixMarkdownBlock && firstInvalidIndex >= 0 && firstInvalidIndex !== markdownMermaidActiveIndex) {
      setMarkdownMermaidActiveIndex(firstInvalidIndex);
    }

    if (connectionState.status !== 'connected') {
      await safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', diagramType: targetBlock.diagramType ?? appState.diagramType },
      });
      return;
    }

    const startedAt = Date.now();
    setIsProcessing(true);
    try {
      const diagramType = targetBlock.diagramType ?? appState.diagramType;
      const startMessage = addMessage(
        'assistant',
        `Fix: блок ${targetIndex + 1} (${diagramType ?? 'unknown'})`,
        'fix'
      );
      const docs = await getDocsContext('fix');
      const language = resolveFixLanguage();
      const analyticsContext = await getAnalyticsContext('fix');
      trackAnalyticsEvent('diagram_fix_started', {
        ...analyticsContext,
        diagramType,
        mode: 'fix',
        codeLength: targetBlock.code.length,
      });

      const startCode = targetBlock.code;
      const initialValidation = await validateMermaidDiagramCode(startCode, { logError: false });
      const {
        currentCode,
        validation,
        attempts,
        changed,
        cleared,
        nextMarkdown,
        nextMermaid,
      } = await runMarkdownFix({
        block: targetBlock,
        markdown: mermaidState.code,
        docs,
        language,
        initialValidation,
      });

      if (changed || cleared) {
        handleMermaidChange(nextMarkdown);
      }

      const resultMessage = addMessage(
        'assistant',
        summarizeFixOutcome({
          indexLabel: `блок ${targetIndex + 1}`,
          attempts,
          changed,
          cleared,
          wasValid: !!validation.isValid,
          errorMessage: initialValidation.errorMessage,
          finalErrorMessage: validation.errorMessage,
          before: startCode,
          after: currentCode,
        }),
        'fix'
      );
      await safeAppendTimeStep({
        type: 'fix',
        messages: [startMessage, resultMessage],
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

      trackAnalyticsEvent('diagram_fix_success', {
        ...analyticsContext,
        diagramType,
        mode: 'fix',
        attempts,
        changed,
        cleared,
        isValid: !!validation.isValid,
        durationMs: Date.now() - startedAt,
        codeLength: currentCode.length,
        errorLine: validation.errorLine,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const analyticsContext = await getAnalyticsContext('fix');
      trackAnalyticsEvent('diagram_fix_failed', {
        ...analyticsContext,
        mode: 'fix',
        error: 'exception',
        durationMs: Date.now() - startedAt,
      });
      alert(`Fix failed (${aiConfig.selectedModelId ? `model=${aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await safeAppendTimeStep({ type: 'fix', messages: [], meta: { error: message } });
    } finally {
      setIsProcessing(false);
    }
  }, [
    addMessage,
    aiConfig,
    appState.diagramType,
    baseHandleFixSyntax,
    connectionState.status,
    handleFixAllMarkdownBlocks,
    handleMermaidChange,
    markdownMermaidActiveIndex,
    markdownMermaidBlocks,
    markdownMermaidDiagnostics,
    mermaidState.code,
    resolveFixLanguage,
    runMarkdownFix,
    summarizeFixOutcome,
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
    buildPromptPreview,
    setPromptPreview,
    setEditorTab,
    startMarkdownNotebook,
    appendMarkdownMermaidBlock,
    interactionRecorder,
  };
};
