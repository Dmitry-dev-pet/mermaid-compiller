import { describe, expect, it } from 'vitest';
import { applyInlineThemeCommand, extractInlineThemeCommand, setInlineThemeCommand } from './inlineThemeCommand';

describe('inlineThemeCommand', () => {
  it('extracts theme command from leading directives region', () => {
    const code = `%%{theme: forest}%%\nflowchart TD\nA-->B`;
    expect(extractInlineThemeCommand(code)).toEqual({
      codeWithoutCommand: `flowchart TD\nA-->B`,
      theme: 'forest',
    });
  });

  it('keeps other directives and removes only theme command', () => {
    const code = `%%{init: {"theme":"default"}}%%\n%%{theme: dark}%%\nflowchart TD\nA-->B`;
    expect(extractInlineThemeCommand(code)).toEqual({
      codeWithoutCommand: `%%{init: {"theme":"default"}}%%\nflowchart TD\nA-->B`,
      theme: 'dark',
    });
  });

  it('setInlineThemeCommand inserts after leading blank lines and replaces existing theme', () => {
    const code = `\n\n%%{theme: forest}%%\nflowchart TD\nA-->B`;
    const next = setInlineThemeCommand(code, 'neutral');
    expect(next).toBe(`\n\n%%{theme: neutral}%%\nflowchart TD\nA-->B`);
  });

  it('setInlineThemeCommand removes theme when null', () => {
    const code = `%%{theme: dark}%%\nflowchart TD\nA-->B`;
    expect(setInlineThemeCommand(code, null)).toBe(`flowchart TD\nA-->B`);
  });

  it('applyInlineThemeCommand injects init theme directive and strips theme command', () => {
    const code = `%%{theme: forest}%%\nflowchart TD\nA-->B`;
    const applied = applyInlineThemeCommand(code);
    expect(applied.theme).toBe('forest');
    expect(applied.code).toContain(`%%{init: {"theme":"forest"}}%%`);
    expect(applied.code).not.toContain('%%{theme: forest}%%');
  });
});

