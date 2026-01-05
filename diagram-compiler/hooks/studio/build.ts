import { validateMermaid, extractMermaidCode, parseMermaidJsonResponse } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText, resolveIntentFromInput } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import { runAttemptLoop } from './retry';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { formatTimeoutRetryMessage } from './stepMessageUtils';

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

export const createBuildHandler = (ctx: StudioContext) => {
  return async (text?: string) => {
    const prompt = text?.trim() ?? '';
    const stepMessages: Message[] = [];
    const pushStatus = (content: string) => {
      stepMessages.push(ctx.addMessage('assistant', content, 'build'));
    };
    if (prompt) stepMessages.push(ctx.addMessage('user', prompt, 'build'));

    if (ctx.connectionState.status !== 'connected') {
      pushStatus('Офлайн. Подключите AI для генерации диаграмм.');
      await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
        error: 'offline',
      });
      await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages });
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
      const docs = await ctx.getDocsContext('build');
      const relevantMessages = ctx.getRelevantMessages();

      const intent = resolveIntentFromInput({
        prompt,
        diagramIntent: ctx.getCurrentIntent(),
        messages: relevantMessages,
        allowFallback: true,
      });
      if (!intent) {
        pushStatus('Нет intent для сборки. Используйте чат, чтобы описать задачу.');
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: 'no_intent',
        });
        await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages });
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

      const beforeSummary = `Build (before): Intent (${intent.source}). ${ctx.normalizeText(normalizedIntent)}`;
      pushStatus(beforeSummary);

      const attemptNotes: string[] = [];
      const attemptResult = await runAttemptLoop({
        maxAttempts: BUILD_MAX_ATTEMPTS,
        onAttempt: (attempt) => {
          attemptNotes.push(`попытка ${attempt}/${BUILD_MAX_ATTEMPTS}`);
        },
        onEmpty: (attempt) => {
          attemptNotes.push(`попытка ${attempt}: пустой ответ`);
        },
        onError: (attempt, error) => {
          const message = error instanceof Error ? error.message : String(error);
          attemptNotes.push(`попытка ${attempt}: ошибка ${message}`);
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

      if (!attemptResult.value?.trim()) {
        const reason = attemptResult.lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        pushStatus(`Сборка\n- не удалось: ${reason}`);
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: reason,
          attempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          durationMs: Date.now() - startedAt,
        });
        await ctx.safeRecordTimeStep({
          type: 'build',
          messages: stepMessages,
          meta: {
            reason,
            attempts: attemptResult.attempts,
            emptyResponses: attemptResult.emptyResponses,
            error: attemptResult.lastError ?? undefined,
          },
        });
        return;
      }

      const cleanCode = attemptResult.value;
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
      await ctx.safeRecordTimeStep({
        type: 'build',
        messages: stepMessages,
        nextMermaid: ctx.resolveMermaidUpdate(currentCode, validation),
        meta: {
          diagramType: ctx.appState.diagramType,
          isValid: !!validation.isValid,
          autoFixAttempts: autoFixAttempts,
          buildAttempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          intent: intent.content,
          intentSource: intent.source,
        },
      });
      pushStatus('Сборка\n- история сохранена');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      pushStatus(`Сборка: ошибка (${ctx.getCurrentModelName()}): ${message}`);
      await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
        error: 'exception',
      });
      await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
