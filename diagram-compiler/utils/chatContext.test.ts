import { describe, expect, it } from 'vitest';
import { resolveChatContextId } from './chatContext';

describe('chatContext', () => {
  it('returns main when not in notebook mode', () => {
    expect(resolveChatContextId(false, 2)).toBe('main');
  });

  it('returns block id when notebook mode and index provided', () => {
    expect(resolveChatContextId(true, 3)).toBe('block:3');
  });

  it('returns main when notebook mode without index', () => {
    expect(resolveChatContextId(true, null)).toBe('main');
  });
});
