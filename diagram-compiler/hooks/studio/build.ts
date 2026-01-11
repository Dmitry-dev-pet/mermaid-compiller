import { summarizeBuild } from '../../services/llmService';
import { stripMermaidCode } from '../../utils';
import { normalizeDiagramType } from '../../utils/diagramTypes';
import { normalizeIntentText, resolveIntentFromInput } from '../../utils/intent';
import type { Message } from '../../types';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, BUILD_MAX_ATTEMPTS } from '../../constants';
import { runBuildPipeline } from './buildPipeline';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { normalizeSummaryText, sanitizeSummaryText } from '../../utils/buildSummary';
import { fetchDocsEntries } from '../../services/docsContextService';
import { buildSystemPrompt } from '../../services/llm/prompts';
import { runStudioOperation } from './runStudioOperation';

export const createBuildHandler = (ctx: StudioContext) => {
  return async (text?: string) => {
    const prompt = text?.trim() ?? '';
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    return runStudioOperation(ctx, {
      title: 'Сборка',
      stepType: 'build',
      notebookBlockIndex,
      run: async ({ stepMessages, logEvent, finalizeStep }) => {
        const summarizeDocsEntries = (entries: Array<{ path: string; text?: string }>) => {
          const items = entries.map((entry) => ({
            name: entry.path.split('/').pop() || entry.path,
            size: entry.text?.length ?? 0,
          }));
          const total = items.reduce((sum, item) => sum + item.size, 0);
          return { items, total };
        };
    const formatSize = (value: number) => {
      if (value < 1000) return `${value}`;
      return `${(value / 1000).toFixed(1)}k`;
    };
    const formatDocsDetail = (items: Array<{ name: string; size: number }>, total: number) => {
      if (!items.length) return 'docs (0 files)';
      const label = items.length === 1 ? 'file' : 'files';
      const list = items.map((item) => `${item.name} (${formatSize(item.size)})`).join(', ');
      return `docs (${items.length} ${label}, ${formatSize(total)}): ${list}`;
    };
        const summarizeMessages = (items: Message[]) => {
          const chars = items.reduce((total, msg) => total + (msg.content?.length ?? 0), 0);
          return { count: items.length, chars };
        };
    const formatMessageBlock = (message: Message, index: number) => {
      const label = `[${index + 1}] ${message.role}${message.id ? ` (${message.id})` : ''}`;
      return `${label}\n${message.content}`;
    };
    const parseIntentDiagrams = (intentText: string) => {
      const lines = intentText.split(/\r?\n/);
      const startIndex = lines.findIndex((line) => /^##\s+Diagrams\b/i.test(line.trim()));
      if (startIndex === -1) return [];
      const endIndex = lines.findIndex((line, idx) => idx > startIndex && /^##\s+/.test(line.trim()));
      const stopIndex = endIndex === -1 ? lines.length : endIndex;
      const items: Array<{ title: string; type: string; raw: string }> = [];
      for (let i = startIndex + 1; i < stopIndex; i += 1) {
        const line = lines[i].trim();
        if (!/^\d+\.\s+/.test(line)) continue;
        const parts = line.replace(/^\d+\.\s+/, '').split(/\s+[—-]\s+/);
        if (parts.length < 2) continue;
        const title = parts[0]?.trim() ?? '';
        const type = normalizeDiagramType(parts[1]?.trim() ?? '') ?? parts[1]?.trim() ?? '';
        if (!type) continue;
        items.push({ title, type, raw: line.replace(/^\d+\.\s+/, '').trim() });
      }
      return items;
    };
    const parseIntentTitle = (intentText: string) => {
      const lines = intentText.split(/\r?\n/).map((line) => line.trim());
      const titledIndex = lines.findIndex((line) => /^##\s+(Название|Title|Name)\b/i.test(line));
      if (titledIndex !== -1) {
        for (let i = titledIndex + 1; i < lines.length; i += 1) {
          const line = lines[i];
          if (!line) continue;
          if (/^##\s+/.test(line)) break;
          return line.replace(/^[-*]\s+/, '');
        }
      }
      for (const line of lines) {
        if (!line) continue;
        if (/^##\s+/.test(line)) continue;
        const cleaned = line.replace(/^Intent:\s*/i, '').replace(/^[-*]\s+/, '');
        if (cleaned) return cleaned;
      }
      return '';
    };
    const sanitizeSelectionText = (value: string) => {
      return value
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const parseIntentOptionsAndQuestions = (intentText: string) => {
      const lines = intentText.split(/\r?\n/);
      const options: string[] = [];
      const questions: string[] = [];
      let inQuestions = false;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^(##\s+)?(Open questions|Questions|Вопросы)/i.test(line)) {
          inQuestions = true;
          continue;
        }
        const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
        const bulleted = line.match(/^\s*[-*]\s+(.*)$/);
        if (numbered) {
          const value = sanitizeSelectionText(numbered[1] ?? '');
          if (value) (inQuestions ? questions : options).push(value);
          continue;
        }
        if (bulleted && inQuestions) {
          const value = sanitizeSelectionText(bulleted[1] ?? '');
          if (value) questions.push(value);
        }
      }
      return { options, questions };
    };
    const formatSelectionNote = (intentText: string, diagramType: string, source: string) => {
      const items = parseIntentDiagrams(intentText);
      const normalizedType = normalizeDiagramType(diagramType) ?? diagramType;
      const sourceLabel = source === 'chat' ? 'чат' : source === 'build' ? 'build' : 'fallback';
      const matches = items.filter((item) => item.type === normalizedType);
      if (matches.length) {
        const picked = matches.map((item) => item.raw).join('; ');
        return `Выбрано: ${picked} (источник: ${sourceLabel}).`;
      }
      const { options, questions } = parseIntentOptionsAndQuestions(intentText);
      if (options.length || questions.length) {
        const parts: string[] = [];
        if (options.length) {
          parts.push(`Выбрано из предложений (${options.length}): ${options.join('; ')}`);
        }
        if (questions.length) {
          parts.push(`Вопросы из чата (${questions.length}): ${questions.join('; ')}`);
        }
        return `${parts.join('. ')} (источник: ${sourceLabel}).`;
      }
      const title = parseIntentTitle(intentText);
      if (title) {
        return `Выбрано: ${title} — ${normalizedType} (источник: ${sourceLabel}).`;
      }
      return `Выбрано: ${normalizedType} (источник: ${sourceLabel}).`;
    };
    const buildContextTooltip = (args: {
      systemPrompt: string;
      messages: Message[];
      docsDetail: string;
    }) => {
      const messageBlocks = args.messages.map(formatMessageBlock).join('\n\n');
      return [
        'System prompt:',
        args.systemPrompt,
        '',
        'Messages:',
        messageBlocks,
      ].join('\n');
    };
    const buildDocsTooltip = (docsDetail: string) => `Docs:\n${docsDetail}`;
        if (prompt) stepMessages.push(ctx.addMessage('user', prompt, 'build'));

        if (ctx.connectionState.status !== 'connected') {
          stepMessages.push(ctx.addMessage('assistant', 'Офлайн. Подключите AI для генерации диаграмм.', 'build'));
          logEvent({
            phase: 'build',
            level: 'error',
            title: 'Сборка',
            detail: 'offline',
            error: { code: 'offline', message: 'AI offline' },
          });
          await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
            error: 'offline',
          });
          await finalizeStep('error', { meta: { error: 'offline' } });
          return;
        }

    const language = ctx.resolveLanguage(prompt);
    const timeoutMs = ctx.appState.llmTimeoutMs;

    ctx.setIsProcessing(true);
    try {
      logEvent({
        phase: 'build',
        level: 'info',
        title: 'Сборка',
        detail: `тип: ${ctx.appState.diagramType}, язык: ${language}`,
      });
      const docs = await ctx.getDocsContext('build');
      const relevantMessages = ctx.getRelevantMessages();

      const intent = resolveIntentFromInput({
        prompt,
        diagramIntent: ctx.getCurrentIntent(),
        messages: relevantMessages,
        allowFallback: true,
        preferAssistant: ctx.isNotebookChatMode,
        assistantMode: 'chat',
      });
      if (!intent) {
        stepMessages.push(
          ctx.addMessage(
            'assistant',
            'Нет intent для сборки. Используйте чат, чтобы описать задачу.',
            'build'
          )
        );
        logEvent({
          phase: 'planning',
          level: 'error',
          title: 'Intent',
          detail: 'missing',
          error: { code: 'no_intent', message: 'Intent missing' },
        });
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: 'no_intent',
        });
        await finalizeStep('error', { meta: { error: 'no_intent' } });
        return;
      }

      const startedAt = Date.now();
      await ctx.trackAnalyticsWithContext('diagram_build_started', 'build', {
        intentSource: intent.source,
        hasPrompt: !!prompt,
      });

      const normalizedIntent = normalizeIntentText(intent.content);
      const intentMessage = ctx.getIntentMessage(normalizedIntent);
      const diagramContext = ctx.getDiagramContextMessage();
      const llmMessages = diagramContext ? [intentMessage, diagramContext] : [intentMessage];

      const selectionSummary = await ctx.getDocsSelectionSummary?.('build');
      const selectionFiles = selectionSummary?.includedPaths ?? [];
      const entries = selectionFiles.map((path) => ({ path, text: '' }));
      const docsEntries = entries.length
        ? await fetchDocsEntries(ctx.appState.diagramType)
        : [];
      const includedEntries = docsEntries.filter((entry) => selectionFiles.includes(entry.path));
      const docsSummary = summarizeDocsEntries(includedEntries);
      const msgSummary = summarizeMessages(llmMessages);
      const systemPrompt = buildSystemPrompt('generate', {
        diagramType: ctx.appState.diagramType,
        docsContext: 'Documentation context redacted.',
        language,
      });
      const docsDetail = formatDocsDetail(docsSummary.items, docsSummary.total);
      const contextTooltip = buildContextTooltip({
        systemPrompt,
        messages: llmMessages,
        docsDetail,
      });
      const docsTooltip = buildDocsTooltip(docsDetail);
      logEvent({
        phase: 'planning',
        level: 'info',
        title: 'Контекст',
        detail: [
          `messages: ${msgSummary.count} (${msgSummary.chars} chars)`,
          docsDetail,
        ].join('\n'),
        tooltipMessages: contextTooltip,
        tooltipDocs: docsTooltip,
        kind: 'context',
        contextScope: 'build',
      });

      ctx.setCurrentIntent({
        content: normalizedIntent,
        source: intent.source,
        updatedAt: Date.now(),
      });

      // keep intent details in log only (no chat message)
      logEvent({
        phase: 'planning',
        level: 'info',
        title: 'Intent',
        detail: `источник: ${intent.source}, длина: ${normalizedIntent.length}`,
      });

      const attemptNotes: string[] = [];
      const buildResult = await runBuildPipeline({
        aiConfig: ctx.aiConfig,
        modelParams: ctx.modelParams,
        diagramType: ctx.appState.diagramType,
        llmMessages,
        docs,
        language,
        maxAttempts: BUILD_MAX_ATTEMPTS,
        autoFixMaxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        timeoutMs,
        onLLMRequestStart: (notice) => {
          ctx.onLLMRequestStart?.(notice);
          logEvent({
            phase: 'build',
            level: 'info',
            title: 'LLM',
            detail: `start ${notice.task}`,
          });
        },
        callbacks: {
          onAttempt: (attempt, max) => {
            attemptNotes.push(`попытка ${attempt}/${max}`);
            logEvent({
              phase: 'build',
              level: 'info',
              title: 'Генерация',
              attempt: { current: attempt, max },
            });
          },
          onEmpty: (attempt, max) => {
            attemptNotes.push(`попытка ${attempt}: пустой ответ`);
            logEvent({
              phase: 'build',
              level: 'warn',
              title: 'Генерация',
              detail: 'empty',
              attempt: { current: attempt, max },
            });
          },
          onError: (attempt, max, message) => {
            attemptNotes.push(`попытка ${attempt}: ошибка ${message}`);
            logEvent({
              phase: 'build',
              level: 'error',
              title: 'Генерация',
              detail: message,
              attempt: { current: attempt, max },
              error: { code: 'build_error', message },
            });
          },
          onJsonStatus: (attempt, status, reason) => {
            attemptNotes.push(`json status: ${status}${reason ? ` (${reason})` : ''}`);
          },
          onTypeMismatch: (attempt, expected, received) => {
            attemptNotes.push(`type mismatch: ${expected} vs ${received}`);
          },
          onAutoFixAttempt: (attempt, max, errorLine) => {
            logEvent({
              phase: 'fix',
              level: 'info',
              title: 'Auto-fix',
              detail: `attempt ${attempt}/${max}`,
              attempt: { current: attempt, max },
            });
            if (errorLine) {
              logEvent({
                phase: 'fix',
                level: 'warn',
                title: 'Auto-fix error',
                detail: errorLine,
                attempt: { current: attempt, max },
                error: { code: 'validation', message: errorLine },
              });
            }
          },
          onAutoFixIteration: (code, nextValidation) => {
            ctx.applyCompiledResult(code, nextValidation);
          },
          onValidation: (isValid, autoFixAttempts) => {
            logEvent({
              phase: 'validate',
              level: isValid ? 'info' : 'warn',
              title: 'Валидация',
              detail: isValid ? 'валидна' : 'невалидна',
              metrics: {
                ...(autoFixAttempts ? { autoFix: autoFixAttempts } : {}),
                durationMs: Date.now() - startedAt,
              },
            });
          },
          onValidationError: (errorLine) => {
            logEvent({
              phase: 'validate',
              level: 'error',
              title: 'Ошибка',
              detail: errorLine || 'validation error',
              error: { code: 'validation', message: errorLine || 'validation error' },
            });
          },
        },
      });

      if (attemptNotes.length > 0) {
        logEvent({
          phase: 'build',
          level: 'info',
          title: 'Попытки',
          detail: attemptNotes.join('; '),
        });
      }

      if (buildResult.status !== 'ok' || !buildResult.code) {
        const reason = buildResult.lastError ? 'build_attempts_failed' : 'no_mermaid_code';
        logEvent({
          phase: 'build',
          level: 'error',
          title: 'Сборка',
          detail: reason,
          error: { code: reason, message: buildResult.lastError ?? reason },
        });
        await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
          error: reason,
          attempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          durationMs: Date.now() - startedAt,
        });
        stepMessages.push(ctx.addMessage('assistant', 'Итог: сборка завершилась с ошибкой. Проверьте лог.', 'build'));
        await finalizeStep('error', { meta: {
          reason,
          attempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          error: buildResult.lastError ?? undefined,
        } });
        return;
      }

      if (buildResult.usedFallback) {
        logEvent({
          phase: 'build',
          level: 'warn',
          title: 'Сборка',
          detail: 'fallback_template',
        });
      }

      const currentCode = buildResult.code;
      const validation = buildResult.validation;
      const autoFixAttempts = buildResult.autoFixAttempts;

      logEvent({
        phase: 'validate',
        level: validation.isValid ? 'info' : 'warn',
        title: 'Валидация',
        detail: validation.isValid ? 'валидна' : 'невалидна',
        metrics: autoFixAttempts ? { autoFix: autoFixAttempts } : undefined,
      });

      await ctx.trackAnalyticsWithContext('diagram_build_success', 'build', {
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        buildAttempts: buildResult.attempts,
        autoFixAttempts,
        emptyResponses: buildResult.emptyResponses,
        durationMs: Date.now() - startedAt,
        codeLength: currentCode.length,
      });
      const fallbackSummary = [
        `Итог: диаграмма ${validation.isValid ? 'готова' : 'с ошибками'}.`,
        buildResult.usedFallback ? 'Использован шаблон.' : '',
        autoFixAttempts ? `Auto-fix: ${autoFixAttempts}.` : '',
      ].filter(Boolean).join(' ');
      let resolvedSummary = normalizeSummaryText(fallbackSummary);
      const selectionNote = formatSelectionNote(normalizedIntent, ctx.appState.diagramType, intent.source);
      let summaryStartAt: number | null = null;
      try {
        logEvent({
          phase: 'build',
          level: 'info',
          title: 'Итог',
          detail: 'generating',
        });
        summaryStartAt = Date.now();
        const summaryInput = [
          `Тип: ${ctx.appState.diagramType}`,
          `Валидность: ${validation.isValid ? 'ok' : 'error'}`,
          `Попытки сборки: ${buildResult.attempts}/${BUILD_MAX_ATTEMPTS}`,
          `Auto-fix: ${autoFixAttempts}`,
          `Fallback: ${buildResult.usedFallback ? 'yes' : 'no'}`,
          `Intent length: ${normalizedIntent.length}`,
        ].join('\n');
        const summaryText = await runLLMRequest({
          task: 'build-summary',
          run: () => summarizeBuild(
            [{ id: 'build-summary', role: 'user', content: summaryInput, timestamp: Date.now() }],
            ctx.aiConfig,
            '',
            language,
            ctx.modelParams
          ),
          retries: 1,
          timeoutMs,
          onStart: (notice) => {
            ctx.onLLMRequestStart?.(notice);
            logEvent({
              phase: 'build',
              level: 'info',
              title: 'LLM',
              detail: `start ${notice.task}`,
            });
          },
        });
        const cleanedSummary = normalizeSummaryText(
          sanitizeSummaryText(stripMermaidCode(summaryText))
        );
        if (cleanedSummary) {
          const summaryPrefix = language === 'Russian' ? 'Итог:' : 'Summary:';
          resolvedSummary = cleanedSummary.toLowerCase().startsWith(summaryPrefix.toLowerCase())
            ? cleanedSummary
            : `${summaryPrefix} ${cleanedSummary}`;
        }
        logEvent({
          phase: 'done',
          level: 'info',
          title: 'Итог',
          detail: 'ready',
          metrics: summaryStartAt ? { durationMs: Date.now() - summaryStartAt } : undefined,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logEvent({
          phase: 'error',
          level: 'warn',
          title: 'Итог',
          detail: `fallback: ${message}`,
        });
      }
      if (selectionNote && !resolvedSummary.includes(selectionNote)) {
        resolvedSummary = `${resolvedSummary} ${selectionNote}`.trim();
      }
      stepMessages.push(ctx.addMessage('assistant', resolvedSummary, 'build'));
      await finalizeStep('done', {
        nextMermaid: ctx.resolveMermaidUpdate(currentCode, validation),
        meta: {
          diagramType: ctx.appState.diagramType,
          isValid: !!validation.isValid,
          autoFixAttempts: autoFixAttempts,
          buildAttempts: buildResult.attempts,
          emptyResponses: buildResult.emptyResponses,
          fallbackUsed: buildResult.usedFallback,
          intent: intent.content,
          intentSource: intent.source,
        },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      stepMessages.push(ctx.addMessage('assistant', `Сборка: ошибка (${ctx.getCurrentModelName()}): ${message}`, 'build'));
      logEvent({
        phase: 'build',
        level: 'error',
        title: 'Сборка',
        detail: message,
        error: { code: 'exception', message },
      });
      await ctx.trackAnalyticsWithContext('diagram_build_failed', 'build', {
        error: 'exception',
      });
      stepMessages.push(ctx.addMessage('assistant', 'Итог: сборка завершилась с ошибкой. Проверьте лог.', 'build'));
      await finalizeStep('error', { meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
      },
    });
  };
};
