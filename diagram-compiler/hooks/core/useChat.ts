import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Message } from '../../types';
import { INITIAL_CHAT_MESSAGE } from '../../constants';
import { generateId } from '../../utils';

const INITIAL_MESSAGES: Message[] = [
  { id: 'init', role: 'assistant', content: INITIAL_CHAT_MESSAGE, timestamp: 0, mode: 'system' },
];

const MAIN_CHAT_CONTEXT = 'main';

type MessagesByContext = Record<string, Message[]>;

export const useChat = () => {
  const [messagesByContext, setMessagesByContextState] = useState<MessagesByContext>({
    [MAIN_CHAT_CONTEXT]: INITIAL_MESSAGES,
  });
  const [activeContextId, setActiveContextIdState] = useState(MAIN_CHAT_CONTEXT);
  const messagesRef = useRef<MessagesByContext>(messagesByContext);
  const activeContextRef = useRef(activeContextId);

  useEffect(() => {
    messagesRef.current = messagesByContext;
  }, [messagesByContext]);

  useEffect(() => {
    activeContextRef.current = activeContextId;
  }, [activeContextId]);

  const getMessagesForContext = useCallback((contextId?: string) => {
    const key = contextId ?? activeContextRef.current;
    return messagesRef.current[key] ?? (key === MAIN_CHAT_CONTEXT ? INITIAL_MESSAGES : []);
  }, []);

  const setMessagesForContext = useCallback(
    (contextId: string, action: SetStateAction<Message[]>) => {
      const prev = messagesRef.current[contextId] ?? [];
      const next =
        typeof action === 'function'
          ? (action as (prev: Message[]) => Message[])(prev)
          : action;

      messagesRef.current = {
        ...messagesRef.current,
        [contextId]: next,
      };
      setMessagesByContextState(messagesRef.current);
    },
    []
  );

  const setMessages: Dispatch<SetStateAction<Message[]>> = useCallback((action) => {
    const key = activeContextRef.current;
    setMessagesForContext(key, action);
  }, [setMessagesForContext]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const resetMessages = useCallback(() => {
    messagesRef.current = { [MAIN_CHAT_CONTEXT]: INITIAL_MESSAGES };
    setMessagesByContextState(messagesRef.current);
    setActiveContextIdState(MAIN_CHAT_CONTEXT);
  }, []);

  const addMessage = useCallback((
    role: 'user' | 'assistant',
    content: string,
    mode?: Message['mode'],
    contextId?: string
  ) => {
    const targetContext = contextId ?? activeContextRef.current;
    const nextMessage: Message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
      mode,
    };

    setMessagesForContext(targetContext, (prev) => [...prev, nextMessage]);
    return nextMessage;
  }, [setMessagesForContext]);

  const getMessages = useCallback((contextId?: string) => getMessagesForContext(contextId), [
    getMessagesForContext,
  ]);

  const setActiveContextId = useCallback((contextId: string) => {
    setActiveContextIdState(contextId);
  }, []);

  const messages = getMessagesForContext(activeContextId);

  return {
    messages,
    setMessages, // Exposed for bulk updates or specialized logic
    setMessagesForContext,
    addMessage,
    clearMessages,
    resetMessages,
    getMessages,
    getMessagesForContext,
    activeContextId,
    setActiveContextId,
  };
};
