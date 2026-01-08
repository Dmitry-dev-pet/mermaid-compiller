import { describe, expect, it } from 'vitest';
import { normalizeSummaryText, sanitizeSummaryText } from './buildSummary';

describe('buildSummary', () => {
  it('normalizes duplicated sentences and preserves prefix', () => {
    const input = 'Итог: Сборка успешна. Сборка успешна.';
    const result = normalizeSummaryText(input);
    expect(result).toBe('Итог: Сборка успешна.');
  });

  it('sanitizes JSON-wrapped summaries', () => {
    const input = '```json\n{"content":"Итог: Все ок."}\n```';
    const result = sanitizeSummaryText(input);
    expect(result).toBe('Итог: Все ок.');
  });
});
