import mermaid from 'mermaid';
import { DiagramType, MermaidState } from '../types';
import { applyInlineDirectionCommand } from '../utils/inlineDirectionCommand';
import { applyInlineThemeAndLookCommands } from '../utils/inlineLookCommand';
import { MermaidThemeName, setInlineThemeCommand } from '../utils/inlineThemeCommand';
import { MermaidLook, setInlineLookCommand } from '../utils/inlineLookCommand';
import { MERMAID_BLOCK_PATTERN } from '../utils/markdownMermaid';
import { DIAGRAM_TYPE_PATTERNS } from '../utils/mermaidPatterns';

export const isMarkdownLike = (code: string): boolean => {
  if (!code.trim()) return false;
  if (code.includes('```')) return true;
  if (/^#{1,6}\s+/m.test(code)) return true;
  if (/^\s*[-*]\s+/m.test(code)) return true;
  if (/^\s*\d+\.\s+/m.test(code)) return true;
  return false;
};

export type MermaidMarkdownBlock = {
  index: number;
  code: string;
  start: number;
  end: number;
  opening: string;
  closing: string;
  diagramType?: DiagramType | null;
};


export const detectMermaidDiagramType = (code: string): DiagramType | null => {
  if (!code.trim()) return null;
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('%%')) continue;
    for (const entry of DIAGRAM_TYPE_PATTERNS) {
      if (entry.pattern.test(trimmed)) {
        return entry.type;
      }
    }
  }
  return null;
};

export const applyInlineMermaidDirectives = (code: string): string => {
  const withDirection = applyInlineDirectionCommand(code).code;
  return applyInlineThemeAndLookCommands(withDirection).code;
};

export const extractMermaidBlocksFromMarkdown = (markdown: string): MermaidMarkdownBlock[] => {
  if (!markdown.trim()) return [];
  const blocks: MermaidMarkdownBlock[] = [];
  MERMAID_BLOCK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = MERMAID_BLOCK_PATTERN.exec(markdown)) !== null) {
    const raw = match[2] ?? '';
    const code = raw.trim();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    blocks.push({
      index,
      code,
      start,
      end,
      opening: match[1],
      closing: match[3],
      diagramType: code ? detectMermaidDiagramType(code) : null,
    });
    index += 1;
  }
  return blocks;
};

export const replaceMermaidBlockInMarkdown = (
  markdown: string,
  block: MermaidMarkdownBlock,
  nextCode: string
): string => {
  if (!markdown) return markdown;
  const before = markdown.slice(0, block.start);
  const after = markdown.slice(block.end);
  const normalized = nextCode.replace(/\s+$/, '');
  const body = normalized ? `${normalized}\n` : '';
  const nextBlock = `${block.opening}${body}${block.closing}`;
  return `${before}${nextBlock}${after}`;
};

export const setThemeForMarkdownMermaidBlocks = (
  markdown: string,
  theme: MermaidThemeName | null
): string => {
  if (!markdown.trim()) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    const nextCode = setInlineThemeCommand(block.code, theme);
    nextMarkdown = replaceMermaidBlockInMarkdown(nextMarkdown, block, nextCode);
  }

  return nextMarkdown;
};

export const setLookForMarkdownMermaidBlocks = (
  markdown: string,
  look: MermaidLook | null
): string => {
  if (!markdown.trim()) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    const nextCode = setInlineLookCommand(block.code, look);
    nextMarkdown = replaceMermaidBlockInMarkdown(nextMarkdown, block, nextCode);
  }

  return nextMarkdown;
};

export const createMermaidNotebookMarkdown = (args?: { blocks?: number; title?: string }): string => {
  const blocks = Math.max(1, args?.blocks ?? 3);
  const title = args?.title ?? 'Diagram notebook';
  const sections: string[] = [];
  for (let i = 0; i < blocks; i += 1) {
    sections.push(`## Diagram ${i + 1}\n\n\`\`\`mermaid\n\`\`\``);
  }
  return `# ${title}\n\n${sections.join('\n\n')}\n`;
};

export const appendEmptyMermaidBlockToMarkdown = (markdown: string): string => {
  const trimmedEnd = markdown.replace(/\s+$/, '');
  const existingCount = extractMermaidBlocksFromMarkdown(markdown).length;
  const nextIndex = existingCount + 1;
  const prefix = trimmedEnd ? `${trimmedEnd}\n\n` : '';
  return `${prefix}## Diagram ${nextIndex}\n\n\`\`\`mermaid\n\`\`\`\n`;
};

export const initializeMermaid = (theme: 'default' | 'dark' = 'default') => {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: 'loose',
  });
};

export const validateMermaid = async (
  code: string,
  options: { logError?: boolean } = {}
): Promise<Partial<MermaidState>> => {
  if (!code.trim()) {
    return {
      isValid: true,
      status: 'empty',
      errorLine: undefined,
      errorMessage: undefined,
    };
  }

  if (isMarkdownLike(code)) {
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  }

  try {
    // parse throws an error if invalid
    const withThemeAndLook = applyInlineMermaidDirectives(code);
    await mermaid.parse(withThemeAndLook);
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  } catch (error: unknown) {
    if (options.logError !== false) {
      console.error('Mermaid Validation Error:', error);
    }
    
    let line = 1;
    // Cast to any to access custom properties from Mermaid parser error if standard Error doesn't suffice
    const errAny = error as any;
    const msg = errAny.message || errAny.str || "Unknown syntax error";
    const lineMatch = msg.match(/line\s+(\d+)/i);
    if (lineMatch && lineMatch[1]) {
      line = parseInt(lineMatch[1], 10);
    }

    return {
      isValid: false,
      status: 'invalid',
      errorMessage: msg,
      errorLine: line,
    };
  }
};

export const validateMermaidDiagramCode = async (
  code: string,
  options: { logError?: boolean } = {}
): Promise<Pick<MermaidState, 'isValid' | 'status' | 'errorLine' | 'errorMessage'>> => {
  if (!code.trim()) {
    return {
      isValid: true,
      status: 'empty',
      errorLine: undefined,
      errorMessage: undefined,
    };
  }

  try {
    const withThemeAndLook = applyInlineMermaidDirectives(code);
    await mermaid.parse(withThemeAndLook);
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
    };
  } catch (error: unknown) {
    if (options.logError !== false) {
      console.error('Mermaid Validation Error:', error);
    }

    let line = 1;
    const errAny = error as { message?: string; str?: string };
    const msg = errAny.message || errAny.str || 'Unknown syntax error';
    const lineMatch = msg.match(/line\s+(\d+)/i);
    if (lineMatch && lineMatch[1]) {
      line = parseInt(lineMatch[1], 10);
    }

    return {
      isValid: false,
      status: 'invalid',
      errorMessage: msg,
      errorLine: line,
    };
  }
};

/**
 * Extracts raw Mermaid code from a potential Markdown block returned by LLM.
 */
export const extractMermaidCode = (rawText: string): string => {
  const mermaidMatch = rawText.match(/```mermaid\n([\s\S]*?)```/);
  if (mermaidMatch && mermaidMatch[1]) return mermaidMatch[1].trim();

  const codeMatch = rawText.match(/```\n([\s\S]*?)```/);
  if (codeMatch && codeMatch[1]) return codeMatch[1].trim();

  const keywords = [
    'graph',
    'flowchart',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'gantt',
    'pie',
    'mindmap',
    'C4Context',
    'C4Container',
    'C4Component',
    'C4Dynamic',
    'C4Deployment',
  ];
  const firstWord = rawText.trim().split(/\s+/)[0];
  
  if (keywords.some(k => rawText.trim().startsWith(k)) || keywords.includes(firstWord)) {
    return rawText.trim();
  }

  return "";
};
