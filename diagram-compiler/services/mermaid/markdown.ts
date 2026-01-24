import { DiagramType } from '../../types';
import { setInlineThemeCommand, type MermaidThemeName } from '../../utils/inlineThemeCommand';
import { setInlineLookCommand, type MermaidLook } from '../../utils/inlineLookCommand';
import { MERMAID_BLOCK_PATTERN } from '../../utils/markdownMermaid';
import { DIAGRAM_TYPE_PATTERNS } from '../../utils/mermaidPatterns';
import { MermaidThemePresetId, setMermaidThemePreset } from '../../utils/mermaidThemePreset';
import {
  FlowchartArrowStyle,
  FlowchartEdgeStyleUpdate,
  setFlowchartArrowStyle,
  setFlowchartEdgeStyle,
} from '../../utils/flowchartArrowStyle';
import { FlowchartLinkStylePresetId, setFlowchartLinkStylePreset } from '../../utils/flowchartLinkStyle';
import { FlowchartCurve, setFlowchartCurve } from '../../utils/flowchartCurveConfig';

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

export const setThemePresetForMarkdownMermaidBlocks = (
  markdown: string,
  presetId: MermaidThemePresetId | null
): string => {
  if (!markdown.trim()) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    const nextCode = setMermaidThemePreset(block.code, presetId);
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

export const setFlowchartArrowStyleForMarkdownMermaidBlocks = (
  markdown: string,
  style: FlowchartArrowStyle | null
): string => {
  if (!markdown.trim()) return markdown;
  if (!style) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.diagramType !== 'flowchart') continue;
    const nextCode = setFlowchartArrowStyle(block.code, style);
    nextMarkdown = replaceMermaidBlockInMarkdown(nextMarkdown, block, nextCode);
  }

  return nextMarkdown;
};

export const setFlowchartEdgeStyleForMarkdownMermaidBlocks = (
  markdown: string,
  update: FlowchartEdgeStyleUpdate
): string => {
  if (!markdown.trim()) return markdown;
  if (!Object.keys(update).length) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.diagramType !== 'flowchart') continue;
    const nextCode = setFlowchartEdgeStyle(block.code, update);
    nextMarkdown = replaceMermaidBlockInMarkdown(nextMarkdown, block, nextCode);
  }

  return nextMarkdown;
};

export const setFlowchartLinkStylePresetForMarkdownMermaidBlocks = (
  markdown: string,
  presetId: FlowchartLinkStylePresetId
): string => {
  if (!markdown.trim()) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.diagramType !== 'flowchart') continue;
    const nextCode = setFlowchartLinkStylePreset(block.code, presetId);
    nextMarkdown = replaceMermaidBlockInMarkdown(nextMarkdown, block, nextCode);
  }

  return nextMarkdown;
};

export const setFlowchartCurveForMarkdownMermaidBlocks = (
  markdown: string,
  curve: FlowchartCurve | null
): string => {
  if (!markdown.trim()) return markdown;
  const blocks = extractMermaidBlocksFromMarkdown(markdown);
  if (blocks.length === 0) return markdown;

  let nextMarkdown = markdown;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const block = blocks[i];
    if (block.diagramType !== 'flowchart') continue;
    const nextCode = setFlowchartCurve(block.code, curve);
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
