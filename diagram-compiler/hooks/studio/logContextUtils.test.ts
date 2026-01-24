import { describe, expect, it } from 'vitest';
import { buildContextEventForLog, formatDocsDetailForLog, joinLogDetailLines, summarizeMessagesForLog } from './logContextUtils';
import type { Message } from '../../types';

describe('logContextUtils', () => {
  it('joins log detail lines and summarizes messages', () => {
    expect(joinLogDetailLines('one', null, 'two')).toBe('one\ntwo');
    const messages: Message[] = [
      { id: 'm1', role: 'user', content: 'Hello', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: 'Hi', timestamp: 2 },
    ];
    const summary = summarizeMessagesForLog(messages);
    expect(summary.count).toBe(2);
    expect(summary.chars).toBe(7);
    expect(summary.tokens).toBeGreaterThan(0);
  });

  it('formats docs detail with selection summary', () => {
    const docsContext = [
      '--- intro.md ---',
      'Hello world',
      '--- flowchart.md ---',
      'graph TD',
      '',
    ].join('\n');
    const detail = formatDocsDetailForLog({
      docsContext,
      selectionSummary: { includedPaths: ['intro.md'] },
      prefix: 'docs',
    });
    expect(detail).toContain('docs (1 file');
    expect(detail).toContain('intro.md');
  });

  it('builds context event with tooltips and metrics', () => {
    const docsContext = [
      '--- intro.md ---',
      'Hello world',
      '',
    ].join('\n');
    const messages: Message[] = [
      { id: 'diagram-intent', role: 'user', content: 'Make a chart', timestamp: 1 },
    ];
    const event = buildContextEventForLog({
      phase: 'build',
      contextScope: 'block',
      selectionLine: 'selection: FC',
      systemPrompt: 'Prompt',
      messages,
      docsContext,
    });

    expect(event.title).toBe('Контекст');
    expect(event.tooltipMessages).toContain('System prompt:');
    expect(event.tooltipDocs).toContain('Docs:');
    expect(event.metrics?.tokens).toBeGreaterThan(0);
  });
});
