import { describe, expect, it } from 'vitest';
import { formatMermaidErrorLine, sanitizeMermaidByType } from './mermaidSanitizer';

describe('mermaidSanitizer', () => {
  it('replaces parentheses in flowchart labels', () => {
    const input = [
      'flowchart TD',
      'A[Alpha (one) "note"] -->|Edge (two) "label"| B{Beta (three)}',
    ].join('\n');
    const result = sanitizeMermaidByType('flowchart', input);
    expect(result).toContain("A[Alpha  —  one 'note']");
    expect(result).toContain("|Edge  —  two 'label'|");
    expect(result).toContain('B{Beta  —  three}');
  });

  it('keeps other diagram types intact', () => {
    const input = 'sequenceDiagram\nA->>B: (ping)';
    const result = sanitizeMermaidByType('sequence', input);
    expect(result).toBe(input);
  });

  it('formats error lines to a single line', () => {
    const input = 'Parse error on line 2:\n... TD A[Bad (label)]';
    const result = formatMermaidErrorLine(input);
    expect(result).toBe('Parse error on line 2: ... TD A[Bad (label)]');
  });
});
