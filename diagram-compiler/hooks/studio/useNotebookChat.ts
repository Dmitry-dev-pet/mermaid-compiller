import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { INITIAL_CHAT_MESSAGE } from '../../constants';
import type { Message } from '../../types';
import type { TimeStep } from '../../services/history/types';

type NotebookChatInfo = { messages: Message[]; rawIntent?: Message };

interface UseNotebookChatParams {
  isNotebookChatMode: boolean;
  isNotebookDataEnabled: boolean;
  getNotebookChatIndex: () => number | null;
  markdownMermaidBlocksLength: number;
  markdownMermaidActiveIndex: number;
  historySteps: TimeStep[];
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  getMessages: () => Message[];
  diagramIntentContent?: string | null;
  systemPrompt: string;
  systemPromptRedacted: string;
  isSystemPromptRaw: boolean;
}

interface UseNotebookChatViewParams {
  isNotebookChatMode: boolean;
  messages: Message[];
}

export const useNotebookChatView = ({ isNotebookChatMode, messages }: UseNotebookChatViewParams) => {
  return useMemo(() => (isNotebookChatMode ? messages : messages), [isNotebookChatMode, messages]);
};

const buildNotebookChatMap = (steps: TimeStep[]) => {
  const map: Record<number, NotebookChatInfo> = {};
  steps.forEach((step) => {
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') return;
    const blockIndex = typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
    if (blockIndex === null) return;
    const info = map[blockIndex] ?? { messages: [] };
    const nextMessages = [...info.messages, ...(step.messages ?? [])];
    info.messages = nextMessages;
    if (!info.rawIntent && typeof meta.notebookPlanIntent === 'string') {
      info.rawIntent = {
        id: `notebook-raw-${blockIndex}`,
        role: 'assistant',
        content: meta.notebookPlanIntent,
        timestamp: step.createdAt,
        mode: 'system',
      };
    }
    map[blockIndex] = info;
  });
  return map;
};

const resolveNotebookRawIntent = (steps: TimeStep[], blockIndex: number) => {
  for (const step of steps) {
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') continue;
    if (typeof meta.blockIndex !== 'number' || meta.blockIndex !== blockIndex) continue;
    if (typeof meta.notebookPlanIntent === 'string') return meta.notebookPlanIntent;
  }
  return '';
};

const stripNotebookSyntheticMessages = (list: Message[]) => {
  return list.filter((m) => m.id !== 'init' && m.id !== 'notebook-chat-md' && m.id !== 'notebook-raw-intent');
};

const buildInitMessage = (): Message => ({
  id: 'init',
  role: 'assistant',
  content: INITIAL_CHAT_MESSAGE,
  timestamp: 0,
  mode: 'system',
});

const buildNotebookChatMessages = (
  info: NotebookChatInfo | null,
  includeRaw: boolean,
  systemPrompt: string,
  systemPromptRedacted: string
) => {
  const init = buildInitMessage();
  const base = info ? stripNotebookSyntheticMessages(info.messages) : [];
  const resolvedPrompt = systemPromptRedacted || systemPrompt || 'No system prompt available.';
  const systemPromptMessage: Message = {
    id: 'notebook-chat-md',
    role: 'assistant',
    content: `chat.md\n\n${resolvedPrompt}`,
    timestamp: 0,
    mode: 'system',
  };
  const raw = includeRaw && info?.rawIntent
    ? [{ ...info.rawIntent, id: 'notebook-raw-intent' }]
    : [];
  const promptMessages = includeRaw ? raw : [systemPromptMessage];
  return [init, ...promptMessages, ...base];
};

const areMessagesEqual = (a: Message[], b: Message[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.role !== right.role ||
      left.mode !== right.mode ||
      left.content !== right.content
    ) {
      return false;
    }
  }
  return true;
};

export const useNotebookChat = ({
  isNotebookChatMode,
  isNotebookDataEnabled,
  getNotebookChatIndex,
  markdownMermaidBlocksLength,
  markdownMermaidActiveIndex,
  historySteps,
  messages,
  setMessages,
  getMessages,
  diagramIntentContent,
  systemPrompt,
  systemPromptRedacted,
  isSystemPromptRaw,
}: UseNotebookChatParams) => {
  const notebookChatRef = useRef<Record<number, NotebookChatInfo>>({});
  const notebookChatIndexRef = useRef<number | null>(null);
  const mainChatRef = useRef<Message[] | null>(null);
  const notebookChatModeRef = useRef(false);
  const buildDocsIntentText = useMemo(() => {
    if (diagramIntentContent?.trim()) {
      return diagramIntentContent.trim();
    }
    if (!markdownMermaidBlocksLength) return '';
    const index = Math.max(0, Math.min(markdownMermaidActiveIndex, markdownMermaidBlocksLength - 1));
    const rawIntent = resolveNotebookRawIntent(historySteps, index);
    if (rawIntent?.trim()) return rawIntent.trim();
    return '';
  }, [
    diagramIntentContent,
    historySteps,
    markdownMermaidActiveIndex,
    markdownMermaidBlocksLength,
  ]);

  useEffect(() => {
    if (!isNotebookDataEnabled) {
      notebookChatRef.current = {};
      return;
    }
    notebookChatRef.current = buildNotebookChatMap(historySteps);
  }, [historySteps, isNotebookDataEnabled, notebookChatRef]);

  useEffect(() => {
    if (!isNotebookChatMode) return;
    const index = getNotebookChatIndex();
    if (index === null) return;
    if (!notebookChatModeRef.current) {
      mainChatRef.current = getMessages();
      notebookChatModeRef.current = true;
    }
    notebookChatIndexRef.current = index;
    const info = notebookChatRef.current[index] ?? { messages: [] };
    const nextMessages = buildNotebookChatMessages(
      info,
      isSystemPromptRaw,
      systemPrompt,
      systemPromptRedacted
    );
    if (!areMessagesEqual(getMessages(), nextMessages)) {
      setMessages(nextMessages);
    }
  }, [
    getNotebookChatIndex,
    getMessages,
    isNotebookChatMode,
    isSystemPromptRaw,
    mainChatRef,
    notebookChatIndexRef,
    notebookChatModeRef,
    notebookChatRef,
    setMessages,
    systemPrompt,
    systemPromptRedacted,
  ]);

  useEffect(() => {
    if (isNotebookChatMode) {
      const index = getNotebookChatIndex();
      if (index === null) return;
      const info = notebookChatRef.current[index];
      const nextInfo = {
        messages: stripNotebookSyntheticMessages(messages),
        rawIntent: info?.rawIntent,
      };
      notebookChatRef.current[index] = nextInfo;
      return;
    }

    if (notebookChatIndexRef.current !== null) {
      if (mainChatRef.current) {
        setMessages(mainChatRef.current);
      }
      notebookChatIndexRef.current = null;
      notebookChatModeRef.current = false;
      return;
    }
    mainChatRef.current = messages;
  }, [
    getNotebookChatIndex,
    isNotebookChatMode,
    mainChatRef,
    messages,
    notebookChatIndexRef,
    notebookChatModeRef,
    notebookChatRef,
    setMessages,
  ]);

  return {
    buildDocsIntentText,
  };
};
