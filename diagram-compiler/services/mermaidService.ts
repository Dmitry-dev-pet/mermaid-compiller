import mermaid from 'mermaid';
import { DiagramType, MermaidState } from '../types';
import { applyInlineDirectionCommand } from '../utils/inlineDirectionCommand';
import { applyInlineThemeAndLookCommands } from '../utils/inlineLookCommand';

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

const MERMAID_BLOCK_PATTERN = /(```(?:mermaid|mermaid-example)[^\n]*\r?\n)([\s\S]*?)(```)/g;

const DIAGRAM_TYPE_PATTERNS: Array<{ pattern: RegExp; type: DiagramType }> = [
  { pattern: /^(flowchart|graph)\b/i, type: 'flowchart' },
  { pattern: /^sequenceDiagram\b/i, type: 'sequence' },
  { pattern: /^classDiagram\b/i, type: 'class' },
  { pattern: /^stateDiagram(?:-v2)?\b/i, type: 'state' },
  { pattern: /^erDiagram\b/i, type: 'er' },
  { pattern: /^gantt\b/i, type: 'gantt' },
  { pattern: /^pie\b/i, type: 'pie' },
  { pattern: /^mindmap(?:-beta)?\b/i, type: 'mindmap' },
  { pattern: /^journey\b/i, type: 'userJourney' },
  { pattern: /^gitGraph\b/i, type: 'gitGraph' },
  { pattern: /^quadrantChart\b/i, type: 'quadrantChart' },
  { pattern: /^requirementDiagram\b/i, type: 'requirementDiagram' },
  { pattern: /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/i, type: 'c4' },
  { pattern: /^timeline\b/i, type: 'timeline' },
  { pattern: /^sankey(?:-beta)?\b/i, type: 'sankey' },
  { pattern: /^xychart(?:-beta)?\b/i, type: 'xychart' },
  { pattern: /^zenuml\b/i, type: 'zenuml' },
  { pattern: /^block(?:-beta)?\b/i, type: 'block' },
  { pattern: /^architecture(?:-beta)?\b/i, type: 'architecture' },
  { pattern: /^packet\b/i, type: 'packet' },
  { pattern: /^kanban\b/i, type: 'kanban' },
  { pattern: /^radar\b/i, type: 'radar' },
  { pattern: /^treemap\b/i, type: 'treemap' },
];

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

export const extractMermaidBlocksFromMarkdown = (markdown: string): MermaidMarkdownBlock[] => {
  if (!markdown.trim()) return [];
  const blocks: MermaidMarkdownBlock[] = [];
  MERMAID_BLOCK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = MERMAID_BLOCK_PATTERN.exec(markdown)) !== null) {
    const raw = match[2] ?? '';
    const code = raw.trim();
    if (!code) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    blocks.push({
      index,
      code,
      start,
      end,
      opening: match[1],
      closing: match[3],
      diagramType: detectMermaidDiagramType(code),
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

export const initializeMermaid = (theme: 'default' | 'dark' = 'default') => {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: 'loose',
  });
};

export const validateMermaid = async (code: string): Promise<Partial<MermaidState>> => {
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
    const withDirection = applyInlineDirectionCommand(code).code;
    const withThemeAndLook = applyInlineThemeAndLookCommands(withDirection).code;
    await mermaid.parse(withThemeAndLook);
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  } catch (error: unknown) {
    console.error("Mermaid Validation Error:", error);
    
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
    const withDirection = applyInlineDirectionCommand(code).code;
    const withThemeAndLook = applyInlineThemeAndLookCommands(withDirection).code;
    await mermaid.parse(withThemeAndLook);
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
    };
  } catch (error: unknown) {
    console.error('Mermaid Validation Error:', error);

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
