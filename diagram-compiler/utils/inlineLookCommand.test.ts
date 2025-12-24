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

  it('extracts look from frontmatter config', () => {
    const code = `---\nconfig:\n  look: handDrawn\n---\nflowchart LR\nA-->B`;
    expect(extractInlineLookCommand(code)).toEqual({
      codeWithoutCommand: `flowchart LR\nA-->B`,
      look: 'handDrawn',
    });
  });

  it('setInlineLookCommand replaces existing look command', () => {
    const code = `%%{look: classic}%%\nflowchart LR\nA-->B`;
    expect(setInlineLookCommand(code, 'handDrawn')).toBe(
      `---\nconfig:\n  look: handDrawn\n---\nflowchart LR\nA-->B`
    );
  });

  it('applyInlineThemeAndLookCommands promotes both to frontmatter when present', () => {
    const code = `%%{theme: forest}%%\n%%{look: classic}%%\nflowchart LR\nA-->B`;
    const applied = applyInlineThemeAndLookCommands(code);
    expect(applied.code).toContain(`---\nconfig:\n  theme: forest\n  look: classic\n---`);
    expect(applied.code).not.toContain('%%{theme: forest}%%');
    expect(applied.code).not.toContain('%%{look: classic}%%');
  });
});
