import { describe, expect, test } from 'vitest';
import {
  resolveDiagramTypeShortLabelFromText,
  stripDiagramTypeFromText,
  stripInnerBlockLabelFromContextText,
} from './operationLogTextUtils';

describe('operationLogTextUtils', () => {
  test('strips diagram type from result rows', () => {
    const input = '44.0s 3/4 — flowchart - Хронология службы ✅';
    expect(stripDiagramTypeFromText(input)).toBe('44.0s 3/4 — Хронология службы ✅');
  });

  test('strips inner block label from context rows after type stripping', () => {
    const input = '1 — Контекст — 1/3 - flowchart - Сюжетная линия Швейка';
    const withoutType = stripDiagramTypeFromText(input);
    expect(withoutType).toBe('1 — Контекст — 1/3 - Сюжетная линия Швейка');
    expect(stripInnerBlockLabelFromContextText(withoutType)).toBe('1 — Контекст — Сюжетная линия Швейка');
  });

  test('extracts short type label', () => {
    const input = '1 — Контекст — 1/3 - flowchart - Сюжетная линия Швейка';
    expect(resolveDiagramTypeShortLabelFromText(input)).toBe('FC');
  });

  test('extracts short labels for common types', () => {
    const cases = [
      { input: '1/2 - sequence - Handshake', expected: 'SD' },
      { input: '1/2 - er - Model', expected: 'ER' },
      { input: '1/2 - architecture - Services', expected: 'AR' },
    ];
    for (const item of cases) {
      expect(resolveDiagramTypeShortLabelFromText(item.input)).toBe(item.expected);
    }
  });

  test('extracts and strips type when text starts with it', () => {
    const input = 'flowchart - Хронология службы ✅';
    expect(resolveDiagramTypeShortLabelFromText(input)).toBe('FC');
    expect(stripDiagramTypeFromText(input)).toBe('Хронология службы ✅');
  });

  test('does nothing when type is absent', () => {
    const input = 'Итог — ready';
    expect(stripDiagramTypeFromText(input)).toBe(input);
    expect(stripInnerBlockLabelFromContextText(input)).toBe(input);
    expect(resolveDiagramTypeShortLabelFromText(input)).toBe(null);
  });
});
