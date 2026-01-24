import { describe, expect, it, vi } from 'vitest';
import { runAttemptLoop } from './retry';

describe('runAttemptLoop', () => {
  it('returns value after empty responses', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('ok');
    const onAttempt = vi.fn();
    const onEmpty = vi.fn();

    const result = await runAttemptLoop({
      maxAttempts: 3,
      execute,
      onAttempt,
      onEmpty,
    });

    expect(result.value).toBe('ok');
    expect(result.attempts).toBe(2);
    expect(result.emptyResponses).toBe(1);
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onEmpty).toHaveBeenCalledTimes(1);
  });

  it('tracks last error when all attempts fail', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(null);
    const onError = vi.fn();

    const result = await runAttemptLoop({
      maxAttempts: 2,
      execute,
      onError,
    });

    expect(result.value).toBeNull();
    expect(result.attempts).toBe(2);
    expect(result.emptyResponses).toBe(1);
    expect(result.lastError).toBe('boom');
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
