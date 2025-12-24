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

  it('extracts direction from flowchart header', () => {
    const code = `flowchart LR\nA-->B`;
    expect(extractInlineDirectionCommand(code)).toEqual({
      codeWithoutCommand: `flowchart LR\nA-->B`,
      direction: 'LR',
    });
  });

  it('extracts direction from direction statement after header', () => {
    const code = `classDiagram\n  direction RL\n  class A`;
    expect(extractInlineDirectionCommand(code)).toEqual({
      codeWithoutCommand: `classDiagram\n  direction RL\n  class A`,
      direction: 'RL',
    });
  });

  it('setInlineDirectionCommand inserts direction statement for supported diagrams', () => {
    const code = `classDiagram\n  A <|-- B`;
    expect(setInlineDirectionCommand(code, 'RL')).toBe(`classDiagram\n  direction RL\n  A <|-- B`);
  });

  it('setInlineDirectionCommand replaces existing direction statement', () => {
    const code = `classDiagram\n  direction TB\n  class A`;
    expect(setInlineDirectionCommand(code, 'RL')).toBe(`classDiagram\n  direction RL\n  class A`);
  });

  it('setInlineDirectionCommand updates flowchart header direction', () => {
    const code = `flowchart TD\nA-->B`;
    expect(setInlineDirectionCommand(code, 'LR')).toBe(`flowchart LR\nA-->B`);
  });

  it('setInlineDirectionCommand clears flowchart header direction when reset', () => {
    const code = `flowchart LR\nA-->B`;
    expect(setInlineDirectionCommand(code, null)).toBe(`flowchart\nA-->B`);
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

  it('applyInlineDirectionCommand works when frontmatter config exists', () => {
    const code = `---\nconfig:\n  theme: dark\n---\n%%{direction: RL}%%\nflowchart LR\nA-->B`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`---\nconfig:\n  theme: dark\n---\nflowchart RL\nA-->B`);
  });

  it('applyInlineDirectionCommand skips YAML frontmatter', () => {
    const code = `%%{direction: TB}%%\n---\ntitle: Node\n---\nflowchart LR\nA-->B`;
    const applied = applyInlineDirectionCommand(code);
    expect(applied.code).toBe(`---\ntitle: Node\n---\nflowchart TB\nA-->B`);
  });
});
