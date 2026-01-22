import { describe, expect, it } from 'vitest';
import { formatSelectionNote } from './intentSelectionNote';

describe('formatSelectionNote', () => {
  it('picks matching diagram from intent list', () => {
    const intent = [
      '## Diagrams',
      '1. Billing Flow — flowchart',
      '2. Sync Path — sequence',
    ].join('\n');
    const note = formatSelectionNote(intent, 'flowchart', 'chat');
    expect(note).toContain('Billing Flow — flowchart');
    expect(note).toContain('источник: чат');
  });

  it('summarizes options and questions when no diagram list', () => {
    const intent = [
      '1. **Option A**',
      '2. Option B',
      '## Open questions',
      '1. Should we add retries?',
      '- Should we log errors?',
    ].join('\n');
    const note = formatSelectionNote(intent, 'sequence', 'build');
    expect(note).toContain('Выбрано из предложений (2)');
    expect(note).toContain('Вопросы из чата (2)');
    expect(note).toContain('источник: build');
  });

  it('falls back to title when present', () => {
    const intent = [
      '## Title',
      'Payment Status',
    ].join('\n');
    const note = formatSelectionNote(intent, 'flowchart', 'fallback');
    expect(note).toContain('Payment Status');
    expect(note).toContain('flowchart');
    expect(note).toContain('источник: fallback');
  });
});
