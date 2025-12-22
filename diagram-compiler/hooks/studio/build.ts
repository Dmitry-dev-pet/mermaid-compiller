import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS } from '../../constants';
import { runAutoFixLoop } from './autoFix';

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
    if (prompt) stepMessages.push(ctx.addMessage('user', prompt));

    if (ctx.connectionState.status !== 'connected') {
      stepMessages.push(ctx.addMessage('assistant', "I'm offline. Connect AI to generate diagrams."));
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
        stepMessages.push(ctx.addMessage('assistant', 'Nothing to build yet. Use Chat to define intent.'));
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
      stepMessages.push(ctx.addMessage('assistant', beforeSummary));

      let cleanCode = '';
      let lastError: string | null = null;
      let emptyResponses = 0;
      let attempts = 0;

      while (attempts < BUILD_MAX_ATTEMPTS) {
        attempts += 1;
        stepMessages.push(ctx.addMessage('assistant', `Build attempt ${attempts}/${BUILD_MAX_ATTEMPTS}...`));
        try {
          const rawCode = await generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
          cleanCode = extractMermaidCode(rawCode);
          if (!cleanCode.trim()) {
            emptyResponses += 1;
            stepMessages.push(ctx.addMessage('assistant', `Attempt ${attempts}: no Mermaid code returned.`));
            continue;
          }
          break;
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          lastError = message;
          stepMessages.push(ctx.addMessage('assistant', `Attempt ${attempts} failed (${ctx.getCurrentModelName()}): ${message}`));
        }
      }

      if (!cleanCode.trim()) {
        const reason = lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        stepMessages.push(ctx.addMessage('assistant', 'Build failed: no Mermaid code returned.'));
        ctx.trackAnalyticsEvent('diagram_build_failed', {
          ...analyticsContext,
          mode: 'build',
          error: reason,
          attempts,
          emptyResponses,
          durationMs: Date.now() - startedAt,
        });
        await ctx.safeRecordTimeStep({
          type: 'build',
          messages: stepMessages,
          meta: {
            reason,
            attempts,
            emptyResponses,
            error: lastError ?? undefined,
          },
        });
        return;
      }

      const initialValidation = await validateMermaid(cleanCode);
      const { code: currentCode, validation, attempts: autoFixAttempts } = await runAutoFixLoop({
        initialCode: cleanCode,
        initialValidation,
        maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        validate: validateMermaid,
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
          `Build (after): Built ${ctx.appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}${autoFixNote}${afterSummary ? `\nSummary: ${afterSummary}` : ''}`
        )
      );
      ctx.trackAnalyticsEvent('diagram_build_success', {
        ...analyticsContext,
        mode: 'build',
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        buildAttempts: attempts,
        autoFixAttempts,
        emptyResponses,
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
          buildAttempts: attempts,
          emptyResponses,
          intent: intent.content,
          intentSource: intent.source,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Build failed (${ctx.getCurrentModelName()}): ${message}`));
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
