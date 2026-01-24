import { describe, expect, it } from 'vitest';
import { formatTimeoutFinalMessage, formatTimeoutRetryMessage } from './stepMessageUtils';

describe('stepMessageUtils', () => {
  it('formats timeout retry message', () => {
    expect(formatTimeoutRetryMessage('Build', 2, 3)).toBe('Build timeout. Retrying (2/3)...');
  });

  it('formats timeout final message', () => {
    expect(formatTimeoutFinalMessage('Build', 3)).toBe('Build timed out after 3 attempts.');
  });
});
