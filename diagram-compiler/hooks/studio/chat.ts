import { fetchDocsContext } from '../../services/docsContextService';
import { chat } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const stepMessages: Message[] = [];
    stepMessages.push(ctx.addMessage('user', text));
    if (ctx.connectionState.status !== 'connected') {
      stepMessages.push(ctx.addMessage('assistant', "I'm offline. Connect AI to generate diagrams."));
      try {
        await ctx.recordTimeStep({ type: 'chat', messages: stepMessages });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
      return;
    }

    const language = ctx.resolveLanguage(text);

    ctx.setIsProcessing(true);
    try {
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);

      const responseText = await chat(llmMessages, ctx.aiConfig, ctx.appState.diagramType, '', language);
      const intentText = stripMermaidCode(responseText).trim();
      stepMessages.push(ctx.addMessage('assistant', intentText));
      if (intentText) {
        ctx.setCurrentIntent({
          content: intentText,
          source: 'chat',
          updatedAt: Date.now(),
        });
      }
      try {
        await ctx.recordTimeStep({ type: 'chat', messages: stepMessages, meta: { intent: intentText || null } });
      } catch (e) {
        console.error('Failed to record history step', e);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Error (${ctx.getCurrentModelName()}): ${message}`));
      try {
        await ctx.recordTimeStep({ type: 'chat', messages: stepMessages, meta: { error: message } });
      } catch (err) {
        console.error('Failed to record history step', err);
      }
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
