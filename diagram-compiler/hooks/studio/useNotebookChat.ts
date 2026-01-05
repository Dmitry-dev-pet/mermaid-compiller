import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { INITIAL_CHAT_MESSAGE } from '../../constants';
import type { DiagramIntent, Message } from '../../types';
import type { TimeStep } from '../../services/history/types';
import { resolveNotebookRawIntent } from './notebookIntent';

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
  diagramIntent: DiagramIntent | null;
  setDiagramIntent: Dispatch<SetStateAction<DiagramIntent | null>>;
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

const resolveNotebookBlockIntent = (steps: TimeStep[], blockIndex: number): DiagramIntent | null => {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') continue;
    if (typeof meta.blockIndex !== 'number' || meta.blockIndex !== blockIndex) continue;
    const intent = typeof meta.intent === 'string' ? meta.intent.trim() : '';
    if (!intent) continue;
    const rawSource = meta.intentSource;
    const source =
      rawSource === 'chat' || rawSource === 'build' || rawSource === 'fallback'
        ? (rawSource as DiagramIntent['source'])
        : step.type === 'chat'
          ? 'chat'
          : step.type === 'build'
            ? 'build'
            : 'fallback';
    return { content: intent, source, updatedAt: step.createdAt };
  }

  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') continue;
    if (typeof meta.blockIndex !== 'number' || meta.blockIndex !== blockIndex) continue;
    const planIntent = typeof meta.notebookPlanIntent === 'string' ? meta.notebookPlanIntent.trim() : '';
    if (!planIntent) continue;
    return { content: planIntent, source: 'build', updatedAt: step.createdAt };
  }

  return null;
};

const stripNotebookSyntheticMessages = (list: Message[], excludeIds?: Set<string>) => {
  return list.filter((m) => (
    m.id !== 'init'
    && m.id !== 'notebook-chat-md'
    && m.id !== 'notebook-raw-intent'
    && !excludeIds?.has(m.id)
  ));
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
  const raw = info?.rawIntent
    ? [{ ...info.rawIntent, id: 'notebook-raw-intent' }]
    : [];
  const promptMessages = includeRaw ? raw : [...raw, systemPromptMessage];
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
  diagramIntent,
  setDiagramIntent,
  systemPrompt,
  systemPromptRedacted,
  isSystemPromptRaw,
}: UseNotebookChatParams) => {
  const notebookChatRef = useRef<Record<number, NotebookChatInfo>>({});
  const notebookChatIndexRef = useRef<number | null>(null);
  const mainChatRef = useRef<Message[] | null>(null);
  const mainDiagramIntentRef = useRef<DiagramIntent | null>(null);
  const notebookChatModeRef = useRef(false);
  const buildDocsIntentText = useMemo(() => {
    if (isNotebookDataEnabled) {
      if (!markdownMermaidBlocksLength) return '';
      const index = Math.max(0, Math.min(markdownMermaidActiveIndex, markdownMermaidBlocksLength - 1));
      const rawIntent = resolveNotebookRawIntent(historySteps, index);
      return rawIntent?.trim() || '';
    }
    return diagramIntent?.content?.trim() || '';
  }, [
    diagramIntent,
    historySteps,
    isNotebookDataEnabled,
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
      mainDiagramIntentRef.current = diagramIntent;
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
    const nextIntent = resolveNotebookBlockIntent(historySteps, index);
    if (
      (nextIntent?.content ?? '') !== (diagramIntent?.content ?? '')
      || (nextIntent?.source ?? 'fallback') !== (diagramIntent?.source ?? 'fallback')
    ) {
      setDiagramIntent(nextIntent);
    }
  }, [
    getNotebookChatIndex,
    getMessages,
    isNotebookChatMode,
    historySteps,
    isSystemPromptRaw,
    diagramIntent,
    setDiagramIntent,
    mainChatRef,
    mainDiagramIntentRef,
    notebookChatIndexRef,
    notebookChatModeRef,
    notebookChatRef,
    markdownMermaidBlocksLength,
    setMessages,
    systemPrompt,
    systemPromptRedacted,
  ]);

  useEffect(() => {
    if (isNotebookChatMode) {
      const index = getNotebookChatIndex();
      if (index === null) return;
      const hasNotebookSynthetic = messages.some(
        (m) => m.id === 'notebook-chat-md' || m.id === 'notebook-raw-intent'
      );
      if (!hasNotebookSynthetic) return;
      const info = notebookChatRef.current[index];
      const nextInfo = {
        messages: stripNotebookSyntheticMessages(messages),
        rawIntent: info?.rawIntent,
      };
      notebookChatRef.current[index] = nextInfo;
      return;
    }

    if (notebookChatModeRef.current) {
      if (mainChatRef.current && !areMessagesEqual(getMessages(), mainChatRef.current)) {
        setMessages(mainChatRef.current);
      }
      if (
        mainDiagramIntentRef.current
        && (
          mainDiagramIntentRef.current.content !== (diagramIntent?.content ?? '')
          || mainDiagramIntentRef.current.source !== (diagramIntent?.source ?? 'fallback')
        )
      ) {
        setDiagramIntent(mainDiagramIntentRef.current);
      } else if (!mainDiagramIntentRef.current && diagramIntent) {
        setDiagramIntent(null);
      }
      notebookChatIndexRef.current = null;
      notebookChatModeRef.current = false;
      return;
    }
    mainChatRef.current = messages;
    mainDiagramIntentRef.current = diagramIntent;
  }, [
    getNotebookChatIndex,
    getMessages,
    isNotebookChatMode,
    diagramIntent,
    setDiagramIntent,
    mainChatRef,
    mainDiagramIntentRef,
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
