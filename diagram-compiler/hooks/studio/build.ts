import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import { runAttemptLoop } from './retry';

const buildIntent = (ctx: StudioContext, args: {
  prompt: string;
  relevantMessages: Message[];
}): { content: string; source: 'chat' | 'build' | 'fallback' } | null => {
  const { prompt, relevantMessages } = args;
  if (prompt) {
    return { content: prompt, source: 'build' };
  }

  const existing = ctx.getCurrentIntent();
  if (existing?.content.trim()) {
    return { content: existing.content, source: existing.source };
  }

  const lastUserText = ctx.getLastUserText(relevantMessages).trim();
  if (lastUserText) {
    return { content: lastUserText, source: 'fallback' };
  }

  return null;
};

const tryAnalyzeAfterBuild = async (ctx: StudioContext, args: { code: string; docs: string; language: string }) => {
  try {
    const explanation = await analyzeDiagram(args.code, ctx.aiConfig, args.docs, args.language);
    return stripMermaidCode(explanation).trim();
  } catch {
    return '';
  }
};

export const createBuildHandler = (ctx: StudioContext) => {
  return async (text?: string) => {
    const prompt = text?.trim() ?? '';
    const stepMessages: Message[] = [];
    if (prompt) stepMessages.push(ctx.addMessage('user', prompt, 'build'));

    if (ctx.connectionState.status !== 'connected') {
      stepMessages.push(ctx.addMessage('assistant', "I'm offline. Connect AI to generate diagrams.", 'build'));
      ctx.trackAnalyticsEvent('diagram_build_failed', {
        ...(await ctx.getAnalyticsContext('build')),
        mode: 'build',
        error: 'offline',
      });
      await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages });
      return;
    }

    const language = ctx.resolveLanguage(prompt);

    ctx.setIsProcessing(true);
    try {
      const analyticsContext = await ctx.getAnalyticsContext('build');
      const docs = await ctx.getDocsContext('build');
      const relevantMessages = ctx.getRelevantMessages();

      const intent = buildIntent(ctx, { prompt, relevantMessages });
      if (!intent) {
        stepMessages.push(ctx.addMessage('assistant', 'Nothing to build yet. Use Chat to define intent.', 'build'));
        ctx.trackAnalyticsEvent('diagram_build_failed', {
          ...analyticsContext,
          mode: 'build',
          error: 'no_intent',
        });
        await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages });
        return;
      }

      const startedAt = Date.now();
      ctx.trackAnalyticsEvent('diagram_build_started', {
        ...analyticsContext,
        mode: 'build',
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

      const beforeSummary = `Build (before): Intent (${intent.source}). ${ctx.normalizeText(normalizedIntent)}`;
      stepMessages.push(ctx.addMessage('assistant', beforeSummary, 'build'));

      const attemptResult = await runAttemptLoop({
        maxAttempts: BUILD_MAX_ATTEMPTS,
        onAttempt: (attempt) => {
          stepMessages.push(
            ctx.addMessage('assistant', `Build attempt ${attempt}/${BUILD_MAX_ATTEMPTS}...`, 'build')
          );
        },
        onEmpty: (attempt) => {
          stepMessages.push(ctx.addMessage('assistant', `Attempt ${attempt}: no Mermaid code returned.`, 'build'));
        },
        onError: (attempt, error) => {
          const message = error instanceof Error ? error.message : String(error);
          stepMessages.push(
            ctx.addMessage('assistant', `Attempt ${attempt} failed (${ctx.getCurrentModelName()}): ${message}`, 'build')
          );
        },
        execute: async () => {
          const rawCode = await generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
          const cleanCode = extractMermaidCode(rawCode);
          return cleanCode.trim() ? cleanCode : null;
        },
      });

      if (!attemptResult.value?.trim()) {
        const reason = attemptResult.lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        stepMessages.push(ctx.addMessage('assistant', 'Build failed: no Mermaid code returned.', 'build'));
        ctx.trackAnalyticsEvent('diagram_build_failed', {
          ...analyticsContext,
          mode: 'build',
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
          const fixedRaw = await fixDiagram(
            code,
            errorMessage,
            ctx.aiConfig,
            docs,
            language
          );
          return extractMermaidCode(fixedRaw);
        },
        onIteration: ctx.applyCompiledResult,
      });

      const autoFixNote =
        autoFixAttempts === 0
          ? ''
          : validation.isValid
            ? ` Auto-fixed (${autoFixAttempts}).`
            : ` Auto-fix attempted (${autoFixAttempts}), still invalid.`;

      const afterSummary = await tryAnalyzeAfterBuild(ctx, { code: currentCode, docs, language });

      stepMessages.push(
        ctx.addMessage(
          'assistant',
          `Build (after): Built ${ctx.appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}${autoFixNote}${afterSummary ? `\nSummary: ${afterSummary}` : ''}`,
          'build'
        )
      );
      ctx.trackAnalyticsEvent('diagram_build_success', {
        ...analyticsContext,
        mode: 'build',
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
          autoFixAttempts: autoFixAttempts,
          buildAttempts: attemptResult.attempts,
          emptyResponses: attemptResult.emptyResponses,
          intent: intent.content,
          intentSource: intent.source,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Build failed (${ctx.getCurrentModelName()}): ${message}`, 'build'));
      ctx.trackAnalyticsEvent('diagram_build_failed', {
        ...(await ctx.getAnalyticsContext('build')),
        mode: 'build',
        error: 'exception',
      });
      await ctx.safeRecordTimeStep({ type: 'build', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
