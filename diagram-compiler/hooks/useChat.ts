import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Message } from '../types';
import { INITIAL_CHAT_MESSAGE } from '../constants';
import { generateId } from '../utils';

const INITIAL_MESSAGES: Message[] = [
  { id: 'init', role: 'assistant', content: INITIAL_CHAT_MESSAGE, timestamp: 0 },
];

export const useChat = () => {
  const [messages, setMessagesState] = useState<Message[]>(INITIAL_MESSAGES);
  const messagesRef = useRef<Message[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const setMessages: Dispatch<SetStateAction<Message[]>> = useCallback((action) => {
    const next =
      typeof action === 'function'
        ? (action as (prev: Message[]) => Message[])(messagesRef.current)
        : action;

    messagesRef.current = next;
    setMessagesState(next);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const resetMessages = useCallback(() => {
    setMessages(INITIAL_MESSAGES);
  }, [setMessages]);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const nextMessage: Message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, nextMessage]);
    return nextMessage;
  }, [setMessages]);

  const getMessages = useCallback(() => messagesRef.current, []);

  return {
    messages,
    setMessages, // Exposed for bulk updates or specialized logic
    addMessage,
    clearMessages,
    resetMessages,
    getMessages,
  };
};
