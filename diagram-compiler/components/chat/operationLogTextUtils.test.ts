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

  test('does nothing when type is absent', () => {
    const input = 'Итог — ready';
    expect(stripDiagramTypeFromText(input)).toBe(input);
    expect(stripInnerBlockLabelFromContextText(input)).toBe(input);
    expect(resolveDiagramTypeShortLabelFromText(input)).toBe(null);
  });
});

