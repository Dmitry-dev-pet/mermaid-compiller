import { useCallback, useEffect, useMemo } from 'react';
import { resolveChatContextId } from '../../utils/contextIds';

type UseStudioChatContextArgs = {
  isNotebookChatMode: boolean;
  markdownMermaidActiveIndex: number;
  markdownMermaidBlocksLength: number;
  activeContextId: string;
  setActiveContextId: (contextId: string) => void;
};

export const useStudioChatContext = ({
  isNotebookChatMode,
  markdownMermaidActiveIndex,
  markdownMermaidBlocksLength,
  activeContextId,
  setActiveContextId,
}: UseStudioChatContextArgs) => {
  const getNotebookChatIndex = useCallback(() => {
    if (!isNotebookChatMode) return null;
    const index = typeof markdownMermaidActiveIndex === 'number' ? markdownMermaidActiveIndex : 0;
    return Math.max(0, Math.min(index, Math.max(0, markdownMermaidBlocksLength - 1)));
  }, [isNotebookChatMode, markdownMermaidActiveIndex, markdownMermaidBlocksLength]);

  const activeChatContextId = useMemo(() => {
    return resolveChatContextId(isNotebookChatMode, getNotebookChatIndex());
  }, [getNotebookChatIndex, isNotebookChatMode]);

  useEffect(() => {
    if (activeContextId !== activeChatContextId) {
      setActiveContextId(activeChatContextId);
    }
  }, [activeChatContextId, activeContextId, setActiveContextId]);

  return {
    activeChatContextId,
    getNotebookChatIndex,
  };
};
