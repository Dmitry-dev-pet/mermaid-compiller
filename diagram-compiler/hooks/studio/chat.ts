import { chat, chatNotebook } from '../../services/llmService';
import { LLM_TIMEOUT_RETRIES } from '../../constants';
import { TimeoutError } from '../../services/llmTimeout';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { formatTimeoutFinalMessage, formatTimeoutRetryMessage } from './stepMessageUtils';
import { stripMermaidCode } from '../../utils';
import { enforceAllowedDiagramTypesInIntent, normalizeIntentText } from '../../utils/intent';
import { MAIN_DIAGRAM_TYPES } from '../../utils/diagramTypes';
import type { Message } from '../../types';
import { ANALYTICS_EVENTS, type ChatAnalyticsPayload } from '../../services/analyticsEvents';
import type { StudioContext } from './actionsContext';

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const stepMessages: Message[] = [];
    const opId = ctx.startOperation('Чат');
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, args);
    };
    const finalizeStep = async (status: 'done' | 'error', meta?: Record<string, unknown>) => {
      ctx.finishOperation(opId, status);
      await ctx.safeRecordTimeStep({
        type: 'chat',
        messages: stepMessages,
        meta: {
          ...(meta ?? {}),
          operationLog: ctx.getOperationLog(opId),
        },
      });
    };
    const pushStatus = (content: string) => {
      stepMessages.push(ctx.addMessage('assistant', content, 'chat'));
    };
    stepMessages.push(ctx.addMessage('user', text, 'chat'));
    if (ctx.connectionState.status !== 'connected') {
      pushStatus('Офлайн. Подключите AI для генерации.');
      logEvent({
        phase: 'chat',
        level: 'error',
        title: 'Чат',
        detail: 'offline',
        error: { code: 'offline', message: 'AI offline' },
      });
      const payload: ChatAnalyticsPayload = { error: 'offline' };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatFailed, 'chat', payload);
      await finalizeStep('error', { error: 'offline' });
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
      logEvent({
        phase: 'chat',
        level: 'info',
        title: 'Чат',
        detail: `язык: ${language}`,
      });
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
      let intentText = normalizeIntentText(stripMermaidCode(responseText));
      if (ctx.isNotebookChatEnabled) {
        if (ctx.appState.diagramType === 'auto') {
          intentText = enforceAllowedDiagramTypesInIntent(intentText, MAIN_DIAGRAM_TYPES);
        } else {
          intentText = enforceAllowedDiagramTypesInIntent(intentText, [ctx.appState.diagramType], ctx.appState.diagramType);
        }
      }
      pushStatus(
        [
          'Чат',
          `- ответ получен`,
          `- длина intent: ${intentText.length}`,
        ].join('\n')
      );
      logEvent({
        phase: 'chat',
        level: 'info',
        title: 'Чат',
        detail: `intent ${intentText.length}`,
      });
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
      await finalizeStep('done', { intent: intentText || null });
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
      logEvent({
        phase: 'chat',
        level: 'error',
        title: 'Чат',
        detail: message,
        error: { code: 'exception', message },
      });
      await finalizeStep('error', { error: message });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
