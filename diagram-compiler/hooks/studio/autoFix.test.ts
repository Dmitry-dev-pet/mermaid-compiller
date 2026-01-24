import { describe, expect, it, vi } from 'vitest';
import { runAutoFixLoop } from './autoFix';

describe('runAutoFixLoop', () => {
  it('fixes code until validation passes', async () => {
    const validate = vi.fn().mockResolvedValueOnce({ isValid: true });
    const fix = vi.fn().mockResolvedValueOnce('fixed code');
    const onIteration = vi.fn();

    const result = await runAutoFixLoop({
      initialCode: 'bad code',
      initialValidation: { isValid: false, errorMessage: 'Bad' },
      maxAttempts: 3,
      validate,
      fix,
      onIteration,
    });

    expect(result.code).toBe('fixed code');
    expect(result.attempts).toBe(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(onIteration).toHaveBeenCalledTimes(2);
  });

  it('stops when fix returns empty code', async () => {
    const validate = vi.fn();
    const fix = vi.fn().mockResolvedValueOnce('   ');
    const onIteration = vi.fn();

    const result = await runAutoFixLoop({
      initialCode: 'bad code',
      initialValidation: { isValid: false, errorMessage: 'Bad' },
      maxAttempts: 2,
      validate,
      fix,
      onIteration,
    });

    expect(result.code).toBe('bad code');
    expect(result.attempts).toBe(1);
    expect(validate).not.toHaveBeenCalled();
    expect(onIteration).toHaveBeenCalledTimes(1);
  });
});
