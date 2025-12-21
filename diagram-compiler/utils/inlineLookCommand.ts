import { insertDirectiveAfterLeadingDirectives } from './mermaidDirectives';
import { extractInlineThemeCommand } from './inlineThemeCommand';

export type MermaidLook = 'handDrawn' | 'classic';

type ExtractedLookCommand = {
  codeWithoutCommand: string;
  look: MermaidLook | null;
};

const LOOK_COMMAND_RE = /^\s*%%\{\s*look\s*:\s*([a-zA-Z]+)\s*\}%%\s*$/;

const normalizeLookToken = (raw: string): MermaidLook | null => {
  const token = raw.trim();
  if (token === 'handDrawn') return 'handDrawn';
  if (token === 'classic') return 'classic';
  return null;
};

export const extractInlineLookCommand = (code: string): ExtractedLookCommand => {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];

  let foundLook: MermaidLook | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      kept.push(line);
      index += 1;
      continue;
    }

    const match = trimmed.match(LOOK_COMMAND_RE);
    if (match?.[1]) {
      const nextLook = normalizeLookToken(match[1]);
      if (nextLook) foundLook = nextLook;
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

  return { codeWithoutCommand: [...kept, ...lines.slice(index)].join('\n'), look: foundLook };
};

export const setInlineLookCommand = (code: string, look: MermaidLook | null): string => {
  const extracted = extractInlineLookCommand(code);
  if (!look) return extracted.codeWithoutCommand;

  const lines = extracted.codeWithoutCommand.split(/\r?\n/);
  let insertAt = 0;
  while (insertAt < lines.length && (lines[insertAt]?.trim() ?? '') === '') insertAt += 1;
  return [...lines.slice(0, insertAt), `%%{look: ${look}}%%`, ...lines.slice(insertAt)].join('\n');
};

export const applyInlineThemeAndLookCommands = (
  code: string,
): { code: string; theme: string | null; look: MermaidLook | null } => {
  const themeExtracted = extractInlineThemeCommand(code);
  const lookExtracted = extractInlineLookCommand(themeExtracted.codeWithoutCommand);

  const theme = themeExtracted.theme;
  const look = lookExtracted.look;

  if (!theme && !look) return { code, theme: null, look: null };

  const init: Record<string, unknown> = {};
  if (theme) init.theme = theme;
  if (look) init.look = look;

  const initDirective = `%%{init: ${JSON.stringify(init)}}%%`;
  return {
    code: insertDirectiveAfterLeadingDirectives(lookExtracted.codeWithoutCommand, initDirective),
    theme,
    look,
  };
};

