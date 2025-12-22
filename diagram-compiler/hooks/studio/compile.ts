import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import type { Message } from '../../types';

export const createRecompileHandler = (ctx: StudioContext) => {
  return async () => {
    if (ctx.connectionState.status !== 'connected') {
      alert('Connect AI first!');
      ctx.trackAnalyticsEvent('diagram_recompile_failed', {
        ...(await ctx.getAnalyticsContext('build')),
        mode: 'recompile',
        error: 'offline',
      });
      await ctx.safeRecordTimeStep({ type: 'recompile', messages: [], meta: { error: 'offline' } });
      return;
    }

    const startedAt = Date.now();
    ctx.setIsProcessing(true);
    try {
      const analyticsContext = await ctx.getAnalyticsContext('build');
      const docs = await ctx.getDocsContext('build');
      const language = ctx.resolveLanguage();
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);

      ctx.trackAnalyticsEvent('diagram_recompile_started', {
        ...analyticsContext,
        mode: 'recompile',
      });

      const rawCode = await generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
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
        nextMermaid: ctx.resolveMermaidUpdate(cleanCode, validation),
        meta: { diagramType: ctx.appState.diagramType },
      });
      ctx.trackAnalyticsEvent('diagram_recompile_success', {
        ...analyticsContext,
        mode: 'recompile',
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        durationMs: Date.now() - startedAt,
        codeLength: cleanCode.length,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Generation failed (${ctx.getCurrentModelName()}): ${message}`);
      const stepMessages: Message[] = [];
      stepMessages.push(ctx.addMessage('assistant', `Error generating diagram (${ctx.getCurrentModelName()}): ${message}`));
      ctx.trackAnalyticsEvent('diagram_recompile_failed', {
        ...(await ctx.getAnalyticsContext('build')),
        mode: 'recompile',
        error: 'exception',
      });
      await ctx.safeRecordTimeStep({ type: 'recompile', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createFixSyntaxHandler = (ctx: StudioContext) => {
  return async () => {
    if (ctx.connectionState.status !== 'connected') {
      ctx.trackAnalyticsEvent('diagram_fix_failed', {
        ...(await ctx.getAnalyticsContext('fix')),
        mode: 'fix',
        error: 'offline',
      });
      await ctx.safeRecordTimeStep({ type: 'fix', messages: [], meta: { error: 'offline' } });
      return;
    }

    const startedAt = Date.now();
    ctx.setIsProcessing(true);
    try {
      const analyticsContext = await ctx.getAnalyticsContext('fix');
      const docs = await ctx.getDocsContext('fix');
      const language = ctx.resolveLanguage();
      ctx.trackAnalyticsEvent('diagram_fix_started', {
        ...analyticsContext,
        mode: 'fix',
        codeLength: ctx.mermaidState.code.length,
      });

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
      ctx.trackAnalyticsEvent('diagram_fix_success', {
        ...analyticsContext,
        mode: 'fix',
        attempts,
        changed,
        cleared,
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        durationMs: Date.now() - startedAt,
        codeLength: currentCode.length,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert(`Fix failed (${ctx.getCurrentModelName()}): ${message}`);
      ctx.trackAnalyticsEvent('diagram_fix_failed', {
        ...(await ctx.getAnalyticsContext('fix')),
        mode: 'fix',
        error: 'exception',
      });
      await ctx.safeRecordTimeStep({ type: 'fix', messages: [], meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createAnalyzeHandler = (ctx: StudioContext) => {
  return async () => {
    const diagramCode = ctx.getDiagramContextCode ? ctx.getDiagramContextCode().trim() : ctx.mermaidState.code.trim();
    if (ctx.connectionState.status !== 'connected' || !diagramCode) {
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
      const docs = await ctx.getDocsContext('analyze');
      const language = ctx.resolveAnalyzeLanguage();
      const explanation = await analyzeDiagram(diagramCode, ctx.aiConfig, docs, language);
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
