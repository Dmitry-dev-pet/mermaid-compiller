import { LLM_TIMEOUT_MS, LLM_TIMEOUT_RETRIES } from "../constants";
import { TimeoutError, withTimeout } from "./llmTimeout";

type TimeoutNotice = {
  attempt: number;
  maxAttempts: number;
  error: TimeoutError;
  task: string;
};

type RunLLMRequestArgs<T> = {
  task: string;
  run: () => Promise<T>;
  timeoutMs?: number;
  retries?: number;
  onTimeout?: (notice: TimeoutNotice) => void;
  onStart?: (notice: LLMRequestStartNotice) => void;
  onFinish?: (notice: LLMRequestFinishNotice) => void;
  signal?: AbortSignal | null;
};

export type LLMRequestStartNotice = {
  task: string;
  attempt: number;
  maxAttempts: number;
  startedAt: number;
};

export type LLMRequestFinishNotice = {
  task: string;
  attempt: number;
  maxAttempts: number;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  status: "success" | "timeout" | "error";
};

export const runLLMRequest = async <T>(
  args: RunLLMRequestArgs<T>,
): Promise<T> => {
  const maxAttempts = args.retries ?? LLM_TIMEOUT_RETRIES;
  const timeoutMs = args.timeoutMs ?? LLM_TIMEOUT_MS;
  let lastError: unknown;
  const createAbortError = () => {
    const error = new Error("LLM request aborted");
    error.name = "AbortError";
    return error;
  };
  const isAbortError = (error: unknown) =>
    error instanceof Error &&
    (error.name === "AbortError" || /aborted/i.test(error.message));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (args.signal?.aborted) {
      throw createAbortError();
    }
    const startedAt = Date.now();
    args.onStart?.({
      task: args.task,
      attempt,
      maxAttempts,
      startedAt,
    });
    try {
      const result = await withTimeout(
        args.run(),
        timeoutMs,
        args.signal ?? undefined,
      );
      const finishedAt = Date.now();
      args.onFinish?.({
        task: args.task,
        attempt,
        maxAttempts,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        status: "success",
      });
      return result;
    } catch (error) {
      lastError = error;
      const finishedAt = Date.now();
      const aborted = isAbortError(error);
      args.onFinish?.({
        task: args.task,
        attempt,
        maxAttempts,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        status: error instanceof TimeoutError ? "timeout" : "error",
      });
      if (aborted) {
        throw error;
      }
      if (error instanceof TimeoutError) {
        if (attempt < maxAttempts) {
          args.onTimeout?.({
            attempt: attempt + 1,
            maxAttempts,
            error,
            task: args.task,
          });
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`LLM request failed for ${args.task}.`);
};
