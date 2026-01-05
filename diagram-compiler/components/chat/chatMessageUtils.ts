import type { Message } from '../../types';

export const parseNotebookBuildMessage = (message: Message) => {
  if (message.mode !== 'build') return null;
  const match = message.content.match(/^\[notebook-block:(\d+)\]\s*/);
  if (!match) return null;
  const blockIndex = Number(match[1]);
  if (!Number.isFinite(blockIndex)) return null;
  const text = message.content.slice(match[0].length).trim();
  return { blockIndex, text };
};

export const getAttemptIndicator = (text: string) => {
  const match = text.match(/(?:попытка|attempt|попытки)\s*:?(\d+)\s*\/\s*(\d+)/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  const remaining = Math.max(0, total - current + 1);
  return { current, total, remaining };
};
