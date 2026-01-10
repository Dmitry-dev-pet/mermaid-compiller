import { validateMermaid, extractMermaidCode, parseMermaidJsonResponse } from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import type { Message } from '../../types';
import { TimeoutError } from '../../services/llmTimeout';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { formatTimeoutFinalMessage, formatTimeoutRetryMessage } from './stepMessageUtils';

export const createRecompileHandler = (ctx: StudioContext) => {
  return async () => {
    const stepMessages: Message[] = [];
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    const opContextId =
      typeof notebookBlockIndex === 'number' ? `block:${notebookBlockIndex}` : undefined;
    const opId = ctx.startOperation('Пересборка', opContextId);
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, args);
    };
    const finalizeStep = async (
      status: 'done' | 'error',
      args?: {
        meta?: Record<string, unknown>;
        nextMermaid?: Pick<import('../../types').MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
      }
    ) => {
      ctx.finishOperation(opId, status);
      await ctx.safeRecordTimeStep({
        type: 'recompile',
        messages: stepMessages,
        nextMermaid: args?.nextMermaid ?? null,
        meta: {
          ...(args?.meta ?? {}),
          operationLog: ctx.getOperationLog(opId),
        },
      });
    };
    const pushStatus = (content: string) => {
      stepMessages.push(ctx.addMessage('assistant', content, 'build'));
    };
    if (ctx.connectionState.status !== 'connected') {
      alert('Connect AI first!');
      pushStatus('Пересборка\n- офлайн: подключите AI');
      logEvent({
        phase: 'compile',
        level: 'error',
        title: 'Пересборка',
        detail: 'offline',
        error: { code: 'offline', message: 'AI offline' },
      });
      await ctx.trackAnalyticsWithContext('diagram_recompile_failed', 'build', {
        mode: 'recompile',
        error: 'offline',
      });
      await finalizeStep('error', { meta: { error: 'offline' } });
      return;
    }

    const startedAt = Date.now();
    ctx.setIsProcessing(true);
    try {
      const docs = await ctx.getDocsContext('build');
      const language = ctx.resolveLanguage();
      const relevantMessages = ctx.getRelevantMessages();
      const llmMessages = ctx.buildLLMMessages(relevantMessages);
      pushStatus(
        [
          'Пересборка',
          '- старт',
          `- тип: ${ctx.appState.diagramType}`,
          `- язык: ${language}`,
          `- модель: ${ctx.getCurrentModelName()}`,
        ].join('\n')
      );
      logEvent({
        phase: 'compile',
        level: 'info',
        title: 'Пересборка',
        detail: `тип: ${ctx.appState.diagramType}, язык: ${language}`,
      });

      await ctx.trackAnalyticsWithContext('diagram_recompile_started', 'build', {
        mode: 'recompile',
      });

      const rawCode = await runLLMRequest({
        task: 'recompile',
        run: () => generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams),
        retries: LLM_TIMEOUT_RETRIES,
        timeoutMs: ctx.appState.llmTimeoutMs,
        onStart: (notice) => {
          ctx.onLLMRequestStart?.(notice);
          logEvent({
            phase: 'compile',
            level: 'info',
            title: 'LLM',
            detail: `start ${notice.task}`,
          });
        },
        onTimeout: (notice) => {
          alert(formatTimeoutRetryMessage('Recompile', notice.attempt, notice.maxAttempts));
        },
      });
      const parsed = parseMermaidJsonResponse(rawCode);
      const cleanCode = parsed?.status === 'ok' && parsed.mermaid
        ? parsed.mermaid
        : extractMermaidCode(rawCode);
      const validation = await validateMermaid(cleanCode, { logError: false });
      pushStatus(
        [
          'Пересборка',
          `- валидация: ${validation.isValid ? 'валидна' : 'невалидна'}`,
          `- символов: ${cleanCode.length}`,
        ].join('\n')
      );
      logEvent({
        phase: 'validate',
        level: validation.isValid ? 'info' : 'warn',
        title: 'Валидация',
        detail: validation.isValid ? 'валидна' : 'невалидна',
      });

      ctx.applyCompiledResult(cleanCode, validation);
      pushStatus(
        [
          'Пересборка (итог)',
          `- диаграмма: ${ctx.appState.diagramType}`,
          `- ${validation.isValid ? 'валидна' : 'с ошибками'}`,
        ].join('\n')
      );
      await finalizeStep('done', {
        nextMermaid: ctx.resolveMermaidUpdate(cleanCode, validation),
        meta: { diagramType: ctx.appState.diagramType, isValid: !!validation.isValid },
      });
      await ctx.trackAnalyticsWithContext('diagram_recompile_success', 'build', {
        mode: 'recompile',
        isValid: !!validation.isValid,
        errorLine: validation.errorLine,
        durationMs: Date.now() - startedAt,
        codeLength: cleanCode.length,
      });
      pushStatus('Пересборка\n- история сохранена');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof TimeoutError) {
        alert(formatTimeoutFinalMessage('Recompile', LLM_TIMEOUT_RETRIES));
      }
      alert(`Generation failed (${ctx.getCurrentModelName()}): ${message}`);
      pushStatus(`Пересборка: ошибка (${ctx.getCurrentModelName()}): ${message}`);
      logEvent({
        phase: 'compile',
        level: 'error',
        title: 'Пересборка',
        detail: message,
        error: { code: 'exception', message },
      });
      await ctx.trackAnalyticsWithContext('diagram_recompile_failed', 'build', {
        mode: 'recompile',
        error: 'exception',
      });
      await finalizeStep('error', { meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createFixSyntaxHandler = (ctx: StudioContext) => {
  return async () => {
    const stepMessages: Message[] = [];
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    const opContextId =
      typeof notebookBlockIndex === 'number' ? `block:${notebookBlockIndex}` : undefined;
    const opId = ctx.startOperation('Исправление', opContextId);
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, args);
    };
    const finalizeStep = async (
      status: 'done' | 'error',
      args?: {
        meta?: Record<string, unknown>;
        nextMermaid?: Pick<import('../../types').MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
      }
    ) => {
      ctx.finishOperation(opId, status);
      await ctx.safeRecordTimeStep({
        type: 'fix',
        messages: stepMessages,
        nextMermaid: args?.nextMermaid ?? null,
        setCurrentRevisionId: args?.meta?.cleared ? null : undefined,
        meta: {
          ...(args?.meta ?? {}),
          operationLog: ctx.getOperationLog(opId),
        },
      });
    };
    if (ctx.connectionState.status !== 'connected') {
      logEvent({
        phase: 'fix',
        level: 'error',
        title: 'Исправление',
        detail: 'offline',
        error: { code: 'offline', message: 'AI offline' },
      });
      stepMessages.push(
        ctx.addMessage('assistant', 'Не могу запустить Fix: подключите AI.', 'fix')
      );
      await ctx.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        error: 'offline',
      });
      await finalizeStep('error', { meta: { error: 'offline' } });
      return;
    }

    const startedAt = Date.now();
    ctx.setIsProcessing(true);
    try {
      const docs = await ctx.getDocsContext('fix');
      const language = ctx.resolveLanguage();
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Исправление',
        detail: `язык: ${language}`,
      });
      logEvent({
        phase: 'fix',
        level: 'info',
        title: 'Контекст',
        detail: `code: ${ctx.mermaidState.code.length} chars\ndocs: ${(docs.length / 1000).toFixed(1)}k`,
        kind: 'context',
        contextScope: 'build',
      });
      await ctx.trackAnalyticsWithContext('diagram_fix_started', 'fix', {
        codeLength: ctx.mermaidState.code.length,
      });

      const startCode = ctx.mermaidState.code;
      const initialValidation = await validateMermaid(startCode, { logError: false });
      let fixAttempt = 0;
      const { code: currentCode, validation, attempts } = await runAutoFixLoop({
        initialCode: startCode,
        initialValidation,
        maxAttempts: AUTO_FIX_MAX_ATTEMPTS,
        validate: (code) => validateMermaid(code, { logError: false }),
        fix: async (code, errorMessage) => {
          fixAttempt += 1;
          logEvent({
            phase: 'fix',
            level: 'info',
            title: 'Auto-fix',
            detail: `attempt ${fixAttempt}/${AUTO_FIX_MAX_ATTEMPTS}`,
            attempt: { current: fixAttempt, max: AUTO_FIX_MAX_ATTEMPTS },
            kind: 'attempt',
          });
          const errLine = (errorMessage || ctx.mermaidState.errorMessage || '').split(/\r?\n/)[0]?.slice(0, 200);
          if (errLine) {
            logEvent({
              phase: 'fix',
              level: 'warn',
              title: 'Auto-fix error',
              detail: errLine,
              attempt: { current: fixAttempt, max: AUTO_FIX_MAX_ATTEMPTS },
              error: { code: 'validation', message: errLine },
              kind: 'attempt',
            });
          }
          const fixedRaw = await runLLMRequest({
            task: 'fix',
            run: () => fixDiagram(
              code,
              errorMessage || ctx.mermaidState.errorMessage || 'Unknown error',
              ctx.aiConfig,
              docs,
              language,
              ctx.modelParams
            ),
            retries: LLM_TIMEOUT_RETRIES,
            timeoutMs: ctx.appState.llmTimeoutMs,
            onStart: (notice) => {
              ctx.onLLMRequestStart?.(notice);
              logEvent({
                phase: 'fix',
                level: 'info',
                title: 'LLM',
                detail: `start ${notice.task}`,
              });
            },
            onTimeout: (notice) => {
              alert(formatTimeoutRetryMessage('Fix', notice.attempt, notice.maxAttempts));
            },
          });
          return extractMermaidCode(fixedRaw);
        },
        onIteration: (code, nextValidation) => {
          ctx.applyValidationPreservingSource(code, nextValidation);
        },
      });
      logEvent({
        phase: 'validate',
        level: validation.isValid ? 'info' : 'warn',
        title: 'Block validation',
        detail: validation.isValid ? 'valid' : 'invalid',
        metrics: attempts ? { autoFix: attempts } : undefined,
        kind: 'block',
      });
      if (!validation.isValid) {
        const line = validation.errorMessage?.split(/\r?\n/)[0]?.slice(0, 200) ?? 'validation error';
        logEvent({
          phase: 'validate',
          level: 'error',
          title: 'Ошибка',
          detail: line,
          error: { code: 'validation', message: line },
          kind: 'block',
        });
      }

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
      await finalizeStep('done', {
        nextMermaid,
        meta: {
          attempts,
          changed,
          isValid: !!validation.isValid,
          cleared,
        },
      });
      await ctx.trackAnalyticsWithContext('diagram_fix_success', 'fix', {
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
      if (e instanceof TimeoutError) {
        alert(formatTimeoutFinalMessage('Fix', LLM_TIMEOUT_RETRIES));
      }
      alert(`Fix failed (${ctx.getCurrentModelName()}): ${message}`);
      logEvent({
        phase: 'fix',
        level: 'error',
        title: 'Исправление',
        detail: message,
        error: { code: 'exception', message },
      });
      stepMessages.push(ctx.addMessage('assistant', `Fix failed: ${message}`, 'fix'));
      await ctx.trackAnalyticsWithContext('diagram_fix_failed', 'fix', {
        error: 'exception',
      });
      await finalizeStep('error', { meta: { error: message } });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};

export const createAnalyzeHandler = (ctx: StudioContext) => {
  return async () => {
    const stepMessages: Message[] = [];
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    const opContextId =
      typeof notebookBlockIndex === 'number' ? `block:${notebookBlockIndex}` : undefined;
    const opId = ctx.startOperation('Анализ', opContextId);
    const logEvent = (args: Parameters<typeof ctx.addOperationEvent>[1]) => {
      ctx.addOperationEvent(opId, args);
    };
    const finalizeStep = async (status: 'done' | 'error', meta?: Record<string, unknown>) => {
      ctx.finishOperation(opId, status);
      await ctx.safeRecordTimeStep({
        type: 'analyze',
        messages: stepMessages,
        meta: {
          ...(meta ?? {}),
          operationLog: ctx.getOperationLog(opId),
        },
      });
    };
    const diagramCode = ctx.getDiagramContextCode ? ctx.getDiagramContextCode().trim() : ctx.mermaidState.code.trim();
    if (ctx.connectionState.status !== 'connected' || !diagramCode) {
      alert('Connect AI and provide Mermaid code first!');
      logEvent({
        phase: 'analyze',
        level: 'error',
        title: 'Анализ',
        detail: ctx.connectionState.status !== 'connected' ? 'offline' : 'no_code',
        error: { code: ctx.connectionState.status !== 'connected' ? 'offline' : 'no_code', message: 'Unavailable' },
      });
      stepMessages.push(
        ctx.addMessage(
          'assistant',
          ctx.connectionState.status !== 'connected'
            ? 'Не могу запустить анализ: подключите AI.'
            : 'Не могу запустить анализ: нет Mermaid-кода.',
          'analyze'
        )
      );
      await finalizeStep('error', { error: ctx.connectionState.status !== 'connected' ? 'offline' : 'no_code' });
      return;
    }

    ctx.setIsProcessing(true);
    try {
      const docs = await ctx.getDocsContext('analyze');
      const language = ctx.resolveAnalyzeLanguage();
      logEvent({
        phase: 'analyze',
        level: 'info',
        title: 'Анализ',
        detail: `язык: ${language}`,
      });
      logEvent({
        phase: 'analyze',
        level: 'info',
        title: 'Контекст',
        detail: `code: ${diagramCode.length} chars\ndocs: ${(docs.length / 1000).toFixed(1)}k`,
        kind: 'context',
        contextScope: 'build',
      });
      const explanation = await runLLMRequest({
        task: 'analyze',
        run: () => analyzeDiagram(diagramCode, ctx.aiConfig, docs, language, ctx.modelParams),
        retries: LLM_TIMEOUT_RETRIES,
        timeoutMs: ctx.appState.llmTimeoutMs,
        onStart: (notice) => {
          ctx.onLLMRequestStart?.(notice);
          logEvent({
            phase: 'analyze',
            level: 'info',
            title: 'LLM',
            detail: `start ${notice.task}`,
          });
        },
        onTimeout: (notice) => {
          alert(formatTimeoutRetryMessage('Analyze', notice.attempt, notice.maxAttempts));
        },
      });
      stepMessages.push(ctx.addMessage('assistant', explanation, 'analyze'));
      logEvent({
        phase: 'analyze',
        level: 'info',
        title: 'Ответ',
        detail: `reply: ${explanation.length} chars`,
      });
      await finalizeStep('done', { diagramType: ctx.appState.diagramType });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof TimeoutError) {
        alert(formatTimeoutFinalMessage('Analyze', LLM_TIMEOUT_RETRIES));
      }
      alert(`Analysis failed (${ctx.getCurrentModelName()}): ${message}`);
      logEvent({
        phase: 'analyze',
        level: 'error',
        title: 'Анализ',
        detail: message,
        error: { code: 'exception', message },
      });
      stepMessages.push(ctx.addMessage('assistant', `Analysis failed: ${message}`, 'analyze'));
      await finalizeStep('error', { error: message });
    } finally {
      ctx.setIsProcessing(false);
    }
  };
};
