import { describe, expect, it } from 'vitest';
import { averagePercent, getGeminiGroupLabelForModel, getModelFamilyKey } from './aiModelUtils';

describe('aiModelUtils', () => {
  it('detects model family from id/name/vendor', () => {
    expect(getModelFamilyKey({ id: 'gpt-5.2', vendor: 'openai' })).toBe('gpt');
    expect(getModelFamilyKey({ id: 'claude-sonnet-4', name: 'Claude Sonnet 4' })).toBe('claude');
    expect(getModelFamilyKey({ id: 'gemini-3-pro-preview', vendor: 'google' })).toBe('gemini');
    expect(getModelFamilyKey({ id: 'unknown-model' })).toBe('other');
  });

  it('maps gemini model to group label', () => {
    expect(getGeminiGroupLabelForModel('gemini-2.5-pro')).toBe('Gemini Pro Series');
    expect(getGeminiGroupLabelForModel('custom', 'Gemini Flash Something')).toBe('Gemini Flash Series');
  });

  it('averages percents with clamping', () => {
    expect(averagePercent([100, 50, null])).toBeCloseTo(75, 5);
    expect(averagePercent([200, -10, 50])).toBeCloseTo(50, 5);
  });
});
