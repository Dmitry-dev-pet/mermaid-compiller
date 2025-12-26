export const formatTimeoutRetryMessage = (label: string, attempt: number, maxAttempts: number) =>
  `${label} timeout. Retrying (${attempt}/${maxAttempts})...`;

export const formatTimeoutFinalMessage = (label: string, maxAttempts: number) =>
  `${label} timed out after ${maxAttempts} attempts.`;
