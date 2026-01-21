import { useMemo } from 'react';
import { EditorTab, MermaidState } from '../../types';
import { MermaidMarkdownBlock } from '../../services/mermaidService';

type MarkdownMermaidStateArgs = {
  blocks: MermaidMarkdownBlock[];
  diagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  activeIndex: number;
  activeTab: EditorTab;
  hoveredIndex?: number | null;
};

export const useMarkdownMermaidBlockState = ({
  blocks,
  diagnostics,
  activeIndex,
  activeTab,
  hoveredIndex = null,
}: MarkdownMermaidStateArgs) => {
  const isMarkdownMermaidMode = activeTab === 'markdown_mermaid' && blocks.length > 0;
  const safeActiveIndex = isMarkdownMermaidMode
    ? Math.max(0, Math.min(activeIndex, blocks.length - 1))
    : 0;
  const activeBlock = isMarkdownMermaidMode ? (blocks[safeActiveIndex] ?? null) : null;
  const activeDiagnostics = isMarkdownMermaidMode ? (diagnostics[safeActiveIndex] ?? null) : null;
  const isMarkdownMermaidInvalid = isMarkdownMermaidMode && activeDiagnostics?.isValid === false;
  const hoveredBlock = useMemo(
    () => (hoveredIndex !== null ? blocks[hoveredIndex] ?? null : null),
    [blocks, hoveredIndex]
  );

  return {
    isMarkdownMermaidMode,
    activeBlock,
    activeDiagnostics,
    isMarkdownMermaidInvalid,
    hoveredBlock,
  };
};
