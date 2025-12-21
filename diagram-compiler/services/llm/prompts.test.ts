import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './prompts';

describe('buildSystemPrompt', () => {
  it('builds generate prompt with type rule, language, and full docs', () => {
    const docs = 'a'.repeat(2100);
    const prompt = buildSystemPrompt('generate', {
      diagramType: 'sequence',
      docsContext: docs,
      language: 'English',
    });

    expect(prompt).toContain('You MUST generate a sequence diagram.');
    expect(prompt).toContain('IMPORTANT: Respond in English.');
    expect(prompt).toContain(docs);
  });

  it('builds chat prompt with preferred type and language instruction', () => {
    const prompt = buildSystemPrompt('chat', {
      diagramType: 'er',
      docsContext: 'docs',
      language: 'Russian',
    });

    expect(prompt).toContain('Предпочитаемый тип диаграммы: er.');
    expect(prompt).toContain('ВАЖНО: отвечай на русском.');
  });

  it('does not add language instruction when language is auto', () => {
    const prompt = buildSystemPrompt('analyze', {
      docsContext: 'docs',
      language: 'auto',
    });

    expect(prompt).not.toContain('IMPORTANT: Respond in');
    expect(prompt).not.toContain('ВАЖНО: отвечай');
  });

  it('does not add diagram type rules for fix prompt', () => {
    const prompt = buildSystemPrompt('fix', {
      diagramType: 'flowchart',
      docsContext: 'docs',
      language: 'English',
    });

    expect(prompt).not.toContain('Preferred Diagram Type');
    expect(prompt).not.toContain('You MUST generate');
  });
});
