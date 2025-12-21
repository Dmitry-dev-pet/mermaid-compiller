import { insertDirectiveAfterLeadingDirectives } from './mermaidDirectives';

export type MermaidThemeName = 'default' | 'dark' | 'forest' | 'neutral' | 'base';

type ExtractedThemeCommand = {
  codeWithoutCommand: string;
  theme: MermaidThemeName | null;
};

const THEME_COMMAND_RE = /^\s*%%\{\s*theme\s*:\s*([a-zA-Z]+)\s*\}%%\s*$/;

const normalizeThemeToken = (raw: string): MermaidThemeName | null => {
  const token = raw.trim().toLowerCase();
  if (token === 'default') return 'default';
  if (token === 'dark') return 'dark';
  if (token === 'forest') return 'forest';
  if (token === 'neutral') return 'neutral';
  if (token === 'base') return 'base';
  return null;
};

export const extractInlineThemeCommand = (code: string): ExtractedThemeCommand => {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];

  let foundTheme: MermaidThemeName | null = null;
  let index = 0;

  // Mermaid directives must be at the top; we only scan the leading directive region.
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      kept.push(line);
      index += 1;
      continue;
    }

    const match = trimmed.match(THEME_COMMAND_RE);
    if (match?.[1]) {
      const nextTheme = normalizeThemeToken(match[1]);
      if (nextTheme) foundTheme = nextTheme;
      index += 1;
      continue;
    }

    if (!trimmed.startsWith('%%{')) break;

    // Keep any other directive as-is (including multi-line init blocks).
    kept.push(line);
    while (index < lines.length && !(lines[index] ?? '').includes('}%%')) {
      index += 1;
      if (index < lines.length) kept.push(lines[index] ?? '');
    }
    index += 1;
  }

  return { codeWithoutCommand: [...kept, ...lines.slice(index)].join('\n'), theme: foundTheme };
};

export const setInlineThemeCommand = (code: string, theme: MermaidThemeName | null): string => {
  const extracted = extractInlineThemeCommand(code);
  if (!theme) return extracted.codeWithoutCommand;

  const lines = extracted.codeWithoutCommand.split(/\r?\n/);
  let insertAt = 0;
  while (insertAt < lines.length && (lines[insertAt]?.trim() ?? '') === '') insertAt += 1;
  return [...lines.slice(0, insertAt), `%%{theme: ${theme}}%%`, ...lines.slice(insertAt)].join('\n');
};

export const applyInlineThemeCommand = (
  code: string,
): { code: string; theme: MermaidThemeName | null } => {
  const extracted = extractInlineThemeCommand(code);
  if (!extracted.theme) return { code, theme: null };

  const initDirective = `%%{init: {"theme":"${extracted.theme}"}}%%`;
  return {
    code: insertDirectiveAfterLeadingDirectives(extracted.codeWithoutCommand, initDirective),
    theme: extracted.theme,
  };
};
