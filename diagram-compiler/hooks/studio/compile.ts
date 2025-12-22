import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import { fetchDocsContext } from '../../services/docsContextService';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import type { Message } from '../../types';

export const createRecompileHandler = (ctx: StudioContext) => {
  return async () => {
    if (ctx.connectionState.status !== 'connected') {
      alert('Connect AI first!');
      await ctx.safeRecordTimeStep({ type: 'recompile', messages: [], meta: { error: 'offline' } });
      return;
    }

    ctx.setIsProcessing(true);
    try {
      const docs = await fetchDocsContext(ctx.appState.diagramType);
      const language = ctx.resolveLanguage();
      const relevantMessages = ctx.getRelevantMessages();

      const rawCode = await generateDiagram(relevantMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
      const cleanCode = extractMermaidCode(rawCode);
      const validation = await validateMermaid(cleanCode);

      ctx.applyCompiledResult(cleanCode, validation);
      const stepMessages: Message[] = [];
      stepMessages.push(
        ctx.addMessage(
          'assistant',
          `Generated ${ctx.appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}`
        )
      );
      await ctx.safeRecordTimeStep({
        type: 'recompile',
        messages: stepMessages,
        nextMermaid: {
          code: cleanCode,
          isValid: !!validation.isValid,
          errorMessage: validation.errorMessage,
          errorLine: validation.errorLine,
        },
        meta: { diagramType: ctx.appState.diagramType },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Generation failed (${ctx.getCurrentModelName()}): ${message}`);
      const stepMessages: Message[] = [];
      stepMessages.push(ctx.addMessage('assistant', `Error generating diagram (${ctx.getCurrentModelName()}): ${message}`));
      await ctx.safeRecordTimeStep({ type: 'recompile', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createFixSyntaxHandler = (ctx: StudioContext) => {
  return async () => {
    if (ctx.connectionState.status !== 'connected') {
      await ctx.safeRecordTimeStep({ type: 'fix', messages: [], meta: { error: 'offline' } });
      return;
    }

    ctx.setIsProcessing(true);
    try {
      const docs = await fetchDocsContext(ctx.appState.diagramType);
      const language = ctx.resolveLanguage();

      const startCode = ctx.mermaidState.code;
      const initialValidation = await validateMermaid(startCode);
      const { code: currentCode, validation, attempts } = await runAutoFixLoop({
        initialCode: startCode,
        initialValidation,
        maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        validate: validateMermaid,
        fix: async (code, errorMessage) => {
          const fixedRaw = await fixDiagram(
            code,
            errorMessage || ctx.mermaidState.errorMessage || 'Unknown error',
            ctx.aiConfig,
            docs,
            language
          );
          return extractMermaidCode(fixedRaw);
        },
        onIteration: ctx.applyValidationPreservingSource,
      });

      const changed = currentCode !== startCode;
      const cleared = !currentCode.trim();
      const nextMermaid = !cleared && changed
        ? {
            code: currentCode,
            isValid: !!validation.isValid,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
          }
        : null;
      await ctx.safeRecordTimeStep({
        type: 'fix',
        messages: [],
        nextMermaid,
        setCurrentRevisionId: cleared ? null : undefined,
        meta: {
          attempts,
          changed,
          isValid: !!validation.isValid,
          cleared,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Fix failed (${ctx.getCurrentModelName()}): ${message}`);
      await ctx.safeRecordTimeStep({ type: 'fix', messages: [], meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createAnalyzeHandler = (ctx: StudioContext) => {
  return async () => {
    if (ctx.connectionState.status !== 'connected' || !ctx.mermaidState.code.trim()) {
      alert('Connect AI and provide Mermaid code first!');
      await ctx.safeRecordTimeStep({
        type: 'analyze',
        messages: [],
        meta: { error: ctx.connectionState.status !== 'connected' ? 'offline' : 'no_code' },
      });
      return;
    }

    ctx.setIsProcessing(true);
    try {
      const docs = await fetchDocsContext(ctx.appState.diagramType);
      const language = ctx.resolveAnalyzeLanguage();
      const explanation = await analyzeDiagram(ctx.mermaidState.code, ctx.aiConfig, docs, language);
      const stepMessages: Message[] = [];
      stepMessages.push(ctx.addMessage('assistant', explanation));
      await ctx.safeRecordTimeStep({ type: 'analyze', messages: stepMessages, meta: { diagramType: ctx.appState.diagramType } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Analysis failed (${ctx.getCurrentModelName()}): ${message}`);
      const stepMessages: Message[] = [];
      stepMessages.push(ctx.addMessage('assistant', `Error analyzing diagram (${ctx.getCurrentModelName()}): ${message}`));
      await ctx.safeRecordTimeStep({ type: 'analyze', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
