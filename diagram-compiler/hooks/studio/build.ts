import { summarizeBuild } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText, resolveIntentFromInput } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS } from '../../constants';
import { runBuildPipeline } from './buildPipeline';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { normalizeSummaryText, sanitizeSummaryText } from '../../utils/buildSummary';

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
      const buildResult = await runBuildPipeline({
        aiConfig: ctx.aiConfig,
        modelParams: ctx.modelParams,
        diagramType: ctx.appState.diagramType,
        llmMessages,
        docs,
        language,
        maxAttempts: BUILD_MAX_ATTEMPTS,
        autoFixMaxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        callbacks: {
          onAttempt: (attempt, max) => {
            attemptNotes.push(`попытка ${attempt}/${max}`);
            logEvent({
              phase: 'build',
              level: 'info',
              title: 'Генерация',
              attempt: { current: attempt, max },
            });
          },
          onEmpty: (attempt, max) => {
            attemptNotes.push(`попытка ${attempt}: пустой ответ`);
            logEvent({
              phase: 'build',
              level: 'warn',
              title: 'Генерация',
              detail: 'empty',
              attempt: { current: attempt, max },
            });
          },
          onError: (attempt, max, message) => {
            attemptNotes.push(`попытка ${attempt}: ошибка ${message}`);
            logEvent({
              phase: 'build',
              level: 'error',
              title: 'Генерация',
              detail: message,
              attempt: { current: attempt, max },
              error: { code: 'build_error', message },
            });
          },
          onJsonStatus: (attempt, status, reason) => {
            attemptNotes.push(`json status: ${status}${reason ? ` (${reason})` : ''}`);
          },
          onTypeMismatch: (attempt, expected, received) => {
            attemptNotes.push(`type mismatch: ${expected} vs ${received}`);
          },
          onAutoFixAttempt: (attempt, max, errorLine) => {
            logEvent({
              phase: 'fix',
              level: 'info',
              title: 'Auto-fix',
              detail: `attempt ${attempt}/${max}`,
              attempt: { current: attempt, max },
            });
            if (errorLine) {
              logEvent({
                phase: 'fix',
                level: 'warn',
                title: 'Auto-fix error',
                detail: errorLine,
                attempt: { current: attempt, max },
                error: { code: 'validation', message: errorLine },
              });
            }
          },
          onAutoFixIteration: (code, nextValidation) => {
            ctx.applyCompiledResult(code, nextValidation);
          },
          onValidation: (isValid, autoFixAttempts) => {
            logEvent({
              phase: 'validate',
              level: isValid ? 'info' : 'warn',
              title: 'Валидация',
              detail: isValid ? 'валидна' : 'невалидна',
              metrics: autoFixAttempts ? { autoFix: autoFixAttempts } : undefined,
            });
          },
          onValidationError: (errorLine) => {
            logEvent({
              phase: 'validate',
              level: 'error',
              title: 'Ошибка',
              detail: errorLine || 'validation error',
              error: { code: 'validation', message: errorLine || 'validation error' },
            });
          },
        },
      });

      if (attemptNotes.length > 0) {
        pushStatus(['Сборка', '- попытки', ...attemptNotes.map((note) => `- ${note}`)].join('\n'));
      }

      if (buildResult.status !== 'ok' || !buildResult.code) {
        const reason = buildResult.lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        pushStatus(`Сборка\n- не удалось: ${reason}`);
        logEvent({
          phase: 'build',
          level: 'error',
          title: 'Сборка',
          detail: reason,
          error: { code: reason, message: buildResult.lastError ?? reason },
        });
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: reason,
          attempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          durationMs: Date.now() - startedAt,
        });
        stepMessages.push(ctx.addMessage('assistant', 'Итог: сборка завершилась с ошибкой. Проверьте лог.', 'build'));
        await finalizeStep('error', {
          reason,
          attempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          error: buildResult.lastError ?? undefined,
        });
        return;
      }

      if (buildResult.usedFallback) {
        pushStatus('Сборка\n- fallback: использован шаблон');
        logEvent({
          phase: 'build',
          level: 'warn',
          title: 'Сборка',
          detail: 'fallback_template',
        });
      }

      const currentCode = buildResult.code;
      const validation = buildResult.validation;
      const autoFixAttempts = buildResult.autoFixAttempts;

      pushStatus(
        [
          'Сборка',
          `- валидация: ${validation.isValid ? 'валидна' : 'невалидна'}`,
          autoFixAttempts ? `- auto-fix: ${autoFixAttempts}` : '',
        ].filter(Boolean).join('\n')
      );

      await ctx.trackAnalyticsWithContext('diagram_build_success', 'build', {
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        buildAttempts: buildResult.attempts,
        autoFixAttempts,
        emptyResponses: buildResult.emptyResponses,
        durationMs: Date.now() - startedAt,
        codeLength: currentCode.length,
      });
      const fallbackSummary = [
        `Итог: диаграмма ${validation.isValid ? 'готова' : 'с ошибками'}.`,
        buildResult.usedFallback ? 'Использован шаблон.' : '',
        autoFixAttempts ? `Auto-fix: ${autoFixAttempts}.` : '',
      ].filter(Boolean).join(' ');
      let resolvedSummary = normalizeSummaryText(fallbackSummary);
      try {
        logEvent({
          phase: 'build',
          level: 'info',
          title: 'Итог',
          detail: 'generating',
        });
        const summaryInput = [
          `Тип: ${ctx.appState.diagramType}`,
          `Валидность: ${validation.isValid ? 'ok' : 'error'}`,
          `Попытки сборки: ${buildResult.attempts}/${BUILD_MAX_ATTEMPTS}`,
          `Auto-fix: ${autoFixAttempts}`,
          `Fallback: ${buildResult.usedFallback ? 'yes' : 'no'}`,
          `Intent length: ${normalizedIntent.length}`,
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
          const summaryPrefix = language === 'Russian' ? 'Итог:' : 'Summary:';
          resolvedSummary = cleanedSummary.toLowerCase().startsWith(summaryPrefix.toLowerCase())
            ? cleanedSummary
            : `${summaryPrefix} ${cleanedSummary}`;
        }
        logEvent({
          phase: 'done',
          level: 'info',
          title: 'Итог',
          detail: 'ready',
        });
      } catch {
        logEvent({
          phase: 'error',
          level: 'warn',
          title: 'Итог',
          detail: 'fallback',
        });
      }
      stepMessages.push(ctx.addMessage('assistant', resolvedSummary, 'build'));
      await finalizeStep('done', {
        nextMermaid: ctx.resolveMermaidUpdate(currentCode, validation),
        meta: {
          diagramType: ctx.appState.diagramType,
          isValid: !!validation.isValid,
          autoFixAttempts: autoFixAttempts,
          buildAttempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          fallbackUsed: buildResult.usedFallback,
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
