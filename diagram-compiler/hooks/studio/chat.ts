import { fetchDocsContext } from '../../services/docsContextService';
import { chat, chatNotebook } from '../../services/llmService';
import { LLM_TIMEOUT_RETRIES } from '../../constants';
import { retryOnTimeout, TimeoutError } from '../../services/llmTimeout';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const stepMessages: Message[] = [];
    stepMessages.push(ctx.addMessage('user', text, 'chat'));
    if (ctx.connectionState.status !== 'connected') {
      stepMessages.push(ctx.addMessage('assistant', "I'm offline. Connect AI to generate diagrams.", 'chat'));
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages });
      return;
    }

    const language = ctx.resolveLanguage(text);

    ctx.setIsProcessing(true);
    try {
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);

      const docs = await ctx.getDocsContext('chat');
      const responseText = await retryOnTimeout(() => (
        ctx.appState.isNotebookBuildEnabled
          ? chatNotebook(llmMessages, ctx.aiConfig, docs, language)
          : chat(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language)
      ), {
        attempts: LLM_TIMEOUT_RETRIES,
        onTimeout: (attempt) => {
          if (attempt >= LLM_TIMEOUT_RETRIES) return;
          stepMessages.push(
            ctx.addMessage('assistant', `Chat timeout. Retrying (${attempt + 1}/${LLM_TIMEOUT_RETRIES})...`, 'chat')
          );
        },
      });
      const intentText = normalizeIntentText(stripMermaidCode(responseText));
      stepMessages.push(ctx.addMessage('assistant', intentText, 'chat'));
      if (intentText) {
        ctx.setCurrentIntent({
          content: intentText,
          source: 'chat',
          updatedAt: Date.now(),
        });
      }
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages, meta: { intent: intentText || null } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof TimeoutError) {
        stepMessages.push(ctx.addMessage('assistant', `Chat timed out after ${LLM_TIMEOUT_RETRIES} attempts.`, 'chat'));
      }
      stepMessages.push(ctx.addMessage('assistant', `Error (${ctx.getCurrentModelName()}): ${message}`, 'chat'));
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
