import { useMemo } from 'react';
import type { EditorTab } from '../../types';
import { isMarkdownLike } from '../../services/mermaidService';

type NotebookContextArgs = {
  editorTab: EditorTab;
  mermaidCode: string;
  markdownBlocksLength: number;
};

export const useNotebookContext = ({
  editorTab,
  mermaidCode,
  markdownBlocksLength,
}: NotebookContextArgs) => {
  return useMemo(() => {
    const isEnabled = true;
    const hasBlocks = markdownBlocksLength > 0;
    const isDocTab = editorTab === 'code';
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
  }, [editorTab, markdownBlocksLength, mermaidCode]);
};
