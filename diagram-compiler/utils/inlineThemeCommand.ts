import { extractFrontmatterConfigValue, removeFrontmatterConfigKey, updateFrontmatterConfigKey } from './mermaidFrontmatter';

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

const stripThemeDirective = (code: string): ExtractedThemeCommand => {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];

  let foundTheme: MermaidThemeName | null = null;
  let index = 0;
  let consumedFrontmatter = false;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      kept.push(line);
      index += 1;
      continue;
    }

    if (!consumedFrontmatter && trimmed === '---') {
      kept.push(line);
      index += 1;
      while (index < lines.length) {
        kept.push(lines[index] ?? '');
        if ((lines[index]?.trim() ?? '') === '---') {
          index += 1;
          break;
        }
        index += 1;
      }
      consumedFrontmatter = true;
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

    kept.push(line);
    while (index < lines.length && !(lines[index] ?? '').includes('}%%')) {
      index += 1;
      if (index < lines.length) kept.push(lines[index] ?? '');
    }
    index += 1;
  }

  return { codeWithoutCommand: [...kept, ...lines.slice(index)].join('\n'), theme: foundTheme };
};

export const extractInlineThemeCommand = (code: string): ExtractedThemeCommand => {
  const frontmatterTheme = normalizeThemeToken(extractFrontmatterConfigValue(code, 'theme') ?? '');
  const withoutFrontmatter = removeFrontmatterConfigKey(code, 'theme');
  const directiveExtracted = stripThemeDirective(withoutFrontmatter.code);

  return {
    codeWithoutCommand: directiveExtracted.codeWithoutCommand,
    theme: frontmatterTheme ?? directiveExtracted.theme,
  };
};

export const setInlineThemeCommand = (code: string, theme: MermaidThemeName | null): string => {
  const extracted = extractInlineThemeCommand(code);
  if (!theme) return extracted.codeWithoutCommand;

  return updateFrontmatterConfigKey(extracted.codeWithoutCommand, 'theme', theme).code;
};

export const applyInlineThemeCommand = (
  code: string,
): { code: string; theme: MermaidThemeName | null } => {
  const extracted = extractInlineThemeCommand(code);
  if (!extracted.theme) return { code, theme: null };

  return {
    code: setInlineThemeCommand(extracted.codeWithoutCommand, extracted.theme),
    theme: extracted.theme,
  };
};
