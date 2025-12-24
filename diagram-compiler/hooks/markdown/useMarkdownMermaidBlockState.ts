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
  const isMarkdownMermaidMode = activeTab === 'markdown_mermaid';
  const activeBlock = blocks[activeIndex];
  const activeDiagnostics = diagnostics[activeIndex];
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
