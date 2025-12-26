import { LLM_TIMEOUT_MS, LLM_TIMEOUT_RETRIES } from '../constants';

export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

export const withTimeout = async <T>(promise: Promise<T>, timeoutMs = LLM_TIMEOUT_MS): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

export const retryOnTimeout = async <T>(fn: () => Promise<T>, args?: {
  attempts?: number;
  onTimeout?: (attempt: number, error: TimeoutError) => void;
}): Promise<T> => {
  const maxAttempts = args?.attempts ?? LLM_TIMEOUT_RETRIES;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof TimeoutError) {
        args?.onTimeout?.(attempt, error);
        if (attempt < maxAttempts) {
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('LLM request timed out.');
};
