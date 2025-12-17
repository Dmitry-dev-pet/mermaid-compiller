import { validateMermaid, extractMermaidCode } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, chat, analyzeDiagram } from '../../services/llmService';
import { fetchDocsContext } from '../../services/docsContextService';
import { stripMermaidCode } from '../../utils';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';

const trySummarizeBuildBefore = async (ctx: StudioContext, args: {
  llmMessages: Message[];
  docs: string;
  language: string;
  relevantMessages: Message[];
  currentDiagramCode: string;
  beforeSummarySource: string;
}) => {
  const { llmMessages, docs, language, relevantMessages, currentDiagramCode, beforeSummarySource } = args;

  const userMsgCount = relevantMessages.filter((m) => m.role === 'user' && m.content.trim().length > 0).length;
  const hasDiagram = currentDiagramCode.length > 0;
  const shouldSummarize = hasDiagram || userMsgCount >= 2 || beforeSummarySource.length >= 40;
  if (!shouldSummarize) return '';

  try {
    const summaryReq: Message = {
      id: 'build-summary-req',
      role: 'user',
      content:
        'Summarize what Mermaid diagram should be built next into 1-2 short sentences.\n' +
        'Always make a best-effort guess based on the latest user request; do NOT say that context is missing.\n' +
        'TEXT ONLY. No Mermaid. No code blocks. No numbered lists.',
      timestamp: Date.now(),
    };

    const summaryText = await chat(
      [...llmMessages, summaryReq],
      ctx.aiConfig,
      ctx.appState.diagramType,
      docs,
      language
    );
    const normalized = stripMermaidCode(summaryText).trim();
    const looksLikeNoContext = /no context|not enough|невозможно|нет (?:контекст|данных)/i.test(normalized);
    return looksLikeNoContext ? '' : normalized;
  } catch {
    return '';
  }
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
      const docs = await fetchDocsContext(ctx.appState.diagramType);
      const relevantMessages = ctx.getRelevantMessages();

      const hasUserContext = relevantMessages.some((m) => m.role === 'user' && m.content.trim().length > 0);
      if (!hasUserContext) {
        stepMessages.push(ctx.addMessage('assistant', 'Nothing to build yet. Send a message first.'));
        try {
          await ctx.recordTimeStep({ type: 'build', messages: stepMessages });
        } catch (e) {
          console.error('Failed to record history step', e);
        }
        return;
      }

      const currentDiagramCode = ctx.mermaidState.code.trim();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);
      const lastUserText = ctx.getLastUserText(relevantMessages);
      const beforeSummarySource = prompt || lastUserText;

      const fullChatSummary = await trySummarizeBuildBefore(ctx, {
        llmMessages,
        docs,
        language,
        relevantMessages,
        currentDiagramCode,
        beforeSummarySource,
      });

      const fallbackLines = [
        `Will ${currentDiagramCode ? 'update' : 'create'} a ${ctx.appState.diagramType} diagram using chat context${currentDiagramCode ? ' + current code' : ''}.`,
        beforeSummarySource ? `Request: ${ctx.normalizeText(beforeSummarySource)}` : '',
      ].filter(Boolean);

      stepMessages.push(ctx.addMessage('assistant', `Build (before): ${fullChatSummary || fallbackLines.join(' ')}`));

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
          },
        });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Build failed: ${message}`));
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
