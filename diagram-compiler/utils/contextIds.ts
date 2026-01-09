import type { OperationLog } from '../types';

export const MAIN_CHAT_CONTEXT_ID = 'main';

export const resolveChatContextId = (isNotebookChatMode: boolean, blockIndex?: number | null) => {
  if (!isNotebookChatMode) return MAIN_CHAT_CONTEXT_ID;
  if (typeof blockIndex === 'number') return `block:${blockIndex}`;
  return MAIN_CHAT_CONTEXT_ID;
};

export const resolveOperationContextId = (contextId?: string, blockIndex?: number | null) => {
  if (contextId) return contextId;
  if (typeof blockIndex === 'number') return `block:${blockIndex}`;
  return MAIN_CHAT_CONTEXT_ID;
};

export const resolveOperationLogContextId = (log: OperationLog) => {
  if (log.contextId) return log.contextId;
  const blockEvent = log.events.find((event) => typeof event.blockIndex === 'number');
  if (blockEvent && typeof blockEvent.blockIndex === 'number') {
    return `block:${blockEvent.blockIndex}`;
  }
  return MAIN_CHAT_CONTEXT_ID;
};
