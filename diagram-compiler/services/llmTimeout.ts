export class TimeoutError extends Error {
  override name = "TimeoutError";
}

const createAbortError = () => {
  const error = new Error("LLM request aborted");
  error.name = "AbortError";
  return error;
};

export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal | null,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  const abortPromise = new Promise<never>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    abortHandler = () => reject(createAbortError());
    signal.addEventListener("abort", abortHandler, { once: true });
  });

  try {
    return await Promise.race([promise, timeoutPromise, abortPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
};
