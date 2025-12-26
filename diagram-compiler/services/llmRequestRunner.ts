import { LLM_TIMEOUT_MS, LLM_TIMEOUT_RETRIES } from '../constants';
import { TimeoutError, withTimeout } from './llmTimeout';

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
};

export const runLLMRequest = async <T>(args: RunLLMRequestArgs<T>): Promise<T> => {
  const maxAttempts = args.retries ?? LLM_TIMEOUT_RETRIES;
  const timeoutMs = args.timeoutMs ?? LLM_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withTimeout(args.run(), timeoutMs);
    } catch (error) {
      lastError = error;
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

  throw lastError instanceof Error ? lastError : new Error(`LLM request failed for ${args.task}.`);
};
