import { describe, expect, it } from 'vitest';
import { formatMermaidErrorLine, sanitizeMermaidByType } from './mermaidSanitizer';

describe('mermaidSanitizer', () => {
  it('replaces parentheses in flowchart labels', () => {
    const input = [
      'flowchart TD',
      'A[Alpha (one) "note"] -->|Edge (two) "label"| B{Beta (three)}',
    ].join('\n');
    const result = sanitizeMermaidByType('flowchart', input);
    expect(result).toContain("A[Alpha — one 'note']");
    expect(result).toContain("|Edge — two 'label'|");
    expect(result).toContain('B{Beta — three}');
  });

  it('keeps other diagram types intact', () => {
    const input = 'sequenceDiagram\nA->>B: (ping)';
    const result = sanitizeMermaidByType('sequence', input);
    expect(result).toBe(input);
  });

  it('normalizes single-dash arrows in flowcharts', () => {
    const input = [
      'flowchart TD',
      'A->B',
      'B<-C',
      'D-->E',
      'F<--G',
      'A->>B',
      'H-.->I',
    ].join('\n');
    const result = sanitizeMermaidByType('flowchart', input);
    expect(result).toContain('A-->B');
    expect(result).toContain('B<--C');
    expect(result).toContain('D-->E');
    expect(result).toContain('F<--G');
    expect(result).toContain('A->>B');
    expect(result).toContain('H-.->I');
  });

  it('normalizes single-dash arrows in state diagrams', () => {
    const input = ['stateDiagram-v2', 'A->B', 'B<-A', 'A-->C'].join('\n');
    const result = sanitizeMermaidByType('state', input);
    expect(result).toContain('A-->B');
    expect(result).toContain('B<--A');
    expect(result).toContain('A-->C');
  });

  it('sanitizes by detected type when diagramType=auto', () => {
    const input = ['flowchart TD', 'A->B'].join('\n');
    const result = sanitizeMermaidByType('auto', input);
    expect(result).toContain('A-->B');
  });

  it('decodes HTML-escaped <br/> inside labels', () => {
    const input = [
      "flowchart TD",
      "subgraph PipelineStages['Pipeline&lt;br/&gt;Stages']",
      "A['Unit&lt;br/&gt;Test'] --> B['Integration&lt;br&gt;Test']",
      "end",
    ].join('\n');
    const result = sanitizeMermaidByType('flowchart', input);
    expect(result).toContain("Pipeline<br/>Stages");
    expect(result).toContain("Unit<br/>Test");
    expect(result).toContain("Integration<br/>Test");
  });

  it('sanitizes ER attribute values wrapped in quotes', () => {
    const input = [
      'erDiagram',
      '  PERSON {',
      '    string "Имя: Швейк"',
      '    string "Состояние: Пьяный гений"',
      '  }',
    ].join('\n');
    const result = sanitizeMermaidByType('er', input);
    expect(result).toContain('string Имя_Швейк');
    expect(result).toContain('string Состояние_Пьяный_гений');
  });

  it('formats error lines to a single line', () => {
    const input = 'Parse error on line 2:\n... TD A[Bad (label)]';
    const result = formatMermaidErrorLine(input);
    expect(result).toBe('Parse error on line 2: ... TD A[Bad (label)]');
  });
});
