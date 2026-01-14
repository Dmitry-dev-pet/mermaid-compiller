import { describe, expect, it } from 'vitest';
import { extractFrontmatterThemeVariables } from './mermaidFrontmatterThemeVariables';
import { extractMermaidThemePreset, setMermaidThemePreset } from './mermaidThemePreset';

describe('mermaidThemePreset', () => {
  it('sets darkPlus preset as base + themeVariables', () => {
    const code = `flowchart TD\nA-->B`;
    const next = setMermaidThemePreset(code, 'darkPlus');
    expect(next).toContain('theme: base');
    expect(next).toContain('themeVariables:');
    expect(next).toContain("background: '#252526'");
    expect(next).toContain('darkMode: true');
  });

  it('replaces themeVariables when switching presets', () => {
    const code = `flowchart TD\nA-->B`;
    const darkPlus = setMermaidThemePreset(code, 'darkPlus');
    const lightPlus = setMermaidThemePreset(darkPlus, 'lightPlus');
    expect(lightPlus).toContain("background: '#f3f3f3'");
    expect(lightPlus).not.toContain("background: '#252526'");
    expect(lightPlus.match(/^\s*themeVariables\s*:/gm)?.length ?? 0).toBe(1);
  });

  it('extracts lightPlus/darkPlus from frontmatter', () => {
    const code = `---\nconfig:\n  theme: base\n  themeVariables:\n    darkMode: true\n    background: '#252526'\n    primaryColor: '#1e1e1e'\n    primaryTextColor: '#d4d4d4'\n    lineColor: '#9da5b4'\n    tertiaryColor: '#1e1e1e'\n    noteBkgColor: '#1e1e1e'\n    noteTextColor: '#d4d4d4'\n---\nflowchart TD\nA-->B`;
    const vars = extractFrontmatterThemeVariables(code);
    expect(vars).not.toBeNull();
    expect(extractMermaidThemePreset(code, { themeVariables: vars })).toBe('darkPlus');

    const baseOnly = `---\nconfig:\n  theme: base\n---\nflowchart TD\nA-->B`;
    expect(extractMermaidThemePreset(baseOnly, { themeVariables: extractFrontmatterThemeVariables(baseOnly) })).toBe('lightPlus');
  });

  it('clears theme and themeVariables when set to null', () => {
    const code = setMermaidThemePreset(`flowchart TD\nA-->B`, 'lightPlus');
    const cleared = setMermaidThemePreset(code, null);
    expect(cleared).toBe(`flowchart TD\nA-->B`);
  });
});
