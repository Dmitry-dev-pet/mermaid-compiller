import { fetchDocsContext } from '../../services/docsContextService';
import { chat } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const stepMessages: Message[] = [];
    stepMessages.push(ctx.addMessage('user', text));
    if (ctx.connectionState.status !== 'connected') {
      stepMessages.push(ctx.addMessage('assistant', "I'm offline. Connect AI to generate diagrams."));
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages });
      return;
    }

    const language = ctx.resolveLanguage(text);

    ctx.setIsProcessing(true);
    try {
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);

      const docs = await ctx.getDocsContext('chat');
      const responseText = await chat(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language);
      const intentText = normalizeIntentText(stripMermaidCode(responseText));
      stepMessages.push(ctx.addMessage('assistant', intentText));
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
      stepMessages.push(ctx.addMessage('assistant', `Error (${ctx.getCurrentModelName()}): ${message}`));
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
