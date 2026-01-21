import { useMemo } from 'react';
import type { EditorTab } from '../../types';
import { isMarkdownLike } from '../../services/mermaidService';

type NotebookContextArgs = {
  editorTab: EditorTab;
  buildDocsScope?: 'notebook' | 'diagram';
  mermaidCode: string;
  markdownBlocksLength: number;
};

export const useNotebookContext = ({
  editorTab,
  buildDocsScope = 'notebook',
  mermaidCode,
  markdownBlocksLength,
}: NotebookContextArgs) => {
  return useMemo(() => {
    const isEnabled = true;
    const hasBlocks = markdownBlocksLength > 0;
    const isBuildDocsDiagramScope = editorTab === 'build_docs' && buildDocsScope === 'diagram';
    // `build_docs` (Prompts) can be either notebook-level (main chat) or diagram-level (block chat).
    const isDocTab = editorTab === 'code' || (editorTab === 'build_docs' && !isBuildDocsDiagramScope);
    const isBlockTab = !isDocTab;
    return {
      isEnabled,
      hasBlocks,
      isDocTab,
      isBlockTab,
      isNotebookChatMode: isEnabled && isBlockTab && isMarkdownLike(mermaidCode) && hasBlocks,
      isNotebookDataEnabled: isEnabled && hasBlocks,
      isNotebookChatEnabled: isEnabled,
    };
  }, [buildDocsScope, editorTab, markdownBlocksLength, mermaidCode]);
};
