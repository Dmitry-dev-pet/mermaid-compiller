import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';

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

const autoFixMermaidIfNeeded = async (ctx: StudioContext, args: {
  initialCode: string;
  initialValidation: Awaited<ReturnType<typeof validateMermaid>>;
  docs: string;
  language: string;
}) => {
  let currentCode = args.initialCode;
  let validation = args.initialValidation;
  let attempts = 0;

  ctx.applyCompiledResult(currentCode, validation);

  while (!validation.isValid && attempts < AUTO_FIX_MAX_ATTEMPTS) {
    attempts += 1;
    const fixedRaw = await fixDiagram(
      currentCode,
      validation.errorMessage || 'Unknown error',
      ctx.aiConfig,
      args.docs,
      args.language
    );
    const fixedCode = extractMermaidCode(fixedRaw);
    if (!fixedCode.trim()) break;

    currentCode = fixedCode;
    validation = await validateMermaid(currentCode);
    ctx.applyCompiledResult(currentCode, validation);

    if (validation.isValid) break;
  }

  return { code: currentCode, validation, attempts };
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
      try {
        await ctx.recordTimeStep({ type: 'build', messages: stepMessages });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
      return;
    }

    const language = ctx.resolveLanguage(prompt);

    ctx.setIsProcessing(true);
    try {
      const docs = await ctx.getBuildDocsContext();
      const relevantMessages = ctx.getRelevantMessages();

      const intent = buildIntent(ctx, { prompt, relevantMessages });
      if (!intent) {
        stepMessages.push(ctx.addMessage('assistant', 'Nothing to build yet. Use Chat to define intent.'));
        try {
          await ctx.recordTimeStep({ type: 'build', messages: stepMessages });
        } catch (e) {
          console.error('Failed to record history step', e);
        }
        return;
      }

      const intentMessage = ctx.getIntentMessage(intent.content);
      const diagramContext = ctx.getDiagramContextMessage();
      const llmMessages = diagramContext ? [intentMessage, diagramContext] : [intentMessage];

      ctx.setCurrentIntent({
        content: intent.content,
        source: intent.source,
        updatedAt: Date.now(),
      });

      const beforeSummary = `Build (before): Intent (${intent.source}). ${ctx.normalizeText(intent.content)}`;
      stepMessages.push(ctx.addMessage('assistant', beforeSummary));

      const rawCode = await generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
      const cleanCode = extractMermaidCode(rawCode);

      if (!cleanCode.trim()) {
        stepMessages.push(ctx.addMessage('assistant', 'Build failed: no Mermaid code returned.'));
        try {
          await ctx.recordTimeStep({ type: 'build', messages: stepMessages, meta: { reason: 'no_mermaid_code' } });
        } catch (e) {
          console.error('Failed to record history step', e);
        }
        return;
      }

      const initialValidation = await validateMermaid(cleanCode);
      const { code: currentCode, validation, attempts: autoFixAttempts } = await autoFixMermaidIfNeeded(ctx, {
        initialCode: cleanCode,
        initialValidation,
        docs,
        language,
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
      try {
        await ctx.recordTimeStep({
          type: 'build',
          messages: stepMessages,
          nextMermaid: {
            code: currentCode,
            isValid: !!validation.isValid,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
          },
          meta: {
            diagramType: ctx.appState.diagramType,
            autoFixAttempts: autoFixAttempts,
            intent: intent.content,
            intentSource: intent.source,
          },
        });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Build failed (${ctx.getCurrentModelName()}): ${message}`));
      try {
        await ctx.recordTimeStep({ type: 'build', messages: stepMessages, meta: { error: message } });
      } catch (err) {
        console.error('Failed to record history step', err);
      }
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
