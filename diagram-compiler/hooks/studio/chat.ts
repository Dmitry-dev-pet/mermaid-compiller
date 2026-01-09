import { chat, chatDiagram, chatNotebook } from '../../services/llmService';
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
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    const opContextId =
      typeof notebookBlockIndex === 'number' ? `block:${notebookBlockIndex}` : undefined;
    const opId = ctx.startOperation('Чат', opContextId);
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, {
        ...args,
        blockIndex: typeof notebookBlockIndex === 'number' ? notebookBlockIndex : args.blockIndex,
      });
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
    pushStatus('Чат\n- нажата');
    logEvent({
      phase: 'chat',
      level: 'info',
      title: 'Чат',
      detail: 'нажата',
    });
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
      const useNotebookIntent = ctx.isNotebookChatEnabled && !ctx.isNotebookChatMode;
      const notebookCount = useNotebookIntent ? ctx.appState.notebookBuildCount : null;
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
          useNotebookIntent
            ? chatNotebook(llmMessages, ctx.aiConfig, docs, language, ctx.modelParams)
            : ctx.isNotebookChatMode
              ? chatDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams)
              : chat(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams)
        ),
        retries: LLM_TIMEOUT_RETRIES,
        timeoutMs: ctx.appState.llmTimeoutMs,
        onStart: (notice) => {
          ctx.onLLMRequestStart?.(notice);
          logEvent({
            phase: 'chat',
            level: 'info',
            title: 'LLM',
            detail: `start ${notice.task}`,
          });
        },
        onTimeout: (notice) => {
          pushStatus(formatTimeoutRetryMessage('Chat', notice.attempt, notice.maxAttempts));
        },
      });
      const rawReply = stripMermaidCode(responseText).trim();
      let intentText = normalizeIntentText(rawReply);
      if (useNotebookIntent) {
        if (ctx.appState.diagramType === 'auto') {
          intentText = enforceAllowedDiagramTypesInIntent(intentText, MAIN_DIAGRAM_TYPES);
        } else {
          intentText = enforceAllowedDiagramTypesInIntent(intentText, [ctx.appState.diagramType], ctx.appState.diagramType);
        }
      }
      let replyText = useNotebookIntent ? intentText : rawReply;
      const buildHint = language === 'Russian'
        ? 'Если не хотите продолжать чат, нажмите Build.'
        : 'If you do not want to continue the chat, click Build.';
      if (replyText && !replyText.includes(buildHint)) {
        replyText = `${replyText}\n\n${buildHint}`;
      }
      let replyMessage: Message | null = null;
      if (replyText || useNotebookIntent) {
        replyMessage = ctx.addMessage('assistant', replyText || 'Ответ пустой. Уточните запрос.', 'chat');
        stepMessages.push(replyMessage);
        logEvent({
          phase: 'chat',
          level: 'info',
          title: 'Чат',
          detail: `${useNotebookIntent ? 'intent' : 'reply'} ${replyText.length}`,
          metrics: { durationMs: Date.now() - startedAt },
        });
        pushStatus(
          [
            'Чат',
            `- ответ получен`,
            `- длина ${useNotebookIntent ? 'intent' : 'ответа'}: ${replyText.length}`,
          ].join('\n')
        );
      } else {
        const fallbackReply = 'Ответ пустой. Уточните запрос.';
        replyMessage = ctx.addMessage('assistant', fallbackReply, 'chat');
        stepMessages.push(replyMessage);
        logEvent({
          phase: 'chat',
          level: 'warn',
          title: 'Чат',
          detail: 'empty',
          metrics: { durationMs: Date.now() - startedAt },
        });
        pushStatus('Чат\n- пустой ответ');
      }
      if (useNotebookIntent && intentText) {
        ctx.setCurrentIntent({
          content: intentText,
          source: 'chat',
          updatedAt: Date.now(),
        });
      } else if (ctx.isNotebookChatMode && rawReply) {
        ctx.setCurrentIntent({
          content: rawReply,
          source: 'chat',
          updatedAt: Date.now(),
        });
      }
      const successPayload: ChatAnalyticsPayload = {
        durationMs: Date.now() - startedAt,
        intentLength: useNotebookIntent ? intentText.length : 0,
      };
      await ctx.trackAnalyticsWithContext(ANALYTICS_EVENTS.chatSuccess, 'chat', successPayload);
      const resolvedIntent = useNotebookIntent
        ? intentText || null
        : ctx.isNotebookChatMode
          ? rawReply || null
          : null;
      await finalizeStep('done', { intent: resolvedIntent });
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
