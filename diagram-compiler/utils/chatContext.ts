export const resolveChatContextId = (isNotebookChatMode: boolean, blockIndex?: number | null) => {
  if (!isNotebookChatMode) return 'main';
  if (typeof blockIndex === 'number') return `block:${blockIndex}`;
  return 'main';
};
