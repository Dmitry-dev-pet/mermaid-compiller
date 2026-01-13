import {
  validateMermaid,
  extractMermaidBlocksFromMarkdown,
  extractMermaidCode,
  parseMermaidJsonResponse,
  detectMermaidDiagramType,
} from '../../services/mermaidService';
import { generateDiagram, fixDiagram, analyzeDiagram } from '../../services/llmService';
import type { StudioContext } from './actionsContext';
import { AUTO_FIX_MAX_ATTEMPTS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { runAutoFixLoop } from './autoFix';
import type { Message } from '../../types';
import { TimeoutError } from '../../services/llmTimeout';
import { formatTimeoutFinalMessage, formatTimeoutRetryMessage } from './stepMessageUtils';
import { buildSystemPrompt } from '../../services/llm/prompts';
import {
  buildContextTooltipForLog,
  buildDocsTooltipForLog,
  formatDocsDetailForLog,
  joinLogDetailLines,
  summarizeMessagesForLog,
} from './logContextUtils';
import { fetchDiagramSyntaxDoc, formatDocsContext } from '../../services/docsContextService';
import { runStudioOperation } from './runStudioOperation';
import { createStudioOperationRunner } from './operationRunner';

export const createRecompileHandler = (ctx: StudioContext) => {
  return async () => {
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    await runStudioOperation(ctx, {
      title: 'Пересборка',
      stepType: 'recompile',
      notebookBlockIndex,
      run: async ({ logEvent, finalizeStep, addStepMessage }) => {
        const pushStatus = (content: string) => {
          addStepMessage('assistant', content, 'build');
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
          const runner = createStudioOperationRunner(ctx, { logEvent });
          let llmDurationMs: number | null = null;
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

          const rawCode = await runner.runLLM({
            task: 'recompile',
            phase: 'compile',
            run: () => generateDiagram(llmMessages, ctx.aiConfig, ctx.appState.diagramType, docs, language, ctx.modelParams),
            retries: LLM_TIMEOUT_RETRIES,
            timeoutMs: ctx.appState.llmTimeoutMs,
            stageContextScope: 'build',
            onFinish: (notice) => {
              if (notice.status === 'success') {
                llmDurationMs = notice.durationMs;
              }
            },
            onTimeoutDetail: (notice) => {
              const message = formatTimeoutRetryMessage('Recompile', notice.attempt, notice.maxAttempts);
              alert(message);
              return message;
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
            metrics: llmDurationMs ? { durationMs: llmDurationMs } : undefined,
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
      },
    });
  };
};

export const createFixSyntaxHandler = (ctx: StudioContext) => {
  return async () => {
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    await runStudioOperation(ctx, {
      title: 'Исправление',
      stepType: 'fix',
      notebookBlockIndex,
      run: async ({ stepMessages, logEvent, finalizeStep }) => {
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
          const language = ctx.resolveLanguage();
          const detectedDiagramType =
            detectMermaidDiagramType(ctx.mermaidState.code) ?? ctx.appState.diagramType;
          const syntaxDoc = await fetchDiagramSyntaxDoc(detectedDiagramType);
          const docsEntries = syntaxDoc.path ? [{ path: syntaxDoc.path, text: syntaxDoc.text }] : [];
          const docs = docsEntries.length ? formatDocsContext(docsEntries) : await ctx.getDocsContext('fix');
          logEvent({
            phase: 'fix',
            level: 'info',
            title: 'Исправление',
            detail: `язык: ${language}`,
          });
          const selectionSummary = await ctx.getDocsSelectionSummary?.('fix');
          const effectiveSelectionSummary =
            docsEntries.length
              ? { includedPaths: docsEntries.map((entry) => entry.path) }
              : (selectionSummary ? { includedPaths: selectionSummary.includedPaths } : null);
          const fixMessage: Message = {
            id: 'fix-input',
            role: 'user',
            content: [
              'Code:',
              '```mermaid',
              ctx.mermaidState.code,
              '```',
              '',
              'Error:',
              (ctx.mermaidState.errorMessage ?? '').trim() || 'Unknown error',
            ].join('\n'),
            timestamp: Date.now(),
          };
          const msgSummary = summarizeMessagesForLog([fixMessage]);
          const docsDetail = formatDocsDetailForLog({
            docsContext: docs,
            selectionSummary: effectiveSelectionSummary,
          });
          const systemPrompt = buildSystemPrompt('fix', {
            diagramType: detectedDiagramType,
            docsContext: 'Documentation context redacted.',
            language,
          });
          const tooltipMessages = buildContextTooltipForLog({
            systemPrompt,
            messages: [fixMessage],
            docsDetail,
          });
          const tooltipDocs = buildDocsTooltipForLog(docsDetail);
          logEvent({
            phase: 'fix',
            level: 'info',
            title: 'Контекст',
            detail: joinLogDetailLines(
              `messages: ${msgSummary.count} (${msgSummary.tokens} tok)`,
              docsDetail
            ),
            tooltipMessages,
            tooltipDocs,
            kind: 'context',
            contextScope: 'fix',
          });
          await ctx.trackAnalyticsWithContext('diagram_fix_started', 'fix', {
            codeLength: ctx.mermaidState.code.length,
          });

          const runner = createStudioOperationRunner(ctx, { logEvent });
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
              const fixedRaw = await runner.runLLM({
                task: 'fix',
                phase: 'fix',
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
                stageContextScope: 'fix',
                onTimeoutDetail: (notice) => {
                  const message = formatTimeoutRetryMessage('Fix', notice.attempt, notice.maxAttempts);
                  alert(message);
                  return message;
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
      },
    });
  };
};

export const createAnalyzeHandler = (ctx: StudioContext) => {
  return async () => {
    const notebookBlockIndex = ctx.isNotebookChatMode ? ctx.getNotebookChatIndex?.() : null;
    await runStudioOperation(ctx, {
      title: 'Анализ',
      stepType: 'analyze',
      notebookBlockIndex,
      run: async ({ stepMessages, logEvent, finalizeStep }) => {
        const notebookMarkdown = ctx.mermaidState.code.trim();
        const notebookBlocks = extractMermaidBlocksFromMarkdown(notebookMarkdown);
        const isNotebookAnalysis = !ctx.isNotebookChatMode && notebookBlocks.length > 1;
        const diagramCode = ctx.getDiagramContextCode ? ctx.getDiagramContextCode().trim() : notebookMarkdown;
        const intent = ctx.getCurrentIntent?.() ?? null;
        const analysisInput = isNotebookAnalysis
          ? [
              intent?.content ? `Notebook intent:\n${intent.content.trim()}\n` : '',
              'Notebook content:',
              notebookMarkdown,
            ]
              .filter(Boolean)
              .join('\n\n')
              .trim()
          : diagramCode;

        if (ctx.connectionState.status !== 'connected' || !analysisInput) {
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
          await finalizeStep('error', { meta: { error: ctx.connectionState.status !== 'connected' ? 'offline' : 'no_code' } });
          return;
        }

        ctx.setIsProcessing(true);
        try {
          const language = ctx.resolveAnalyzeLanguage();
          const detectedTypes = isNotebookAnalysis
            ? Array.from(
                new Set(
                  notebookBlocks
                    .map((block) => detectMermaidDiagramType(block.code) ?? null)
                    .filter(Boolean) as string[]
                )
              )
            : [];
          const notebookSyntaxDocs = isNotebookAnalysis
            ? await Promise.all(detectedTypes.map((type) => fetchDiagramSyntaxDoc(type as never)))
            : [];
          const notebookDocsEntries = notebookSyntaxDocs
            .filter((doc) => doc.path && doc.text)
            .map((doc) => ({ path: doc.path as string, text: doc.text }));
          const detectedDiagramType = isNotebookAnalysis
            ? ctx.appState.diagramType
            : (detectMermaidDiagramType(analysisInput) ?? ctx.appState.diagramType);
          const singleSyntaxDoc = !isNotebookAnalysis
            ? await fetchDiagramSyntaxDoc(detectedDiagramType)
            : { text: '', path: null };
          const singleDocsEntries =
            !isNotebookAnalysis && singleSyntaxDoc.path && singleSyntaxDoc.text
              ? [{ path: singleSyntaxDoc.path, text: singleSyntaxDoc.text }]
              : [];
          const docsEntries = isNotebookAnalysis ? notebookDocsEntries : singleDocsEntries;
          const docs = docsEntries.length ? formatDocsContext(docsEntries) : await ctx.getDocsContext('analyze');
          const scopeLabel = isNotebookAnalysis
            ? `notebook (${notebookBlocks.length} diagrams)`
            : (
                ctx.isNotebookChatMode && notebookBlockIndex !== null
                  ? `diagram (${notebookBlockIndex + 1}/${Math.max(1, notebookBlocks.length)})`
                  : 'diagram'
              );
          logEvent({
            phase: 'analyze',
            level: 'info',
            title: 'Анализ',
            detail: `${scopeLabel}, язык: ${language}`,
          });
          const selectionSummary = await ctx.getDocsSelectionSummary?.('analyze');
          const effectiveSelectionSummary =
            docsEntries.length
              ? { includedPaths: docsEntries.map((entry) => entry.path) }
              : (selectionSummary ? { includedPaths: selectionSummary.includedPaths } : null);
          const analyzeMessage: Message = {
            id: 'analyze-input',
            role: 'user',
            content: analysisInput,
            timestamp: Date.now(),
          };
          const msgSummary = summarizeMessagesForLog([analyzeMessage]);
          const docsDetail = formatDocsDetailForLog({
            docsContext: docs,
            selectionSummary: effectiveSelectionSummary,
          });
          const systemPrompt = buildSystemPrompt('analyze', {
            diagramType: detectedDiagramType,
            docsContext: 'Documentation context redacted.',
            language,
          });
          const tooltipMessages = buildContextTooltipForLog({
            systemPrompt,
            messages: [analyzeMessage],
            docsDetail,
          });
          const tooltipDocs = buildDocsTooltipForLog(docsDetail);
          logEvent({
            phase: 'analyze',
            level: 'info',
            title: 'Контекст',
            detail: joinLogDetailLines(
              `messages: ${msgSummary.count} (${msgSummary.tokens} tok)`,
              docsDetail
            ),
            tooltipMessages,
            tooltipDocs,
            kind: 'context',
            contextScope: 'analyze',
          });
          const runner = createStudioOperationRunner(ctx, { logEvent });
          let llmDurationMs: number | null = null;
          const explanation = await runner.runLLM({
            task: 'analyze',
            phase: 'analyze',
            run: () => analyzeDiagram(analysisInput, ctx.aiConfig, docs, language, ctx.modelParams),
            retries: LLM_TIMEOUT_RETRIES,
            timeoutMs: ctx.appState.llmTimeoutMs,
            onFinish: (notice) => {
              if (notice.status === 'success') {
                llmDurationMs = notice.durationMs;
              }
            },
            stageContextScope: 'analyze',
            onTimeoutDetail: (notice) => {
              const message = formatTimeoutRetryMessage('Analyze', notice.attempt, notice.maxAttempts);
              alert(message);
              return message;
            },
          });
          stepMessages.push(ctx.addMessage('assistant', explanation, 'analyze'));
          logEvent({
            phase: 'analyze',
            level: 'info',
            title: 'Ответ',
            detail: `reply: ~${Math.max(1, Math.ceil(explanation.length / 4))} tok`,
            metrics: llmDurationMs ? { durationMs: llmDurationMs } : undefined,
          });
          await finalizeStep('done', { meta: { diagramType: ctx.appState.diagramType } });
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
          await finalizeStep('error', { meta: { error: message } });
        } finally {
          ctx.setIsProcessing(false);
        }
      },
    });
  };
};
