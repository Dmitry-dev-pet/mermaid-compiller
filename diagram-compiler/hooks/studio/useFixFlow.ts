import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { detectLanguage } from '../../utils';
import type { AIConfig, MermaidState, ModelParams, Message, DiagramType } from '../../types';
import {
  detectMermaidDiagramType,
  extractMermaidBlocksFromMarkdown,
  extractMermaidCode,
  replaceMermaidBlockInMarkdown,
  validateMermaidDiagramCode,
} from '../../services/mermaidService';
import type { MermaidMarkdownBlock } from '../../services/mermaidService';
import { fixDiagram } from '../../services/llmService';
import { runLLMRequest, type LLMRequestStartNotice } from '../../services/llmRequestRunner';
import { runAutoFixLoop } from './autoFix';
import { buildSystemPrompt } from '../../services/llm/prompts';
import {
  buildContextTooltipForLog,
  buildDocsTooltipForLog,
  formatDocsDetailForLog,
  summarizeMessagesForLog,
} from './logContextUtils';
import { fetchDiagramSyntaxDoc, formatDocsContext } from '../../services/docsContextService';
import { DIAGRAM_TYPES, normalizeDiagramType } from '../../utils/diagramTypes';
import { augmentMermaidErrorForAutoFix } from '../../utils/mermaidAutoFixHints';

type FixFlowDeps = {
  aiConfig: AIConfig;
  modelParams: ModelParams | null;
  appDiagramType: string | null;
  connectionStatus: string;
  messages: Array<{ id: string; role: string; content: string }>;
  mermaidState: MermaidState;
  markdownMermaidBlocks: Array<{ code: string; diagramType?: string | null }>;
  markdownMermaidDiagnostics: Array<{ isValid?: boolean; errorMessage?: string; errorLine?: number }>;
  markdownMermaidActiveIndex: number;
  setMarkdownMermaidActiveIndex: (index: number) => void;
  handleMermaidChange: (code: string) => void;
  addMessage: (role: 'assistant' | 'user', content: string, mode?: string) => { id: string; role: string; content: string };
  setMessages: Dispatch<SetStateAction<Message[]>>;
  safeAppendTimeStep: (args: {
    type: string;
    messages: Array<{ id: string; role: string; content: string }>;
    nextMermaid?: { code: string; isValid: boolean; errorMessage?: string; errorLine?: number };
    setCurrentRevisionId?: string | null | undefined;
    meta?: Record<string, unknown>;
  }) => Promise<void>;
  getDocsContext: (mode: 'fix') => Promise<string>;
  getDocsSelectionSummary?: (mode: 'fix') => Promise<{
    total: number;
    included: number;
    excluded: number;
    includedPaths: string[];
    excludedPaths: string[];
  }>;
  trackAnalyticsWithContext: (event: string, mode: 'fix', payload?: Record<string, unknown>) => Promise<void>;
  setIsProcessing: (value: boolean) => void;
  baseHandleFixSyntax: () => Promise<void>;
  onLLMRequestStart?: (notice: LLMRequestStartNotice) => void;
  llmTimeoutMs: number;
  startOperation: (title: string, contextId?: string) => string;
  addOperationEvent: (opId: string, args: {
    phase: import('../../types').OperationPhase;
    level: import('../../types').OperationLevel;
    title: string;
    detail?: string;
    tooltip?: string;
    tooltipMessages?: string;
    tooltipDocs?: string;
    kind?: import('../../types').OperationEvent['kind'];
    contextScope?: import('../../types').OperationEvent['contextScope'];
    blockIndex?: number;
    attempt?: import('../../types').OperationEvent['attempt'];
    metrics?: import('../../types').OperationEvent['metrics'];
    error?: import('../../types').OperationEvent['error'];
  }) => void;
  finishOperation: (opId: string, status: import('../../types').OperationLog['status']) => void;
  getOperationLog: (opId: string) => import('../../types').OperationLog | null;
};

export const useFixFlow = (deps: FixFlowDeps) => {
  const coerceToDiagramType = useCallback((value: string | null | undefined): DiagramType | null => {
    const normalized = normalizeDiagramType(value ?? '') ?? null;
    if (!normalized) return null;
    const known = (DIAGRAM_TYPES as readonly string[]).includes(normalized);
    return known ? (normalized as DiagramType) : null;
  }, []);
  const resolveFixLanguage = useCallback(() => {
    const basis = deps.messages
      .slice()
      .reverse()
      .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;
    if (!basis) return 'English';
    return detectLanguage(basis);
  }, [deps.messages]);

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
    const rawError = args.finalErrorMessage ?? args.errorMessage ?? '';
    const errorLine = rawError.split(/\r?\n/)[0]?.slice(0, 160) ?? '';
    const errorNote = !args.wasValid && errorLine ? `ошибка: ${errorLine}` : '';
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
    const combinedDiagnosis = typeNote;
    const errorText = errorNote ? errorNote.replace(/^ошибка:\s*/i, '') : '';
    const statusLine = args.indexLabel ? args.indexLabel : 'блок';
    const resultLabel = args.cleared ? 'очищен' : (args.wasValid ? 'валиден' : 'с ошибкой');
    const changedLabel = args.changed ? 'да' : 'нет';
    const changesSummary = diffNote
      ? diffNote.replace(/^изменено строк:\s*~?\d+;.*$/i, (match) => {
        const count = match.match(/~?\d+/)?.[0] ?? '';
        return count ? `Строк: ${count}` : '';
      }).trim()
      : '';
    const exampleMatch = diffNote.match(/пример\s+L(\d+):\s+"([^"]*)"\s+->\s+"([^"]*)"/i);
    const exampleLine = exampleMatch
      ? `- Пример (L${exampleMatch[1]}): \`${exampleMatch[2]}\` → \`${exampleMatch[3]}\``
      : '';

    const extractLineNumber = (text: string) => {
      const match = text.match(/line\s+(\d+)/i);
      return match ? match[1] : '';
    };
    const lineHint = errorText ? extractLineNumber(errorText) : '';
    const explanation = diagnosisNote
      ? diagnosisNote
      : errorText
        ? (() => {
          if (/no diagram type detected/i.test(errorText)) {
            return 'Не распознан тип диаграммы. Проверьте заголовок.';
          }
          if (/parse error|syntax error|unexpected/i.test(errorText)) {
            return `Синтаксическая ошибка${lineHint ? ` в строке ${lineHint}` : ''}.`;
          }
          return `Mermaid не смог разобрать синтаксис${lineHint ? ` (строка ${lineHint})` : ''}.`;
        })()
        : '';

    const base = [
      `Итог: ${statusLine} — ${resultLabel}; попыток: ${args.attempts}; код изменён: ${changedLabel}.`,
    ];

    if (combinedDiagnosis) base.push(combinedDiagnosis.replace(/^тип:\s*/i, 'Тип: '));
    if (changesSummary) base.push(changesSummary);
    if (!changesSummary && exampleLine) {
      // Drop markdown bullets/backticks; keep as plain text.
      base.push(exampleLine.replace(/^- /, '').replace(/`/g, ''));
    }
    if (explanation) base.push(explanation);
    if (errorText) base.push(`Ошибка: ${errorText.replace(/`/g, '')}`);

    return base.filter(Boolean).join('\n');
  }, []);

  const runMarkdownFix = useCallback(async (args: {
    block: MermaidMarkdownBlock;
    markdown: string;
    docs: string;
    language: string;
    initialValidation: Awaited<ReturnType<typeof validateMermaidDiagramCode>>;
    onAttempt?: (attempt: number, validation: Awaited<ReturnType<typeof validateMermaidDiagramCode>>) => void;
    onLLMStart?: (notice: LLMRequestStartNotice) => void;
    onLLMFinish?: (durationMs: number) => void;
  }) => {
    const { block, markdown, docs, language, initialValidation, onAttempt, onLLMStart, onLLMFinish } = args;
    let iteration = 0;
    let lastRequestStartedAt = 0;
    const { code: currentCode, validation, attempts } = await runAutoFixLoop({
      initialCode: block.code,
      initialValidation,
      maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
      validate: (code) => validateMermaidDiagramCode(code, { logError: false }),
      fix: async (code, errorMessage) => {
        lastRequestStartedAt = Date.now();
        const enrichedErrorMessage = augmentMermaidErrorForAutoFix(
          (block.diagramType ?? deps.appDiagramType ?? 'auto') as DiagramType,
          errorMessage
        );
        const fixedRaw = await runLLMRequest({
          task: 'markdown-fix',
          run: () => fixDiagram(code, enrichedErrorMessage, deps.aiConfig, docs, language, deps.modelParams),
          retries: LLM_TIMEOUT_RETRIES,
          timeoutMs: deps.llmTimeoutMs,
          onStart: (notice) => {
            deps.onLLMRequestStart?.(notice);
            onLLMStart?.(notice);
          },
        });
        onLLMFinish?.(Date.now() - lastRequestStartedAt);
        return extractMermaidCode(fixedRaw);
      },
      onIteration: (_code, nextValidation) => {
        if (iteration > 0) {
          onAttempt?.(iteration, nextValidation);
        }
        iteration += 1;
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
  }, [deps.aiConfig]);

  const handleFixAllMarkdownBlocks = useCallback(async () => {
    if (deps.connectionStatus !== 'connected') {
      deps.addMessage('assistant', 'Не могу запустить Fix: подключите AI.', 'fix');
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', mode: 'markdown_all' },
      });
      return;
    }

    const startedAt = Date.now();
    const opId = deps.startOperation('Fix');
    const logEvent = (args: Parameters<typeof deps.addOperationEvent>[1]) => {
      deps.addOperationEvent(opId, args);
    };
    deps.setIsProcessing(true);
    try {
      const docsSelection = await deps.getDocsSelectionSummary?.('fix');
      const language = resolveFixLanguage();

      let markdown = deps.mermaidState.code;
      let blocks = extractMermaidBlocksFromMarkdown(markdown);
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Fix',
        detail: `all blocks: ${blocks.length}, язык: ${language}`,
      });
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const initialValidation = await validateMermaidDiagramCode(block.code, { logError: false });
        if (initialValidation.isValid !== false) continue;

        deps.setMarkdownMermaidActiveIndex(i);

        const diagramType = block.diagramType ?? (normalizeDiagramType(deps.appDiagramType ?? '') ?? null);
        const diagramTypeForDocs = coerceToDiagramType(diagramType);
        const syntaxDoc = diagramTypeForDocs ? await fetchDiagramSyntaxDoc(diagramTypeForDocs) : { text: '', path: null };
        const docsEntries = syntaxDoc.path ? [{ path: syntaxDoc.path, text: syntaxDoc.text }] : [];
        const docs = docsEntries.length ? formatDocsContext(docsEntries) : await deps.getDocsContext('fix');
        const label = `${i + 1}/${blocks.length} - ${diagramType ?? 'unknown'} - Fix block`;
        logEvent({
          phase: 'fix',
          level: 'info',
          title: 'Block',
          detail: label,
          blockIndex: i,
          kind: 'block',
          contextScope: 'block',
        });
        const docsDetail = formatDocsDetailForLog({
          docsContext: docs,
          selectionSummary: docsEntries.length
            ? { includedPaths: docsEntries.map((entry) => entry.path) }
            : (docsSelection ? { includedPaths: docsSelection.includedPaths } : null),
        });
        const fixMessage: Message = {
          id: `fix-input-${i + 1}`,
          role: 'user',
          content: [
            'Code:',
            '```mermaid',
            block.code,
            '```',
            '',
            'Error:',
            (initialValidation.errorMessage ?? '').trim() || 'Unknown error',
          ].join('\n'),
          timestamp: Date.now(),
        };
        const msgSummary = summarizeMessagesForLog([fixMessage]);
        const systemPrompt = buildSystemPrompt('fix', {
          diagramType: (diagramType ?? deps.appDiagramType ?? 'auto') as DiagramType,
          docsContext: 'Documentation context redacted.',
          language,
        });
        const tooltipMessages = buildContextTooltipForLog({
          systemPrompt,
          messages: [fixMessage],
          docsDetail,
        });
        const tooltipDocs = buildDocsTooltipForLog(docsDetail);
        logEvent({
          phase: 'fix',
          level: 'info',
          title: 'Контекст',
          detail: [`messages: ${msgSummary.count} (${msgSummary.tokens} tok)`, docsDetail].join('\n'),
          tooltipMessages,
          tooltipDocs,
          kind: 'context',
          contextScope: 'block',
          blockIndex: i,
        });
        await deps.trackAnalyticsWithContext('diagram_fix_started', 'fix', {
          diagramType,
          mode: 'fix',
          codeLength: block.code.length,
        });

        let lastDurationMs: number | null = null;
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
          onAttempt: (attempt, nextValidation) => {
            logEvent({
              phase: 'fix',
              level: 'info',
              title: 'Auto-fix',
              detail: `attempt ${attempt}/${AUTO_FIX_MAX_ATTEMPTS}`,
              blockIndex: i,
              attempt: { current: attempt, max: AUTO_FIX_MAX_ATTEMPTS },
              metrics: lastDurationMs ? { durationMs: lastDurationMs } : undefined,
              kind: 'attempt',
              contextScope: 'block',
            });
            if (nextValidation.errorMessage) {
              const line = nextValidation.errorMessage.split(/\r?\n/)[0]?.slice(0, 200) ?? '';
              if (line) {
                logEvent({
                  phase: 'fix',
                  level: 'warn',
                  title: 'Auto-fix error',
                  detail: line,
                  blockIndex: i,
                  attempt: { current: attempt, max: AUTO_FIX_MAX_ATTEMPTS },
                  error: { code: 'validation', message: line },
                  kind: 'attempt',
                  contextScope: 'block',
                });
              }
            }
          },
          onLLMStart: (notice) => {
            logEvent({
              phase: 'fix',
              level: 'info',
              title: 'LLM',
              detail: `start ${notice.task}`,
              blockIndex: i,
              kind: 'attempt',
              contextScope: 'block',
            });
          },
          onLLMFinish: (durationMs) => {
            lastDurationMs = durationMs;
          },
        });

        logEvent({
          phase: 'validate',
          level: validation.isValid ? 'info' : 'warn',
          title: 'Block validation',
          detail: validation.isValid ? 'valid' : 'invalid',
          blockIndex: i,
          metrics: attempts ? { autoFix: attempts } : undefined,
          kind: 'block',
          contextScope: 'block',
        });
        if (!validation.isValid) {
          const line = validation.errorMessage?.split(/\r?\n/)[0]?.slice(0, 200) ?? 'validation error';
          logEvent({
            phase: 'validate',
            level: 'error',
            title: 'Ошибка',
            detail: line,
            blockIndex: i,
            error: { code: 'validation', message: line },
            kind: 'block',
            contextScope: 'block',
          });
        }

        if (changed || cleared) {
          deps.handleMermaidChange(nextMarkdown);
          markdown = nextMarkdown;
          blocks = extractMermaidBlocksFromMarkdown(markdown);
        }

        if (validation.isValid === false) {
          const resultMessage = deps.addMessage(
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
          const stopMessage = deps.addMessage(
            'assistant',
            `Fix остановлен после блока ${i + 1}: исправление не удалось.`,
            'fix'
          );
          await deps.safeAppendTimeStep({
            type: 'fix',
            messages: [resultMessage, stopMessage].filter(Boolean) as Message[],
            nextMermaid,
            setCurrentRevisionId: cleared ? null : undefined,
            meta: {
              attempts,
              changed,
              isValid: !!validation.isValid,
              cleared,
              diagramType,
              mode: 'notebook',
              fixMode: 'markdown_all',
              blockIndex: i,
              totalBlocks: blocks.length,
              stopped: true,
              operationLog: deps.getOperationLog(opId),
            },
          });
          deps.finishOperation(opId, 'error');
          return;
        }

        const resultMessage = deps.addMessage(
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
        await deps.safeAppendTimeStep({
          type: 'fix',
          messages: [resultMessage].filter(Boolean) as Message[],
          nextMermaid,
          setCurrentRevisionId: cleared ? null : undefined,
          meta: {
            attempts,
            changed,
            isValid: !!validation.isValid,
            cleared,
            diagramType,
            mode: 'notebook',
            fixMode: 'markdown_all',
            blockIndex: i,
            totalBlocks: blocks.length,
            operationLog: deps.getOperationLog(opId),
          },
        });

        await deps.trackAnalyticsWithContext('diagram_fix_success', 'fix', {
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
      deps.finishOperation(opId, 'done');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      deps.addMessage('assistant', `Fix failed: ${message}`, 'fix');
      deps.finishOperation(opId, 'error');
      await deps.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        mode: 'fix',
        error: 'exception',
        durationMs: Date.now() - startedAt,
      });
      alert(`Fix failed (${deps.aiConfig.selectedModelId ? `model=${deps.aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: message, mode: 'markdown_all' },
      });
    } finally {
      deps.setIsProcessing(false);
    }
  }, [
    deps,
    resolveFixLanguage,
    runMarkdownFix,
    summarizeFixOutcome,
  ]);

  const handleFixSyntax = useCallback(async () => {
    const activeBlock = deps.markdownMermaidBlocks[deps.markdownMermaidActiveIndex];
    const activeDiagnostics = deps.markdownMermaidDiagnostics[deps.markdownMermaidActiveIndex];
    const shouldFixMarkdownBlock = !!activeBlock && activeDiagnostics?.isValid === false;
    const firstInvalidIndex = deps.markdownMermaidDiagnostics.findIndex((diag) => diag?.isValid === false);
    const invalidCount = deps.markdownMermaidDiagnostics.filter((diag) => diag?.isValid === false).length;
    const fallbackInvalidBlock =
      firstInvalidIndex >= 0 ? deps.markdownMermaidBlocks[firstInvalidIndex] : undefined;
    const fallbackInvalidDiagnostics =
      firstInvalidIndex >= 0 ? deps.markdownMermaidDiagnostics[firstInvalidIndex] : undefined;

    if (invalidCount > 1 && deps.markdownMermaidBlocks.length > 0) {
      await handleFixAllMarkdownBlocks();
      return;
    }

    const targetBlock = shouldFixMarkdownBlock ? activeBlock : fallbackInvalidBlock;
    const targetDiagnostics = shouldFixMarkdownBlock ? activeDiagnostics : fallbackInvalidDiagnostics;
    const targetIndex = shouldFixMarkdownBlock ? deps.markdownMermaidActiveIndex : firstInvalidIndex;

    if (!targetBlock || targetDiagnostics?.isValid !== false) {
      await deps.baseHandleFixSyntax();
      return;
    }

    if (!shouldFixMarkdownBlock && firstInvalidIndex >= 0 && firstInvalidIndex !== deps.markdownMermaidActiveIndex) {
      deps.setMarkdownMermaidActiveIndex(firstInvalidIndex);
    }

    if (deps.connectionStatus !== 'connected') {
      deps.addMessage('assistant', 'Не могу запустить Fix: подключите AI.', 'fix');
      await deps.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        mode: 'fix',
        error: 'offline',
        diagramType: targetBlock.diagramType ?? deps.appDiagramType,
      });
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', diagramType: targetBlock.diagramType ?? deps.appDiagramType },
      });
      return;
    }

    const startedAt = Date.now();
    const opId = deps.startOperation('Fix');
    const logEvent = (args: Parameters<typeof deps.addOperationEvent>[1]) => {
      deps.addOperationEvent(opId, args);
    };
    deps.setIsProcessing(true);
    try {
      const diagramType =
        targetBlock.diagramType ?? (normalizeDiagramType(deps.appDiagramType ?? '') ?? null);
      const totalBlocks = deps.markdownMermaidBlocks.length;
      const label = `${targetIndex + 1}/${totalBlocks} - ${diagramType ?? 'unknown'} - Fix block`;
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Block',
        detail: label,
        blockIndex: targetIndex,
        kind: 'block',
        contextScope: 'block',
      });
      const docsSelection = await deps.getDocsSelectionSummary?.('fix');
      const diagramTypeForDocs = coerceToDiagramType(diagramType);
      const syntaxDoc = diagramTypeForDocs ? await fetchDiagramSyntaxDoc(diagramTypeForDocs) : { text: '', path: null };
      const docsEntries = syntaxDoc.path ? [{ path: syntaxDoc.path, text: syntaxDoc.text }] : [];
      const docs = docsEntries.length ? formatDocsContext(docsEntries) : await deps.getDocsContext('fix');
      const language = resolveFixLanguage();
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Fix',
        detail: `язык: ${language}`,
      });
      const docsDetail = formatDocsDetailForLog({
        docsContext: docs,
        selectionSummary: docsEntries.length
          ? { includedPaths: docsEntries.map((entry) => entry.path) }
          : (docsSelection ? { includedPaths: docsSelection.includedPaths } : null),
      });
      const fixMessage: Message = {
        id: `fix-input-${targetIndex + 1}`,
        role: 'user',
        content: [
          'Code:',
          '```mermaid',
          targetBlock.code,
          '```',
          '',
          'Error:',
          (targetDiagnostics?.errorMessage ?? '').trim() || (targetDiagnostics?.isValid === false ? 'Validation error' : 'Unknown error'),
        ].join('\n'),
        timestamp: Date.now(),
      };
      const msgSummary = summarizeMessagesForLog([fixMessage]);
      const systemPrompt = buildSystemPrompt('fix', {
        diagramType: (diagramType ?? normalizeDiagramType(deps.appDiagramType ?? '') ?? 'auto') as DiagramType,
        docsContext: 'Documentation context redacted.',
        language,
      });
      const tooltipMessages = buildContextTooltipForLog({
        systemPrompt,
        messages: [fixMessage],
        docsDetail,
      });
      const tooltipDocs = buildDocsTooltipForLog(docsDetail);
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Контекст',
        detail: [`messages: ${msgSummary.count} (${msgSummary.tokens} tok)`, docsDetail].join('\n'),
        tooltipMessages,
        tooltipDocs,
        kind: 'context',
        contextScope: 'block',
        blockIndex: targetIndex,
      });
      await deps.trackAnalyticsWithContext('diagram_fix_started', 'fix', {
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
        markdown: deps.mermaidState.code,
        docs,
        language,
        initialValidation,
        onLLMStart: (notice) => {
          logEvent({
            phase: 'fix',
            level: 'info',
            title: 'LLM',
            detail: `start ${notice.task}`,
            blockIndex: targetIndex,
            kind: 'attempt',
            contextScope: 'block',
          });
        },
        onAttempt: (attempt, nextValidation) => {
          logEvent({
            phase: 'fix',
            level: 'info',
            title: 'Auto-fix',
            detail: `attempt ${attempt}/${AUTO_FIX_MAX_ATTEMPTS}`,
            blockIndex: targetIndex,
            attempt: { current: attempt, max: AUTO_FIX_MAX_ATTEMPTS },
            kind: 'attempt',
            contextScope: 'block',
          });
          if (nextValidation.errorMessage) {
            const line = nextValidation.errorMessage.split(/\r?\n/)[0]?.slice(0, 200) ?? '';
            if (line) {
              logEvent({
                phase: 'fix',
                level: 'warn',
                title: 'Auto-fix error',
                detail: line,
                blockIndex: targetIndex,
                attempt: { current: attempt, max: AUTO_FIX_MAX_ATTEMPTS },
                error: { code: 'validation', message: line },
                kind: 'attempt',
                contextScope: 'block',
              });
            }
          }
        },
      });

      if (changed || cleared) {
        deps.handleMermaidChange(nextMarkdown);
      }

      logEvent({
        phase: 'validate',
        level: validation.isValid ? 'info' : 'warn',
        title: 'Block validation',
        detail: validation.isValid ? 'valid' : 'invalid',
        blockIndex: targetIndex,
        metrics: attempts ? { autoFix: attempts } : undefined,
        kind: 'block',
        contextScope: 'block',
      });
      if (!validation.isValid) {
        const line = validation.errorMessage?.split(/\r?\n/)[0]?.slice(0, 200) ?? 'validation error';
        logEvent({
          phase: 'validate',
          level: 'error',
          title: 'Ошибка',
          detail: line,
          blockIndex: targetIndex,
          error: { code: 'validation', message: line },
          kind: 'block',
          contextScope: 'block',
        });
      }

      const resultMessage = deps.addMessage(
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
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [resultMessage].filter(Boolean) as Message[],
        nextMermaid,
        setCurrentRevisionId: cleared ? null : undefined,
        meta: {
          attempts,
          changed,
          isValid: !!validation.isValid,
          cleared,
          diagramType,
          mode: 'notebook',
          fixMode: 'block',
          blockIndex: targetIndex,
          totalBlocks: deps.markdownMermaidBlocks.length,
          operationLog: deps.getOperationLog(opId),
        },
      });
      deps.finishOperation(opId, validation.isValid ? 'done' : 'error');

      await deps.trackAnalyticsWithContext('diagram_fix_success', 'fix', {
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
      deps.addMessage('assistant', `Fix failed: ${message}`, 'fix');
      await deps.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        mode: 'fix',
        error: 'exception',
        durationMs: Date.now() - startedAt,
      });
      alert(`Fix failed (${deps.aiConfig.selectedModelId ? `model=${deps.aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await deps.safeAppendTimeStep({ type: 'fix', messages: [], meta: { error: message } });
      deps.finishOperation(opId, 'error');
    } finally {
      deps.setIsProcessing(false);
    }
  }, [
    deps,
    handleFixAllMarkdownBlocks,
    resolveFixLanguage,
    runMarkdownFix,
    summarizeFixOutcome,
  ]);

  return {
    handleFixSyntax,
    handleFixAllMarkdownBlocks,
    summarizeFixOutcome,
  };
};
