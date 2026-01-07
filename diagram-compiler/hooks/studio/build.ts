import { validateMermaid, extractMermaidCode, parseMermaidJsonResponse } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram, summarizeBuild } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText, resolveIntentFromInput } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import { runAttemptLoop } from './retry';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { formatTimeoutRetryMessage } from './stepMessageUtils';
import type { DiagramType } from '../../types';

const tryAnalyzeAfterBuild = async (ctx: StudioContext, args: { code: string; docs: string; language: string }) => {
  try {
    const explanation = await runLLMRequest({
      task: 'analyze-summary',
      run: () => analyzeDiagram(args.code, ctx.aiConfig, args.docs, args.language, ctx.modelParams),
      retries: 1,
    });
    return stripMermaidCode(explanation).trim();
  } catch {
    return '';
  }
};

const normalizeSummaryText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const spaced = trimmed.replace(/([.!?])([A-Za-zА-Яа-я])/g, '$1 $2');
  const prefixMatch = spaced.match(/^(Итог:|Summary:)\s*/i);
  const prefix = prefixMatch?.[0] ?? '';
  const rest = prefix ? spaced.slice(prefix.length).trim() : spaced;
  const sentences = rest
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const sentence of sentences) {
    if (unique[unique.length - 1] === sentence) continue;
    if (!unique.includes(sentence)) {
      unique.push(sentence);
    }
  }
  const rebuilt = unique.join(' ').trim();
  return `${prefix}${rebuilt}`.trim();
};

const sanitizeSummaryText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
      if (content) return content;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (summary) return summary;
    }
  } catch {
    // ignore parse errors, fall back to raw text
  }
  return candidate;
};

const getFallbackMermaid = (diagramType: DiagramType): string | null => {
  switch (diagramType) {
    case 'flowchart':
      return [
        'flowchart TD',
        'A["Start"] --> B["End"]',
      ].join('\n');
    case 'sequence':
      return [
        'sequenceDiagram',
        'participant A as User',
        'participant B as System',
        'A->>B: Request',
        'B-->>A: Response',
      ].join('\n');
    case 'er':
      return [
        'erDiagram',
        'USER ||--o{ ORDER : places',
        'USER {',
        '  int id',
        '}',
        'ORDER {',
        '  int id',
        '}',
      ].join('\n');
    case 'architecture':
      return [
        'architecture-beta',
        '  service client(server)[Client]',
        '  service proxy(server)[Proxy]',
        '  service target(server)[Target]',
        '  client:R -- L:proxy',
        '  proxy:R -- L:target',
      ].join('\n');
    default:
      return null;
  }
};

export const createBuildHandler = (ctx: StudioContext) => {
  return async (text?: string) => {
    const prompt = text?.trim() ?? '';
    const stepMessages: Message[] = [];
    const opId = ctx.startOperation('Сборка');
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, {
        ...args,
        blockIndex: typeof notebookBlockIndex === 'number' ? notebookBlockIndex : args.blockIndex,
      });
    };
    const finalizeStep = async (
      status: 'done' | 'error',
      args?: {
        meta?: Record<string, unknown>;
        nextMermaid?: Pick<import('../../types').MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
      }
    ) => {
      ctx.finishOperation(opId, status);
      await ctx.safeRecordTimeStep({
        type: 'build',
        messages: stepMessages,
        nextMermaid: args?.nextMermaid ?? null,
        meta: {
          ...(args?.meta ?? {}),
          operationLog: ctx.getOperationLog(opId),
        },
      });
    };
    const pushStatus = (content: string) => {
      stepMessages.push(ctx.addMessage('assistant', content, 'build'));
    };
    if (prompt) stepMessages.push(ctx.addMessage('user', prompt, 'build'));

    if (ctx.connectionState.status !== 'connected') {
      pushStatus('Офлайн. Подключите AI для генерации диаграмм.');
      logEvent({
        phase: 'build',
        level: 'error',
        title: 'Сборка',
        detail: 'offline',
        error: { code: 'offline', message: 'AI offline' },
      });
      await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
        error: 'offline',
      });
      await finalizeStep('error', { error: 'offline' });
      return;
    }

    const language = ctx.resolveLanguage(prompt);

    ctx.setIsProcessing(true);
    try {
      pushStatus(
        [
          'Сборка',
          `- старт`,
          `- тип: ${ctx.appState.diagramType}`,
          `- язык: ${language}`,
          `- модель: ${ctx.getCurrentModelName()}`,
        ].join('\n')
      );
      logEvent({
        phase: 'build',
        level: 'info',
        title: 'Сборка',
        detail: `тип: ${ctx.appState.diagramType}, язык: ${language}`,
      });
      const docs = await ctx.getDocsContext('build');
      const relevantMessages = ctx.getRelevantMessages();

      const intent = resolveIntentFromInput({
        prompt,
        diagramIntent: ctx.getCurrentIntent(),
        messages: relevantMessages,
        allowFallback: true,
        preferAssistant: ctx.isNotebookChatMode,
        assistantMode: 'chat',
      });
      if (!intent) {
        pushStatus('Нет intent для сборки. Используйте чат, чтобы описать задачу.');
        logEvent({
          phase: 'planning',
          level: 'error',
          title: 'Intent',
          detail: 'missing',
          error: { code: 'no_intent', message: 'Intent missing' },
        });
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: 'no_intent',
        });
        await finalizeStep('error', { error: 'no_intent' });
        return;
      }

      const startedAt = Date.now();
      await ctx.trackAnalyticsWithContext('diagram_build_started', 'build', {
        intentSource: intent.source,
        hasPrompt: !!prompt,
      });

      const normalizedIntent = normalizeIntentText(intent.content);
      const intentMessage = ctx.getIntentMessage(normalizedIntent);
      const diagramContext = ctx.getDiagramContextMessage();
      const llmMessages = diagramContext ? [intentMessage, diagramContext] : [intentMessage];

      ctx.setCurrentIntent({
        content: normalizedIntent,
        source: intent.source,
        updatedAt: Date.now(),
      });
      pushStatus(
        [
          'Сборка',
          `- intent готов`,
          `- источник: ${intent.source}`,
          `- длина: ${normalizedIntent.length}`,
        ].join('\n')
      );

      // keep intent details in log only (no chat message)
      logEvent({
        phase: 'planning',
        level: 'info',
        title: 'Intent',
        detail: `источник: ${intent.source}, длина: ${normalizedIntent.length}`,
      });

      const attemptNotes: string[] = [];
      const attemptResult = await runAttemptLoop({
        maxAttempts: BUILD_MAX_ATTEMPTS,
        onAttempt: (attempt) => {
          attemptNotes.push(`попытка ${attempt}/${BUILD_MAX_ATTEMPTS}`);
          logEvent({
            phase: 'build',
            level: 'info',
            title: 'Генерация',
            attempt: { current: attempt, max: BUILD_MAX_ATTEMPTS },
          });
        },
        onEmpty: (attempt) => {
          attemptNotes.push(`попытка ${attempt}: пустой ответ`);
          logEvent({
            phase: 'build',
            level: 'warn',
            title: 'Генерация',
            detail: 'empty',
            attempt: { current: attempt, max: BUILD_MAX_ATTEMPTS },
          });
        },
        onError: (attempt, error) => {
          const message = error instanceof Error ? error.message : String(error);
          attemptNotes.push(`попытка ${attempt}: ошибка ${message}`);
          logEvent({
            phase: 'build',
            level: 'error',
            title: 'Генерация',
            detail: message,
            attempt: { current: attempt, max: BUILD_MAX_ATTEMPTS },
            error: { code: 'build_error', message },
          });
        },
        execute: async () => {
          const rawCode = await runLLMRequest({
            task: 'build',
            run: () => generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams),
            retries: 1,
          });
          const parsed = parseMermaidJsonResponse(rawCode);
          if (parsed) {
            if (parsed.status !== 'ok') {
              attemptNotes.push(`json status: ${parsed.status}${parsed.reason ? ` (${parsed.reason})` : ''}`);
              return null;
            }
            if (!parsed.mermaid?.trim()) {
              attemptNotes.push('json: нет mermaid');
              return null;
            }
            if (ctx.appState.diagramType !== 'auto' && parsed.diagramType && parsed.diagramType !== ctx.appState.diagramType) {
              attemptNotes.push(`json: несоответствие diagram_type ${parsed.diagramType}`);
              return null;
            }
            return parsed.mermaid;
          }

          const cleanCode = extractMermaidCode(rawCode);
          return cleanCode.trim() ? cleanCode : null;
        },
      });

      if (attemptNotes.length > 0) {
        pushStatus(['Сборка', '- попытки', ...attemptNotes.map((note) => `- ${note}`)].join('\n'));
      }

      const fallbackCode = getFallbackMermaid(ctx.appState.diagramType);
      const resolvedCode = attemptResult.value?.trim() || fallbackCode?.trim() || '';
      const usedFallback = !attemptResult.value?.trim() && !!fallbackCode;

      if (!resolvedCode) {
        const reason = attemptResult.lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        pushStatus(`Сборка\n- не удалось: ${reason}`);
        logEvent({
          phase: 'build',
          level: 'error',
          title: 'Сборка',
          detail: reason,
          error: { code: reason, message: attemptResult.lastError ?? reason },
        });
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: reason,
          attempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          durationMs: Date.now() - startedAt,
        });
        stepMessages.push(ctx.addMessage('assistant', 'Итог: сборка завершилась с ошибкой. Проверьте лог.', 'build'));
        await finalizeStep('error', {
          reason,
          attempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          error: attemptResult.lastError ?? undefined,
        });
        return;
      }

      if (usedFallback) {
        pushStatus('Сборка\n- fallback: использован шаблон');
        logEvent({
          phase: 'build',
          level: 'warn',
          title: 'Сборка',
          detail: 'fallback_template',
        });
      }

      const cleanCode = resolvedCode;
      const initialValidation = await validateMermaid(cleanCode, { logError: false });
      const { code: currentCode, validation, attempts: autoFixAttempts } = await runAutoFixLoop({
        initialCode: cleanCode,
        initialValidation,
        maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        validate: (code) => validateMermaid(code, { logError: false }),
              fix: async (code, errorMessage) => {
                const fixedRaw = await runLLMRequest({
                  task: 'auto-fix',
                  run: () => fixDiagram(
                    code,
                    errorMessage,
                    ctx.aiConfig,
                    docs,
                    language,
                    ctx.modelParams
                  ),
                  retries: LLM_TIMEOUT_RETRIES,
                  onTimeout: (notice) => {
                    pushStatus(formatTimeoutRetryMessage('Auto-fix', notice.attempt, notice.maxAttempts));
                  },
                });
                return extractMermaidCode(fixedRaw);
              },
        onIteration: (code, nextValidation) => {
          ctx.applyCompiledResult(code, nextValidation);
        },
      });
      pushStatus(
        [
          'Сборка',
          `- валидация: ${validation.isValid ? 'валидна' : 'невалидна'}`,
          autoFixAttempts ? `- auto-fix: ${autoFixAttempts}` : '',
        ].filter(Boolean).join('\n')
      );
      logEvent({
        phase: 'validate',
        level: validation.isValid ? 'info' : 'warn',
        title: 'Валидация',
        detail: validation.isValid ? 'валидна' : 'невалидна',
        metrics: autoFixAttempts ? { autoFix: autoFixAttempts } : undefined,
      });

      const autoFixNote =
        autoFixAttempts === 0
          ? ''
          : validation.isValid
            ? ` Auto-fixed (${autoFixAttempts}).`
            : ` Auto-fix attempted (${autoFixAttempts}), still invalid.`;

      const afterSummary = await tryAnalyzeAfterBuild(ctx, {
        code: currentCode,
        docs,
        language,
      });
      pushStatus(
        [
          'Сборка (итог)',
          `- диаграмма: ${ctx.appState.diagramType}`,
          `- ${validation.isValid ? 'валидна' : 'с ошибками'}`,
          autoFixNote ? `- ${autoFixNote.trim().replace(/\.$/, '')}` : '',
          afterSummary ? `- сводка: ${afterSummary}` : '',
        ].filter(Boolean).join('\n')
      );
      await ctx.trackAnalyticsWithContext('diagram_build_success', 'build', {
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        buildAttempts: attemptResult.attempts,
        autoFixAttempts,
        emptyResponses: attemptResult.emptyResponses,
        durationMs: Date.now() - startedAt,
        codeLength: currentCode.length,
      });
      const fallbackSummary = [
        `Итог: диаграмма ${validation.isValid ? 'готова' : 'с ошибками'}.`,
        usedFallback ? 'Использован шаблон.' : '',
        autoFixAttempts ? `Auto-fix: ${autoFixAttempts}.` : '',
      ].filter(Boolean).join(' ');
      const summaryPrefix = language === 'Russian' ? 'Итог:' : 'Summary:';
      let resolvedSummary = fallbackSummary;
      try {
        const summaryInput = [
          `Тип: ${ctx.appState.diagramType}`,
          `Валидность: ${validation.isValid ? 'ok' : 'error'}`,
          `Попытки сборки: ${attemptResult.attempts}/${BUILD_MAX_ATTEMPTS}`,
          `Auto-fix: ${autoFixAttempts}`,
          `Fallback: ${usedFallback ? 'yes' : 'no'}`,
        ].join('\n');
        const summaryText = await runLLMRequest({
          task: 'build-summary',
          run: () => summarizeBuild(
            [{ id: 'build-summary', role: 'user', content: summaryInput, timestamp: Date.now() }],
            ctx.aiConfig,
            '',
            language,
            ctx.modelParams
          ),
          retries: 1,
        });
        const cleanedSummary = normalizeSummaryText(
          sanitizeSummaryText(stripMermaidCode(summaryText))
        );
        if (cleanedSummary) {
          resolvedSummary = cleanedSummary.toLowerCase().startsWith(summaryPrefix.toLowerCase())
            ? cleanedSummary
            : `${summaryPrefix} ${cleanedSummary}`;
        }
      } catch {
        // fallback to deterministic summary
      }
      stepMessages.push(ctx.addMessage('assistant', resolvedSummary, 'build'));
      await finalizeStep('done', {
        nextMermaid: ctx.resolveMermaidUpdate(currentCode, validation),
        meta: {
          diagramType: ctx.appState.diagramType,
          isValid: !!validation.isValid,
          autoFixAttempts: autoFixAttempts,
          buildAttempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          fallbackUsed: usedFallback,
          intent: intent.content,
          intentSource: intent.source,
        },
      });
      pushStatus('Сборка\n- история сохранена');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      pushStatus(`Сборка: ошибка (${ctx.getCurrentModelName()}): ${message}`);
      logEvent({
        phase: 'build',
        level: 'error',
        title: 'Сборка',
        detail: message,
        error: { code: 'exception', message },
      });
      await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
        error: 'exception',
      });
      stepMessages.push(ctx.addMessage('assistant', 'Итог: сборка завершилась с ошибкой. Проверьте лог.', 'build'));
      await finalizeStep('error', { error: message });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
