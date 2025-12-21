import { describe, expect, it } from 'vitest';
import { applyInlineThemeAndLookCommands, extractInlineLookCommand, setInlineLookCommand } from './inlineLookCommand';

describe('inlineLookCommand', () => {
  it('extracts look command from leading directives region', () => {
    const code = `%%{look: handDrawn}%%\nflowchart LR\nA-->B`;
    expect(extractInlineLookCommand(code)).toEqual({
      codeWithoutCommand: `flowchart LR\nA-->B`,
      look: 'handDrawn',
    });
  });

  it('setInlineLookCommand replaces existing look command', () => {
    const code = `%%{look: classic}%%\nflowchart LR\nA-->B`;
    expect(setInlineLookCommand(code, 'handDrawn')).toBe(`%%{look: handDrawn}%%\nflowchart LR\nA-->B`);
  });

  it('applyInlineThemeAndLookCommands injects init with both when present', () => {
    const code = `%%{theme: forest}%%\n%%{look: classic}%%\nflowchart LR\nA-->B`;
    const applied = applyInlineThemeAndLookCommands(code);
    expect(applied.code).toContain(`%%{init: {"theme":"forest","look":"classic"}}%%`);
    expect(applied.code).not.toContain('%%{theme: forest}%%');
    expect(applied.code).not.toContain('%%{look: classic}%%');
  });
});

