import { describe, expect, it } from 'vitest';
import {
  appendEmptyMermaidBlockToMarkdown,
  createMermaidNotebookMarkdown,
  detectMermaidDiagramType,
  extractMermaidBlocksFromMarkdown,
  isMarkdownLike,
  replaceMermaidBlockInMarkdown,
  setFlowchartArrowStyleForMarkdownMermaidBlocks,
  setFlowchartCurveForMarkdownMermaidBlocks,
  setLookForMarkdownMermaidBlocks,
  setThemeForMarkdownMermaidBlocks,
} from '../mermaidService';

describe('mermaid markdown helpers', () => {
  it('detects markdown-like content', () => {
    expect(isMarkdownLike('# Title\n\ncontent')).toBe(true);
    expect(isMarkdownLike('- item')).toBe(true);
    expect(isMarkdownLike('plain text')).toBe(false);
  });

  it('detects diagram types in mermaid blocks', () => {
    expect(detectMermaidDiagramType('flowchart TD\nA-->B')).toBe('flowchart');
    expect(detectMermaidDiagramType('sequenceDiagram\nA->>B: Hi')).toBe('sequence');
  });

  it('extracts and replaces mermaid blocks', () => {
    const markdown = [
      'Intro',
      '```mermaid',
      'flowchart TD',
      'A-->B',
      '```',
      'Text',
      '```mermaid',
      'sequenceDiagram',
      'A->>B: Hi',
      '```',
      '',
    ].join('\n');
    const blocks = extractMermaidBlocksFromMarkdown(markdown);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.diagramType).toBe('flowchart');
    expect(blocks[1]?.diagramType).toBe('sequence');

    const nextMarkdown = replaceMermaidBlockInMarkdown(markdown, blocks[0], 'flowchart LR\nA-->B');
    expect(nextMarkdown).toContain('flowchart LR');
    expect(nextMarkdown).toContain('sequenceDiagram');
  });

  it('creates and appends notebook markdown', () => {
    const notebook = createMermaidNotebookMarkdown({ blocks: 2, title: 'Notes' });
    expect(notebook).toContain('# Notes');
    expect(notebook).toContain('## Diagram 1');
    expect(notebook).toContain('## Diagram 2');

    const appended = appendEmptyMermaidBlockToMarkdown(notebook);
    expect(appended).toContain('## Diagram 3');
  });

  it('applies theme/look and flowchart tweaks for mermaid blocks', () => {
    const markdown = [
      '```mermaid',
      'flowchart TD',
      'A-->B',
      '```',
      '```mermaid',
      'sequenceDiagram',
      'A->>B: Hi',
      '```',
      '',
    ].join('\n');

    const themed = setThemeForMarkdownMermaidBlocks(markdown, 'dark');
    const looked = setLookForMarkdownMermaidBlocks(themed, 'handDrawn');
    expect(looked).toContain('theme: dark');
    expect(looked).toContain('look: handDrawn');

    const styled = setFlowchartArrowStyleForMarkdownMermaidBlocks(looked, 'thick');
    expect(styled).toContain('A==>B');
    expect(styled).toContain('sequenceDiagram');

    const curved = setFlowchartCurveForMarkdownMermaidBlocks(styled, 'basis');
    expect(curved).toContain('curve: basis');
  });
});
