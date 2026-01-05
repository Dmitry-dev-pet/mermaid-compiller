import type { Dispatch, SetStateAction } from 'react';
import type { Message } from '../../types';
import { generateId } from '../../utils';

type ProgressTrackerOptions = {
  setMessages: Dispatch<SetStateAction<Message[]>>;
  prefix: string;
  mode: Message['mode'];
};

export const createProgressTracker = ({ setMessages, prefix, mode }: ProgressTrackerOptions) => {
  let lastMessage: Message | null = null;

  const update = (status: string) => {
    let nextMessage: Message | null = null;
    const content = `${prefix}${status}`;

    setMessages((prev) => {
      const targetIndex =
        lastMessage
          ? prev.findIndex((msg) => msg.id === lastMessage?.id)
          : prev.findIndex(
              (msg) =>
                msg.role === 'assistant' &&
                msg.mode === mode &&
                msg.content.startsWith(prefix)
            );
      if (targetIndex === -1) {
        nextMessage = {
          id: generateId(),
          role: 'assistant',
          content,
          timestamp: Date.now(),
          mode,
        };
        return [...prev, nextMessage];
      }
      const existing = prev[targetIndex];
      nextMessage = {
        ...existing,
        content,
        timestamp: Date.now(),
      };
      const next = [...prev];
      next[targetIndex] = nextMessage;
      return next;
    });

    if (nextMessage) lastMessage = nextMessage;
    return nextMessage;
  };

  return {
    update,
    getMessage: () => lastMessage,
  };
};
