export const runAttemptLoop = async <T>(args: {
  maxAttempts: number;
  execute: () => Promise<T | null>;
  onAttempt?: (attempt: number) => void;
  onEmpty?: (attempt: number) => void;
  onError?: (attempt: number, error: unknown) => void;
}) => {
  let attempts = 0;
  let emptyResponses = 0;
  let lastError: string | undefined;

  while (attempts < args.maxAttempts) {
    attempts += 1;
    args.onAttempt?.(attempts);
    try {
      const result = await args.execute();
      if (result === null) {
        emptyResponses += 1;
        args.onEmpty?.(attempts);
        continue;
      }
      return { value: result, attempts, emptyResponses, lastError };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error.message : String(error);
      args.onError?.(attempts, error);
    }
  }

  return { value: null, attempts, emptyResponses, lastError };
};
