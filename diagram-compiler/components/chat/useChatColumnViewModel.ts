import { useCallback, useMemo } from 'react';
import type { Message, OperationLog } from '../../types';

type UseChatColumnViewModelArgs = {
  messages: Message[];
  intentText?: string;
  isNotebookChatMode: boolean;
  operationLogs?: OperationLog[];
};

export const useChatColumnViewModel = ({
  messages,
  intentText,
  isNotebookChatMode,
  operationLogs,
}: UseChatColumnViewModelArgs) => {
  const shouldRenderMarkdown = useCallback((message: Message, isStatus: boolean) => {
    if (message.role !== 'assistant' || isStatus) return false;
    if (message.mode === 'analyze' || message.mode === 'fix') return false;
    const text = message.content.trim();
    if (!text) return false;
    return /(^|\n)#{1,6}\s+/.test(text) || /^Intent:\s*/i.test(text);
  }, []);

  const isStatusMessage = useCallback((message: Message) => {
    if (message.role !== 'assistant') return false;
    if (!message.content) return false;
    const content = message.content.replace(/^\[notebook-block:\d+\]\s*/i, '').trim();
    const hasStatusHeader = /^(Build|Chat|Fix|Analyze|Recompile|Notebook|Planner|Notebook build|Notebook block|Сборка|Чат|Исправление|Анализ|Пересборка|Ноутбук|Планировщик)(:|\s|\n|—)/i.test(
      content
    );
    if (!hasStatusHeader) return false;

    if (/\n-\s/.test(content)) return true;
    return /(попытк|attempt|auto-?fix|валид|невалид|готов|ready|request|start|failed|done|fallback)/i.test(content);
  }, []);

  const baseMessages = useMemo(() => {
    if (!operationLogs?.length) return messages;
    return messages.filter((m) => {
      if (m.role !== 'assistant') return true;
      if (m.mode !== 'build') return true;
      return !isStatusMessage(m);
    });
  }, [isStatusMessage, messages, operationLogs?.length]);

  const markdownMessages = useMemo(
    () => baseMessages.filter((m) => shouldRenderMarkdown(m, isStatusMessage(m))),
    [baseMessages, isStatusMessage, shouldRenderMarkdown]
  );
  const lastMarkdownMessage = markdownMessages[markdownMessages.length - 1] ?? null;
  const summaryText = useMemo(() => {
    if (isNotebookChatMode) {
      const raw = intentText?.trim();
      return raw ? raw : null;
    }
    return lastMarkdownMessage?.content ?? null;
  }, [intentText, isNotebookChatMode, lastMarkdownMessage]);

  const chatMessages = useMemo(
    () =>
      baseMessages.filter((m) => {
        if (m.mode === 'system') return false;
        if (isStatusMessage(m)) return false;
        if (!isNotebookChatMode && shouldRenderMarkdown(m, isStatusMessage(m))) return false;
        return true;
      }),
    [baseMessages, isNotebookChatMode, isStatusMessage, shouldRenderMarkdown]
  );

  const parseDiagramsFromIntent = useCallback((text: string) => {
    if (!text.trim()) return [];
    const lines = text.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => /^##\s+Diagrams\b/i.test(line.trim()));
    if (startIndex === -1) return [];
    const diagrams: Array<{ title: string; type: string; goal: string }> = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (/^##\s+/.test(line)) break;
      if (!/^\d+\.\s+/.test(line)) continue;
      const cleaned = line.replace(/^\d+\.\s+/, '');
      const parts = cleaned.includes(' — ')
        ? cleaned.split(' — ')
        : cleaned.split(' - ');
      if (parts.length < 2) continue;
      const title = parts[0]?.trim() ?? '';
      const type = parts[1]?.trim() ?? '';
      const goal = parts[2]?.trim() ?? '';
      if (!type) continue;
      diagrams.push({ title, type, goal });
    }
    return diagrams;
  }, []);

  const formatDiagramCount = useCallback((count: number) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return `${count} диаграмма`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} диаграммы`;
    return `${count} диаграмм`;
  }, []);

  const explainDiagramType = useCallback((type: string, title: string, goal: string) => {
    const normalized = type.toLowerCase();
    const text = `${title} ${goal}`.toLowerCase();
    switch (normalized) {
      case 'flowchart':
        if (/(иерарх|структур|подчин|орг)/.test(text)) {
          return 'чтобы показать иерархию и структуру подчинения';
        }
        return 'чтобы показать процесс и последовательность шагов';
      case 'sequence':
        return 'чтобы показать взаимодействия участников во времени';
      case 'er':
        return 'чтобы описать сущности данных и их связи';
      case 'block':
        return 'чтобы показать структуру и состав системы';
      case 'architecture':
        return 'чтобы показать компоненты/сервисы и их связи';
      case 'gantt':
        return 'чтобы показать расписание и сроки';
      case 'mindmap':
        return 'чтобы разложить тему на понятия и ветки';
      case 'pie':
        return 'чтобы показать доли и распределение';
      case 'state':
        return 'чтобы показать состояния и переходы';
      default:
        return 'для раскрытия ключевых аспектов задачи';
    }
  }, []);

  const chatSummaryMessage = useMemo(() => {
    if (isNotebookChatMode) return null;
    if (!lastMarkdownMessage) return null;
    const diagrams = parseDiagramsFromIntent(lastMarkdownMessage.content);
    if (diagrams.length) {
      const uniqueTypes = Array.from(new Set(diagrams.map((d) => d.type)));
      const header = `Предложено ${formatDiagramCount(diagrams.length)} (типы: ${uniqueTypes.join(', ')}).`;
      const reasons = diagrams.map((diagram) => {
        const reason = explainDiagramType(diagram.type, diagram.title, diagram.goal);
        const goal = diagram.goal ? ` Цель: ${diagram.goal}.` : '';
        const titleLabel = diagram.title ? `${diagram.title} — ` : '';
        return `- ${titleLabel}${diagram.type}: ${reason}.${goal}`;
      });
      return [header, 'Почему так:', ...reasons, 'Если нужно, уточните требования или нажмите Build для сборки.'].join('\n');
    }
    return null;
  }, [
    explainDiagramType,
    formatDiagramCount,
    isNotebookChatMode,
    lastMarkdownMessage,
    parseDiagramsFromIntent,
  ]);

  const inlineLogsByMessageId = useMemo(() => {
    if (!operationLogs?.length || chatMessages.length === 0) return new Map<string, OperationLog[]>();
    const sortedMessages = [...chatMessages].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const assistantMessages = sortedMessages.filter((msg) => msg.role === 'assistant');
    const userMessages = sortedMessages.filter((msg) => msg.role === 'user');
    const logs = [...operationLogs].sort((a, b) => a.startedAt - b.startedAt);
    const map = new Map<string, OperationLog[]>();

    for (const log of logs) {
      const title = log.events[0]?.title ?? '';
      let anchor: Message | null = null;

      if (title === 'Чат') {
        for (const candidate of userMessages) {
          const ts = candidate.timestamp ?? 0;
          if (ts <= log.startedAt) {
            anchor = candidate;
          } else {
            break;
          }
        }
        if (!anchor) {
          anchor = userMessages[userMessages.length - 1] ?? null;
        }
      } else {
        const normalizedTitle = title.trim().toLowerCase();
        const expectedMode: Message['mode'] | null =
          normalizedTitle.startsWith('анализ')
            ? 'analyze'
            : normalizedTitle.startsWith('исправ') || normalizedTitle === 'fix'
              ? 'fix'
              : normalizedTitle === 'notebook build' || normalizedTitle === 'сборка'
                ? 'build'
                : null;
        if (expectedMode) {
          for (const candidate of assistantMessages) {
            const ts = candidate.timestamp ?? 0;
            if (candidate.mode !== expectedMode) continue;
            if (ts < log.startedAt) continue;
            anchor = candidate;
            break;
          }
        }
        if (!anchor) {
          continue;
        }
      }

      if (anchor) {
        const bucket = map.get(anchor.id) ?? [];
        bucket.push(log);
        map.set(anchor.id, bucket);
      }
    }
    return map;
  }, [chatMessages, operationLogs]);

  const anchoredLogIds = useMemo(() => {
    const ids = new Set<string>();
    inlineLogsByMessageId.forEach((logs) => {
      logs.forEach((log) => ids.add(log.id));
    });
    return ids;
  }, [inlineLogsByMessageId]);

  const unanchoredLogs = useMemo(() => {
    if (!operationLogs?.length) return [];
    return operationLogs.filter((log) => !anchoredLogIds.has(log.id));
  }, [anchoredLogIds, operationLogs]);

  const summarizeBuildLog = useCallback((log: OperationLog) => {
    const title = log.events[0]?.title ?? '';
    if (title === 'Notebook build') {
      const statusByBlock = new Map<number, 'ok' | 'err'>();
      let total = 0;
      for (const event of log.events) {
        if (event.title === 'Planner' && event.detail?.startsWith('ready')) {
          const match = event.detail.match(/ready\s*\((\d+)\)/i);
          if (match) total = Number(match[1]);
        }
        if (event.title === 'Block validation' && typeof event.blockIndex === 'number') {
          statusByBlock.set(event.blockIndex, event.detail === 'valid' ? 'ok' : 'err');
        }
        if (event.title === 'Block' && typeof event.blockIndex === 'number' && (event.level === 'warn' || event.level === 'error')) {
          statusByBlock.set(event.blockIndex, 'err');
        }
      }
      const okCount = Array.from(statusByBlock.values()).filter((v) => v === 'ok').length;
      const errCount = Array.from(statusByBlock.values()).filter((v) => v === 'err').length;
      const totalCount = total || statusByBlock.size;
      return `Итог: блоков ${totalCount}, успешно ${okCount}, ошибок ${errCount}.`;
    }

    if (title === 'Сборка') {
      const validationEvent = log.events.find((event) => event.title === 'Валидация');
      const fallbackUsed = log.events.some((event) => event.detail === 'fallback_template');
      const detail =
        validationEvent?.detail === 'валидна'
          ? 'валидна'
          : validationEvent?.detail === 'невалидна'
            ? 'с ошибками'
            : 'готова';
      const fallbackNote = fallbackUsed ? ' Использован шаблон.' : '';
      return `Итог: диаграмма ${detail}.${fallbackNote}`;
    }

    return 'Итог: операция завершена.';
  }, []);

  const getStatusStyle = useCallback((mode?: Message['mode']) => {
    const base =
      'text-slate-500 dark:text-slate-400 font-mono text-[11px] leading-snug tracking-tight';
    const accent = (() => {
      switch (mode) {
        case 'build':
          return '';
        case 'chat':
          return '';
        case 'fix':
          return '';
        case 'analyze':
          return '';
        case 'system':
          return '';
        default:
          return '';
      }
    })();
    return `${base} ${accent}`;
  }, []);

  return {
    summaryText,
    chatMessages,
    isStatusMessage,
    getStatusStyle,
    chatSummaryMessage,
    inlineLogsByMessageId,
    unanchoredLogs,
    summarizeBuildLog,
  };
};
