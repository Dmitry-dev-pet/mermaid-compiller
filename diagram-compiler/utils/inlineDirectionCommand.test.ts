import { describe, expect, it } from 'vitest';
import { applyInlineDirectionCommand, extractInlineDirectionCommand, setInlineDirectionCommand } from './inlineDirectionCommand';

describe('inlineDirectionCommand', () => {
  it('extracts direction command from leading directives region', () => {
    const code = `%%{direction: LR}%%\nclassDiagram\n  A <|-- B`;
    expect(extractInlineDirectionCommand(code)).toEqual({
      codeWithoutCommand: `classDiagram\n  A <|-- B`,
      direction: 'LR',
    });
  });

  it('setInlineDirectionCommand replaces existing direction command', () => {
    const code = `%%{direction: TB}%%\nclassDiagram\n  A <|-- B`;
    expect(setInlineDirectionCommand(code, 'RL')).toBe(`%%{direction: RL}%%\nclassDiagram\n  A <|-- B`);
  });

  it('applyInlineDirectionCommand inserts direction after header', () => {
    const code = `%%{direction: RL}%%\nclassDiagram\n  class A`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.direction).toBe('RL');
    expect(applied.code).toBe(`classDiagram\n  direction RL\n  class A`);
  });

  it('applyInlineDirectionCommand replaces existing direction line after header', () => {
    const code = `%%{direction: LR}%%\nstateDiagram\n    direction TB\n    [*] --> A`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`stateDiagram\n  direction LR\n    [*] --> A`);
  });

  it('applyInlineDirectionCommand does not inject for unsupported diagram types', () => {
    const code = `%%{direction: LR}%%\nflowchart TD\nA-->B`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`flowchart LR\nA-->B`);
    expect(applied.direction).toBe('LR');
  });

  it('applyInlineDirectionCommand works when other inline commands exist (e.g. theme)', () => {
    const code = `%%{theme: dark}%%\n%%{direction: RL}%%\nflowchart LR\nA-->B`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`%%{theme: dark}%%\nflowchart RL\nA-->B`);
  });

  it('applyInlineDirectionCommand skips YAML frontmatter', () => {
    const code = `%%{direction: TB}%%\n---\ntitle: Node\n---\nflowchart LR\nA-->B`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`---\ntitle: Node\n---\nflowchart TB\nA-->B`);
  });
});
