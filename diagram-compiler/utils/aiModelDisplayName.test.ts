import { describe, expect, it } from 'vitest';
import { getModelDisplayName } from './aiModelDisplayName';

describe('getModelDisplayName', () => {
  it('removes antigravity token from name', () => {
    expect(getModelDisplayName({ id: 'x', name: 'gemini-3-pro antigravity' })).toBe('gemini-3-pro');
    expect(getModelDisplayName({ id: 'x', name: 'antigravity/gemini-3-pro' })).toBe('gemini-3-pro');
  });

  it('falls back to id when name missing', () => {
    expect(getModelDisplayName({ id: 'antigravity/gemini-3-pro', name: '' })).toBe('gemini-3-pro');
  });

  it('keeps name when no antigravity token', () => {
    expect(getModelDisplayName({ id: 'gemini-3-pro', name: 'Gemini 3 Pro' })).toBe('Gemini 3 Pro');
  });
});
