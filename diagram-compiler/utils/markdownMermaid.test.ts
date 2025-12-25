import { describe, expect, it } from 'vitest';
import { transformMarkdownMermaid } from './markdownMermaid';

describe('transformMarkdownMermaid', () => {
  it('extracts mermaid bodies for supported fences', () => {
    const input = [
      'Intro',
      '```mermaid',
      'A-->B',
      '```',
      '```mermaid-example',
      'sequenceDiagram',
      'Alice->>Bob: Hi',
      '```',
      '```mermaid-exa4mple',
      'graph TD',
      'X-->Y',
      '```',
      'Outro',
    ].join('\n');
    const mermaidSegments: string[] = [];
    const markdownSegments: string[] = [];

    transformMarkdownMermaid(input, {
      markdown: (segment) => {
        markdownSegments.push(segment);
        return '';
      },
      mermaid: (segment) => {
        mermaidSegments.push(segment);
        return '';
      },
    });

    expect(mermaidSegments).toEqual(['A-->B', 'sequenceDiagram\nAlice->>Bob: Hi', 'graph TD\nX-->Y']);
    expect(markdownSegments.join('')).toContain('```mermaid');
    expect(markdownSegments.join('')).toContain('```mermaid-example');
    expect(markdownSegments.join('')).toContain('```mermaid-exa4mple');
  });

  it('passes through when no mermaid fences present', () => {
    const input = '# Title\n\nSome text\n';
    const mermaidSegments: string[] = [];
    const markdownSegments: string[] = [];

    transformMarkdownMermaid(input, {
      markdown: (segment) => {
        markdownSegments.push(segment);
        return '';
      },
      mermaid: (segment) => {
        mermaidSegments.push(segment);
        return '';
      },
    });

    expect(mermaidSegments).toEqual([]);
    expect(markdownSegments.join('')).toBe(input);
  });
});
