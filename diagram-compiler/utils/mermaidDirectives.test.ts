import { describe, expect, it } from 'vitest';
import { insertDirectiveAfterLeadingDirectives } from './mermaidDirectives';

describe('mermaidDirectives', () => {
  it('inserts after leading whitespace when no directives', () => {
    const input = '\n\nflowchart TD\nA-->B';
    const output = insertDirectiveAfterLeadingDirectives(input, '%%{init: {"theme":"default"}}%%');
    expect(output).toBe('\n\n%%{init: {"theme":"default"}}%%\nflowchart TD\nA-->B');
  });

  it('inserts after a single leading directive', () => {
    const input = '%%{init: {"theme":"dark"}}%%\nflowchart TD\nA-->B';
    const output = insertDirectiveAfterLeadingDirectives(input, '%%{init: {"securityLevel":"loose"}}%%');
    expect(output).toBe('%%{init: {"theme":"dark"}}%%\n%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA-->B');
  });

  it('inserts after a multi-line leading directive block', () => {
    const input = `%%{init: {\n  "theme":"dark"\n}}%%\nsequenceDiagram\nA->>B: hi`;
    const output = insertDirectiveAfterLeadingDirectives(input, '%%{init: {"htmlLabels":false}}%%');
    expect(output).toBe(`%%{init: {\n  "theme":"dark"\n}}%%\n%%{init: {"htmlLabels":false}}%%\nsequenceDiagram\nA->>B: hi`);
  });

  it('inserts after YAML frontmatter', () => {
    const input = `---\ntitle: Node\n---\nflowchart TD\nA-->B`;
    const output = insertDirectiveAfterLeadingDirectives(input, '%%{init: {"theme":"forest"}}%%');
    expect(output).toBe(`---\ntitle: Node\n---\n%%{init: {"theme":"forest"}}%%\nflowchart TD\nA-->B`);
  });
});
