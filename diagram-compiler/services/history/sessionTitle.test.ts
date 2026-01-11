import { describe, expect, it } from 'vitest';
import type { Message } from '../../types';
import { deriveAutoSessionTitle, formatDefaultSessionTitle, isDefaultSessionTitle } from './sessionTitle';

describe('sessionTitle', () => {
  it('formats default title', () => {
    expect(formatDefaultSessionTitle(0)).toBe('Project 1970-01-01 00:00:00');
  });

  it('detects default session title', () => {
    expect(isDefaultSessionTitle({ createdAt: 0, title: 'Project 1970-01-01 00:00:00' })).toBe(true);
    expect(isDefaultSessionTitle({ createdAt: 0, title: 'My title' })).toBe(false);
  });

  it('uses first meaningful user message as title', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'швейк', timestamp: Date.now() },
      { id: 'a1', role: 'assistant', content: '...', timestamp: Date.now() },
    ];
    expect(deriveAutoSessionTitle(messages)).toBe('швейк');
  });

  it('falls back to extracting a diagram title from assistant reply', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: '1', timestamp: Date.now() },
      {
        id: 'a1',
        role: 'assistant',
        content: [
          'Предложено 3 диаграммы.',
          '- Маршрут Швейка — flowchart: ...',
          '- Персонажи — er: ...',
        ].join('\n'),
        timestamp: Date.now(),
      },
    ];
    expect(deriveAutoSessionTitle(messages)).toBe('Маршрут Швейка');
  });
});

