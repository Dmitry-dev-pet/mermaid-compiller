import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { detectLanguage } from '../../utils';
import type { AIConfig, MermaidState, ModelParams, Message } from '../../types';
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
import { createProgressTracker } from './progressTracker';

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
  trackAnalyticsWithContext: (event: string, mode: 'fix', payload?: Record<string, unknown>) => Promise<void>;
  setIsProcessing: (value: boolean) => void;
  baseHandleFixSyntax: () => Promise<void>;
  onLLMRequestStart?: (notice: LLMRequestStartNotice) => void;
  llmTimeoutMs: number;
};

export const useFixFlow = (deps: FixFlowDeps) => {
  const pushStatus = useCallback((content: string) => {
    deps.addMessage('assistant', content, 'fix');
  }, [deps]);

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

    return [
      '## Итог',
      `- Блок: ${statusLine}`,
      `- Результат: ${resultLabel}`,
      `- Попыток: ${args.attempts}`,
      `- Код изменен: ${changedLabel}`,
      changesSummary || exampleLine ? '\n## Изменения' : '',
      changesSummary ? `- ${changesSummary}` : '',
      exampleLine ? exampleLine : '',
      combinedDiagnosis ? '\n## Диаграмма' : '',
      combinedDiagnosis ? `- ${combinedDiagnosis.replace(/^тип:\s*/i, 'Тип: ')}` : '',
      explanation ? '\n## Пояснение' : '',
      explanation ? `- ${explanation}` : '',
      errorText ? '\n## Ошибка' : '',
      errorText ? `- ${errorText}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, []);

  const runMarkdownFix = useCallback(async (args: {
    block: MermaidMarkdownBlock;
    markdown: string;
    docs: string;
    language: string;
    initialValidation: Awaited<ReturnType<typeof validateMermaidDiagramCode>>;
    onAttempt?: (attempt: number, validation: Awaited<ReturnType<typeof validateMermaidDiagramCode>>) => void;
  }) => {
    const { block, markdown, docs, language, initialValidation, onAttempt } = args;
    let iteration = 0;
    const { code: currentCode, validation, attempts } = await runAutoFixLoop({
      initialCode: block.code,
      initialValidation,
      maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
      validate: (code) => validateMermaidDiagramCode(code, { logError: false }),
      fix: async (code, errorMessage) => {
        const fixedRaw = await runLLMRequest({
          task: 'markdown-fix',
          run: () => fixDiagram(code, errorMessage, deps.aiConfig, docs, language, deps.modelParams),
          retries: LLM_TIMEOUT_RETRIES,
          timeoutMs: deps.llmTimeoutMs,
          onStart: deps.onLLMRequestStart,
        });
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
      pushStatus('Исправление (все блоки)\n- офлайн: подключите AI');
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [],
        meta: { error: 'offline', mode: 'markdown_all' },
      });
      return;
    }

    const startedAt = Date.now();
    deps.setIsProcessing(true);
    try {
      const docs = await deps.getDocsContext('fix');
      const language = resolveFixLanguage();

      let markdown = deps.mermaidState.code;
      let blocks = extractMermaidBlocksFromMarkdown(markdown);
      pushStatus(
        [
          'Исправление (все блоки)',
          '- старт',
          `- блоков: ${blocks.length}`,
          `- язык: ${language}`,
        ].join('\n')
      );
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        const initialValidation = await validateMermaidDiagramCode(block.code, { logError: false });
        if (initialValidation.isValid !== false) continue;

        deps.setMarkdownMermaidActiveIndex(i);

        const diagramType = block.diagramType ?? deps.appDiagramType;
        const label = `блок ${i + 1} из ${blocks.length} (${diagramType ?? 'unknown'})`;
        const tracker = createProgressTracker({
          setMessages: deps.setMessages,
          prefix: `[fix-block:${i}] `,
          mode: 'fix',
        });
        tracker.update(`Fix: ${label} — start.`);
        pushStatus(`Исправление: ${label}\n- старт`);
        await deps.trackAnalyticsWithContext('diagram_fix_started', 'fix', {
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
          onAttempt: (attempt, nextValidation) => {
            tracker.update(
              `Fix: ${label} — попытка ${attempt}/${AUTO_FIX_MAX_ATTEMPTS}.${nextValidation.isValid ? ' Валиден.' : ''}`
            );
          },
        });

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
          const progressMessage = tracker.getMessage();
          await deps.safeAppendTimeStep({
            type: 'fix',
            messages: [progressMessage, resultMessage, stopMessage].filter(Boolean) as Message[],
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
            },
          });
          pushStatus(`Исправление: ${label}\n- не удалось после ${attempts} попыток`);
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
        const progressMessage = tracker.getMessage();
        await deps.safeAppendTimeStep({
          type: 'fix',
          messages: [progressMessage, resultMessage].filter(Boolean) as Message[],
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
          },
        });
        pushStatus(
          `Исправление: ${label}\n- итог: ${validation.isValid ? 'валиден' : 'невалиден'}`
        );

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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      pushStatus(`Исправление (все блоки)\n- ошибка: ${message}`);
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
    pushStatus,
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
      pushStatus('Исправление\n- офлайн: подключите AI');
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
    deps.setIsProcessing(true);
    try {
      const diagramType = targetBlock.diagramType ?? deps.appDiagramType;
      const label = `блок ${targetIndex + 1} (${diagramType ?? 'unknown'})`;
      const tracker = createProgressTracker({
        setMessages: deps.setMessages,
        prefix: `[fix-block:${targetIndex}] `,
        mode: 'fix',
      });
      tracker.update(`Fix: ${label} — start.`);
      const docs = await deps.getDocsContext('fix');
      const language = resolveFixLanguage();
      pushStatus(
        [
          `Исправление: ${label}`,
          '- старт',
          `- язык: ${language}`,
        ].join('\n')
      );
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
        onAttempt: (attempt, nextValidation) => {
          tracker.update(
            `Fix: ${label} — попытка ${attempt}/${AUTO_FIX_MAX_ATTEMPTS}.${nextValidation.isValid ? ' Валиден.' : ''}`
          );
        },
      });

      if (changed || cleared) {
        deps.handleMermaidChange(nextMarkdown);
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
      const progressMessage = tracker.getMessage();
      await deps.safeAppendTimeStep({
        type: 'fix',
        messages: [progressMessage, resultMessage].filter(Boolean) as Message[],
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
        },
      });
      pushStatus(
        `Исправление: ${label}\n- итог: ${validation.isValid ? 'валиден' : 'невалиден'}`
      );

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
      pushStatus(`Исправление: ошибка ${message}`);
      await deps.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        mode: 'fix',
        error: 'exception',
        durationMs: Date.now() - startedAt,
      });
      alert(`Fix failed (${deps.aiConfig.selectedModelId ? `model=${deps.aiConfig.selectedModelId}` : 'model=unknown'}): ${message}`);
      await deps.safeAppendTimeStep({ type: 'fix', messages: [], meta: { error: message } });
    } finally {
      deps.setIsProcessing(false);
    }
  }, [
    deps,
    handleFixAllMarkdownBlocks,
    pushStatus,
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
