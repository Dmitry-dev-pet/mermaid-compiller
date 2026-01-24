import { useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { INITIAL_CHAT_MESSAGE } from '../../constants';
import type { DiagramIntent, Message } from '../../types';
import type { TimeStep } from '../../services/history/types';
import { resolveNotebookPlanIntent } from './notebookIntent';
import { resolveChatContextId } from '../../utils/chatContext';

type NotebookChatInfo = { messages: Message[]; rawIntent?: Message };

interface UseNotebookChatParams {
  isNotebookChatMode: boolean;
  isNotebookDataEnabled: boolean;
  getNotebookChatIndex: () => number | null;
  markdownMermaidBlocksLength: number;
  historySteps: TimeStep[];
  getMessagesForContext: (contextId: string) => Message[];
  setMessagesForContext: (contextId: string, action: SetStateAction<Message[]>) => void;
  diagramIntent: DiagramIntent | null;
  setDiagramIntent: Dispatch<SetStateAction<DiagramIntent | null>>;
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
) => {
  const init = buildInitMessage();
  const base = info ? stripNotebookSyntheticMessages(info.messages) : [];
  return [init, ...base];
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
  historySteps,
  getMessagesForContext,
  setMessagesForContext,
  diagramIntent,
  setDiagramIntent,
}: UseNotebookChatParams) => {
  const notebookChatRef = useRef<Record<number, NotebookChatInfo>>({});
  const notebookChatIndexRef = useRef<number | null>(null);
  const buildDocsIntentText = useMemo(() => {
    if (isNotebookDataEnabled) {
      if (!markdownMermaidBlocksLength) return '';
      const rawIntent = resolveNotebookPlanIntent(historySteps);
      return rawIntent?.trim() || '';
    }
    return diagramIntent?.content?.trim() || '';
  }, [
    diagramIntent,
    historySteps,
    isNotebookDataEnabled,
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
    notebookChatIndexRef.current = index;
    const contextId = resolveChatContextId(isNotebookChatMode, index);
    const info = notebookChatRef.current[index] ?? { messages: [] };
    const nextMessages = buildNotebookChatMessages(info);
    const currentMessages = getMessagesForContext(contextId);
    const hasRealMessages = currentMessages.some((message) => (
      message.id !== 'init'
      && message.id !== 'notebook-chat-md'
      && message.id !== 'notebook-raw-intent'
    ));
    const latestStepTimestamp = historySteps
      .filter((step) => {
        const meta = step.meta as Record<string, unknown> | undefined;
        return meta?.mode === 'notebook' && meta?.blockIndex === index;
      })
      .reduce((max, step) => Math.max(max, step.createdAt), 0);
    const latestMessageTimestamp = currentMessages.reduce(
      (max, message) => Math.max(max, message.timestamp ?? 0),
      0
    );
    const shouldPreserveLiveMessages = latestMessageTimestamp > latestStepTimestamp;

    if (!shouldPreserveLiveMessages) {
      const currentIds = new Set(currentMessages.map((m) => m.id));
      const nextIds = new Set(nextMessages.map((m) => m.id));
      const missingFromCurrent = nextMessages.some((m) => !currentIds.has(m.id));

      if (missingFromCurrent) {
        const extras = currentMessages.filter(
          (m) =>
            m.id !== 'init' &&
            m.id !== 'notebook-chat-md' &&
            m.id !== 'notebook-raw-intent' &&
            !nextIds.has(m.id)
        );
        const merged = extras.length ? [...nextMessages, ...extras] : nextMessages;
        if (!areMessagesEqual(currentMessages, merged)) {
          setMessagesForContext(contextId, merged);
        }
      } else if (!hasRealMessages && !areMessagesEqual(currentMessages, nextMessages)) {
        setMessagesForContext(contextId, nextMessages);
      }
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
    getMessagesForContext,
    isNotebookChatMode,
    historySteps,
    diagramIntent,
    setDiagramIntent,
    notebookChatIndexRef,
    notebookChatRef,
    markdownMermaidBlocksLength,
    setMessagesForContext,
  ]);

  useEffect(() => {
    if (!isNotebookChatMode) return;
    const index = getNotebookChatIndex();
    if (index === null) return;
    const contextId = resolveChatContextId(isNotebookChatMode, index);
    const currentMessages = getMessagesForContext(contextId);
    const hasNotebookSynthetic = currentMessages.some(
      (m) => m.id === 'notebook-chat-md' || m.id === 'notebook-raw-intent'
    );
    if (!hasNotebookSynthetic) return;
    const info = notebookChatRef.current[index];
    const nextInfo = {
      messages: stripNotebookSyntheticMessages(currentMessages),
      rawIntent: info?.rawIntent,
    };
    notebookChatRef.current[index] = nextInfo;
  }, [
    getNotebookChatIndex,
    getMessagesForContext,
    isNotebookChatMode,
    notebookChatIndexRef,
    notebookChatRef,
  ]);

  return {
    buildDocsIntentText,
  };
};
