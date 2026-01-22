import { describe, expect, it } from 'vitest';
import { summarizeFixOutcome } from './fixSummary';

describe('summarizeFixOutcome', () => {
  it('reports header fix when type was missing', () => {
    const summary = summarizeFixOutcome({
      indexLabel: 'блок 1',
      attempts: 2,
      changed: true,
      cleared: false,
      wasValid: true,
      errorMessage: 'No diagram type detected',
      before: 'flowchart TD\nA-->B',
      after: 'flowchart LR\nA-->B',
    });
    expect(summary).toContain('исправлен заголовок диаграммы');
    expect(summary).toContain('попыток: 2');
  });

  it('summarizes parse errors with line hint', () => {
    const summary = summarizeFixOutcome({
      indexLabel: 'блок',
      attempts: 1,
      changed: false,
      cleared: false,
      wasValid: false,
      finalErrorMessage: 'Parse error on line 2',
    });
    expect(summary).toContain('Синтаксическая ошибка в строке 2.');
    expect(summary).toContain('Ошибка: Parse error on line 2');
  });
});
