import { chat, chatDiagram, chatNotebook } from "../../services/llmService";
import { LLM_TIMEOUT_RETRIES } from "../../constants";
import { TimeoutError } from "../../services/llmTimeout";
import {
  formatTimeoutFinalMessage,
  formatTimeoutRetryMessage,
} from "./stepMessageUtils";
import { stripMermaidCode } from "../../utils";
import {
  enforceAllowedDiagramTypesInIntent,
  normalizeIntentText,
} from "../../utils/intent";
import type { Message } from "../../types";
import {
  ANALYTICS_EVENTS,
  type ChatAnalyticsPayload,
} from "../../services/analyticsEvents";
import type { StudioContext } from "./actionsContext";
import { runStudioOperation } from "./runStudioOperation";
import { isDefaultSessionTitle } from "../../services/history/sessionTitle";
import { createStudioOperationRunner } from "./operationRunner";
import { buildSystemPrompt } from "../../services/llm/prompts";
import { buildContextEventForLog } from "./logContextUtils";
import { toRunnerContextEvent } from "./operationTracer";
import { buildSelectionLine } from "./selectionLine";

export const createChatHandler = (ctx: StudioContext) => {
  return async (text: string) => {
    const trimmedInput = text.trim();
    const isRefinementRequestForLog = (() => {
      const lowered = trimmedInput.toLowerCase().replace(/\s+/g, " ").trim();
      if (!lowered) return false;
      if (lowered.length > 80) return false;
      return /(усложни|упрости|подробнее|подробно|развей|разверни|раскрой|расширь|детализируй|добавь|сократи|еще|ещё|более подробно|increase|expand|elaborate|simplify|detail)/.test(
        lowered,
      );
    })();
    const notebookBlockIndex = ctx.isNotebookChatMode
      ? ctx.getNotebookChatIndex?.()
      : null;
    return runStudioOperation(ctx, {
      title: "Чат",
      stepType: "chat",
      notebookBlockIndex,
      run: async ({ stepMessages, logEvent, finalizeStep }) => {
        const runner = createStudioOperationRunner(ctx, { logEvent });
        const finalize = async (
          status: "done" | "error",
          meta?: Record<string, unknown>,
        ) => {
          await finalizeStep(status, { meta });
        };

        logEvent({
          phase: "chat",
          level: "info",
          title: "Чат",
          detail: isRefinementRequestForLog ? "refine" : "intent",
          kind: "status",
        });
        stepMessages.push(ctx.addMessage("user", text, "chat"));
        if (ctx.connectionState.status !== "connected") {
          stepMessages.push(
            ctx.addMessage(
              "assistant",
              "Офлайн. Подключите AI для генерации.",
              "chat",
            ),
          );
          logEvent({
            phase: "chat",
            level: "error",
            title: "Чат",
            detail: "offline",
            error: { code: "offline", message: "AI offline" },
          });
          const payload: ChatAnalyticsPayload = { error: "offline" };
          await ctx.trackAnalyticsWithContext(
            ANALYTICS_EVENTS.chatFailed,
            "chat",
            payload,
          );
          await finalize("error", { error: "offline" });
          return;
        }

        const language = ctx.resolveLanguage(text);

        const startedAt = Date.now();
        ctx.setIsProcessing(true);
        try {
          logEvent({
            phase: "chat",
            level: "info",
            title: "Чат",
            detail: `язык: ${language}`,
          });
          const startedPayload: ChatAnalyticsPayload = {
            hasPrompt: text.trim().length > 0,
          };
          await ctx.trackAnalyticsWithContext(
            ANALYTICS_EVENTS.chatStarted,
            "chat",
            startedPayload,
          );
          const isRefinementRequest = (() => {
            return isRefinementRequestForLog;
          })();
          const relevantMessages = ctx.getRelevantMessages();
          const lastUserMessage =
            relevantMessages
              .slice()
              .reverse()
              .find((m) => m.role === "user" && m.content.trim().length > 0) ??
            null;
          const llmBaseMessages =
            isRefinementRequest && !ctx.isNotebookChatMode
              ? lastUserMessage
                ? [lastUserMessage]
                : relevantMessages
              : relevantMessages;
          const llmMessagesBase = ctx.buildLLMMessages(llmBaseMessages);
          const useNotebookIntent =
            ctx.isNotebookChatEnabled &&
            !ctx.isNotebookChatMode &&
            !isRefinementRequest;
          const notebookCount = useNotebookIntent
            ? ctx.appState.notebookBuildCount
            : null;
          const notebookCountMessage = notebookCount
            ? {
                id: "notebook-count",
                role: "user" as const,
                content:
                  language === "Russian"
                    ? typeof notebookCount === "string"
                      ? `Диапазон диаграмм: ${notebookCount}.`
                      : `Количество диаграмм: ${notebookCount}.`
                    : typeof notebookCount === "string"
                      ? `Diagram range: ${notebookCount}.`
                      : `Diagram count: ${notebookCount}.`,
                timestamp: Date.now(),
              }
            : null;
          const refinementHint =
            isRefinementRequest && !ctx.isNotebookChatMode
              ? {
                  id: "refinement-hint",
                  role: "user" as const,
                  content:
                    language === "Russian"
                      ? "Ответь конкретными правками к диаграмме. Не используй формат Summary/Diagrams и не перечисляй типы диаграмм."
                      : "Reply with concrete edits to the diagram. Do not use Summary/Diagrams format or list diagram types.",
                  timestamp: Date.now(),
                }
              : null;
          const shouldAutoTitle =
            !ctx.isNotebookChatMode &&
            ctx.historySession &&
            isDefaultSessionTitle(ctx.historySession);
          const titleInstruction = shouldAutoTitle
            ? {
                id: "project-title-hint",
                role: "user" as const,
                content:
                  "At the very end, add a line: PROJECT_TITLE: <1-2 English words, Title Case>. Do not add anything else after it.",
                timestamp: Date.now(),
              }
            : null;
          const llmMessages = [
            ...llmMessagesBase,
            ...(notebookCountMessage ? [notebookCountMessage] : []),
            ...(refinementHint ? [refinementHint] : []),
            ...(titleInstruction ? [titleInstruction] : []),
          ];

          const docs = await ctx.getDocsContext("chat");
          const selectionSummary = await ctx.getDocsSelectionSummary?.("chat");
          const allowedNotebookTypes =
            ctx.appState.diagramType === "auto"
              ? ctx.appState.mainDiagramTypes
              : null;
          const promptMode = useNotebookIntent
            ? "chat_notebook"
            : ctx.isNotebookChatMode || isRefinementRequest
              ? "chat_diagram"
              : "chat";
          const systemPrompt = buildSystemPrompt(
            promptMode,
            ctx.buildLLMRequestContext({
              diagramType: ctx.appState.diagramType,
              allowedDiagramTypes: allowedNotebookTypes,
              docsContext: "Documentation context redacted.",
              language,
            }),
          );
          const selectionLine = buildSelectionLine({
            diagramType: ctx.appState.diagramType,
            allowedDiagramTypes: allowedNotebookTypes,
          });
          const contextEvent = buildContextEventForLog({
            phase: "chat",
            contextScope: "chat",
            diagramType: ctx.appState.diagramType,
            selectionLine,
            systemPrompt,
            messages: llmMessages,
            docsContext: docs,
            selectionSummary,
          });
          const responseText = await runner.runLLM({
            task: "chat",
            phase: "chat",
            retries: LLM_TIMEOUT_RETRIES,
            timeoutMs: ctx.appState.llmTimeoutMs,
            contextEvent: toRunnerContextEvent(contextEvent),
            onTimeoutDetail: (notice) =>
              formatTimeoutRetryMessage(
                "Chat",
                notice.attempt,
                notice.maxAttempts,
              ),
            run: (signal) =>
              useNotebookIntent
                ? chatNotebook(
                    llmMessages,
                    ctx.aiConfig,
                    ctx.buildLLMRequestContext({
                      diagramType: ctx.appState.diagramType,
                      allowedDiagramTypes: allowedNotebookTypes,
                      docsContext: docs,
                      language,
                    }),
                    ctx.modelParams,
                    signal,
                  )
                : ctx.isNotebookChatMode || isRefinementRequest
                  ? chatDiagram(
                      llmMessages,
                      ctx.aiConfig,
                      ctx.buildLLMRequestContext({
                        diagramType: ctx.appState.diagramType,
                        allowedDiagramTypes: allowedNotebookTypes,
                        docsContext: docs,
                        language,
                      }),
                      ctx.modelParams,
                      signal,
                    )
                  : chat(
                      llmMessages,
                      ctx.aiConfig,
                      ctx.buildLLMRequestContext({
                        diagramType: ctx.appState.diagramType,
                        allowedDiagramTypes: allowedNotebookTypes,
                        docsContext: docs,
                        language,
                      }),
                      ctx.modelParams,
                      signal,
                    ),
          });
          const rawReply = stripMermaidCode(responseText).trim();
          const sanitizeProjectTitle = (value: string) => {
            const words = value.match(/[A-Za-z]+/g) ?? [];
            if (!words.length) return "";
            return words
              .slice(0, 2)
              .map(
                (word) =>
                  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
              )
              .join(" ");
          };
          let autoTitle = "";
          if (shouldAutoTitle) {
            const match = rawReply.match(/(?:^|\n)PROJECT_TITLE:\s*([^\n]+)$/i);
            if (match?.[1]) {
              autoTitle = sanitizeProjectTitle(match[1]);
            }
          }
          const replyWithoutTitle = shouldAutoTitle
            ? rawReply.replace(/(?:^|\n)PROJECT_TITLE:\s*[^\n]*$/i, "").trim()
            : rawReply;
          const stripIntentScaffold = (text: string) => {
            const stripHeadings = (value: string) =>
              value
                .replace(/^#{1,6}\s+/gm, "")
                .replace(/^\s*Intent:\s*/gim, "")
                .trim();
            const stripPromptEcho = (value: string) => {
              const promptLine =
                /^(Role|Goal|Rules|Docs Context|Context|System prompt|Messages|Docs)\b/i;
              const promptLineRu =
                /^(Роль|Цель|Правила|Контекст документации|Контекст|Системный промпт|Сообщения|Документация)\b/i;
              const redacted = /^Documentation context redacted\./i;
              const next = value
                .split(/\r?\n/)
                .filter((line) => {
                  const trimmed = line.trim();
                  if (!trimmed) return true;
                  if (redacted.test(trimmed)) return false;
                  if (promptLine.test(trimmed)) return false;
                  if (promptLineRu.test(trimmed)) return false;
                  return true;
                })
                .join("\n");
              return next;
            };
            if (
              !/(^|\n)(Intent:|##\s+Summary|##\s+Diagrams|##\s+Glossary|##\s+Constraints|##\s+Open questions|Предложено\s+\d+|Почему так:)/i.test(
                text,
              )
            ) {
              return stripHeadings(stripPromptEcho(text)).replace(
                /[\u3400-\u9fff]/g,
                "",
              );
            }
            const suggestionMatch = text.match(
              /\n(Для|Предлагаю|Можно|Добавьте|Добавить|Уточните|Сделайте|Чтобы)[\s\S]*/,
            );
            if (suggestionMatch) {
              return stripHeadings(
                stripPromptEcho(suggestionMatch[0].trim()),
              ).replace(/[\u3400-\u9fff]/g, "");
            }
            const cleaned = text
              .split(/\r?\n/)
              .filter(
                (line) =>
                  !/^(Intent:|##\s+|-\s|Предложено\s+\d+|Почему так:)/i.test(
                    line.trim(),
                  ),
              )
              .join("\n")
              .trim();
            return stripHeadings(stripPromptEcho(cleaned || text)).replace(
              /[\u3400-\u9fff]/g,
              "",
            );
          };
          let intentText = normalizeIntentText(replyWithoutTitle);
          if (useNotebookIntent) {
            if (ctx.appState.diagramType === "auto") {
              if (allowedNotebookTypes?.length) {
                intentText = enforceAllowedDiagramTypesInIntent(
                  intentText,
                  allowedNotebookTypes,
                );
              }
            } else {
              intentText = enforceAllowedDiagramTypesInIntent(
                intentText,
                [ctx.appState.diagramType],
                ctx.appState.diagramType,
              );
            }
          }
          const replyText = useNotebookIntent
            ? intentText
            : isRefinementRequest
              ? stripIntentScaffold(replyWithoutTitle)
              : replyWithoutTitle;
          let replyMessage: Message | null = null;
          if (replyText || useNotebookIntent) {
            replyMessage = ctx.addMessage(
              "assistant",
              replyText || "Ответ пустой. Уточните запрос.",
              "chat",
            );
            stepMessages.push(replyMessage);
            logEvent({
              phase: "chat",
              level: "info",
              title: "Чат",
              detail: `${useNotebookIntent ? "intent" : "reply"} ${replyText.length}`,
              metrics: { durationMs: Date.now() - startedAt },
            });
          } else {
            const fallbackReply = "Ответ пустой. Уточните запрос.";
            replyMessage = ctx.addMessage("assistant", fallbackReply, "chat");
            stepMessages.push(replyMessage);
            logEvent({
              phase: "chat",
              level: "warn",
              title: "Чат",
              detail: "empty",
              metrics: { durationMs: Date.now() - startedAt },
            });
          }
          if (useNotebookIntent && intentText) {
            ctx.setCurrentIntent({
              content: intentText,
              source: "chat",
              updatedAt: Date.now(),
            });
          } else if (ctx.isNotebookChatMode && replyWithoutTitle) {
            ctx.setCurrentIntent({
              content: replyWithoutTitle,
              source: "chat",
              updatedAt: Date.now(),
            });
          }
          const successPayload: ChatAnalyticsPayload = {
            durationMs: Date.now() - startedAt,
            intentLength: useNotebookIntent ? intentText.length : 0,
          };
          await ctx.trackAnalyticsWithContext(
            ANALYTICS_EVENTS.chatSuccess,
            "chat",
            successPayload,
          );
          const resolvedIntent = useNotebookIntent
            ? intentText || null
            : ctx.isNotebookChatMode
              ? replyWithoutTitle || null
              : null;
          await finalize("done", {
            intent: resolvedIntent,
            autoTitle: autoTitle || undefined,
          });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          if (e instanceof TimeoutError) {
            logEvent({
              phase: "chat",
              level: "error",
              title: "Timeout",
              detail: formatTimeoutFinalMessage("Chat", LLM_TIMEOUT_RETRIES),
            });
          }
          const failedPayload: ChatAnalyticsPayload = {
            error: "exception",
            durationMs: Date.now() - startedAt,
          };
          await ctx.trackAnalyticsWithContext(
            ANALYTICS_EVENTS.chatFailed,
            "chat",
            failedPayload,
          );
          stepMessages.push(
            ctx.addMessage(
              "assistant",
              `Чат: ошибка (${ctx.getCurrentModelName()}): ${message}`,
              "chat",
            ),
          );
          logEvent({
            phase: "chat",
            level: "error",
            title: "Чат",
            detail: message,
            error: { code: "exception", message },
          });
          await finalize("error", { error: message });
        } finally {
          ctx.setIsProcessing(false);
        }
      },
    });
  };
};
