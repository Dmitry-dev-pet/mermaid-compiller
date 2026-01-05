import { chat, chatNotebook } from '../../services/llmService';
import { LLM_TIMEOUT_RETRIES } from '../../constants';
import { TimeoutError } from '../../services/llmTimeout';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { formatTimeoutFinalMessage, formatTimeoutRetryMessage } from './stepMessageUtils';
import { stripMermaidCode } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { Message } from '../../types';
import { ANALYTICS_EVENTS, type ChatAnalyticsPayload } from '../../services/analyticsEvents';
import type { StudioContext } from './actionsContext';

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const stepMessages: Message[] = [];
    const pushStatus = (content: string) => {
      stepMessages.push(ctx.addMessage('assistant', content, 'chat'));
    };
    stepMessages.push(ctx.addMessage('user', text, 'chat'));
    if (ctx.connectionState.status !== 'connected') {
      pushStatus('Офлайн. Подключите AI для генерации.');
      const payload: ChatAnalyticsPayload = { error: 'offline' };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatFailed, 'chat', payload);
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages });
      return;
    }

    const language = ctx.resolveLanguage(text);

    const startedAt = Date.now();
    ctx.setIsProcessing(true);
    try {
      pushStatus(
        [
          'Чат',
          `- старт`,
          `- язык: ${language}`,
          `- ${ctx.getCurrentModelName()}`,
          ctx.isNotebookChatEnabled ? '- режим: notebook' : '',
        ].filter(Boolean).join('\n')
      );
      const startedPayload: ChatAnalyticsPayload = {
        hasPrompt: text.trim().length > 0,
      };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatStarted, 'chat', startedPayload);
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessagesBase = ctx.buildLLMMessages(relevantMessages);
      const notebookCount = ctx.isNotebookChatEnabled ? ctx.appState.notebookBuildCount : null;
      const notebookCountMessage = notebookCount
        ? {
            id: 'notebook-count',
            role: 'user' as const,
            content: language === 'Russian'
              ? `Количество диаграмм: ${notebookCount}.`
              : `Diagram count: ${notebookCount}.`,
            timestamp: Date.now(),
          }
        : null;
      const llmMessages = notebookCountMessage ? [...llmMessagesBase, notebookCountMessage] : llmMessagesBase;

      const docs = await ctx.getDocsContext('chat');
      const responseText = await runLLMRequest({
        task: 'chat',
        run: () => (
          ctx.isNotebookChatEnabled
            ? chatNotebook(llmMessages, ctx.aiConfig, docs, language, ctx.modelParams)
            : chat(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams)
        ),
        retries: LLM_TIMEOUT_RETRIES,
        onTimeout: (notice) => {
          pushStatus(formatTimeoutRetryMessage('Chat', notice.attempt, notice.maxAttempts));
        },
      });
      const intentText = normalizeIntentText(stripMermaidCode(responseText));
      pushStatus(
        [
          'Чат',
          `- ответ получен`,
          `- длина intent: ${intentText.length}`,
        ].join('\n')
      );
      stepMessages.push(ctx.addMessage('assistant', intentText, 'chat'));
      if (intentText) {
        ctx.setCurrentIntent({
          content: intentText,
          source: 'chat',
          updatedAt: Date.now(),
        });
      }
      const successPayload: ChatAnalyticsPayload = {
        durationMs: Date.now() - startedAt,
        intentLength: intentText.length,
      };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatSuccess, 'chat', successPayload);
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages, meta: { intent: intentText || null } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof TimeoutError) {
        pushStatus(formatTimeoutFinalMessage('Chat', LLM_TIMEOUT_RETRIES));
      }
      const failedPayload: ChatAnalyticsPayload = {
        error: 'exception',
        durationMs: Date.now() - startedAt,
      };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatFailed, 'chat', failedPayload);
      pushStatus(`Чат: ошибка (${ctx.getCurrentModelName()}): ${message}`);
      await ctx.safeRecordTimeStep({ type: 'chat', messages: stepMessages, meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
