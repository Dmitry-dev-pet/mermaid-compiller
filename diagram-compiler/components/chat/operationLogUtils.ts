import type { OperationEvent, OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';

export type LogRow = {
  id: string;
  text: string;
  blockIndex?: number;
  kind?: 'block' | 'block_attempt' | 'block_validation' | 'attempt';
  key?: string;
  status?: 'ok' | 'err';
  timeMs?: number;
  timeLabel?: string;
  isTerminal?: boolean;
  isSection?: boolean;
  tooltipMessages?: string;
  tooltipDocs?: string;
  eventKind?: OperationEvent['kind'];
  contextScope?: OperationEvent['contextScope'];
};

export type OperationLogViewModel = {
  summaryLabel: string;
  summaryLine: string | null;
  rows: LogRow[];
};

const parseBlockDetail = (detail: string) => {
  const match = detail.match(/^(\d+\/\d+)\s*-\s*(.+)$/);
  if (!match) return null;
  return {
    label: match[1],
    rest: match[2],
  };
};

const formatEvent = (event: OperationEvent) => {
  const parts: string[] = [];
  const isBlockEvent = event.title.startsWith('Block');
  const isBuildStart =
    (event.title === 'Notebook build' || event.title === 'Сборка') && event.detail === 'start';
  if (isBuildStart) {
    return 'Build — нажата';
  }
  const titleOverride =
    event.title === 'Notebook build'
      ? 'Сборка'
      : event.title === 'Planner'
        ? 'План'
        : event.title === 'Notebook'
          ? 'Ноутбук'
          : event.title;
  const parsedDetail = event.detail ? parseBlockDetail(event.detail) : null;
  if (typeof event.blockIndex === 'number' && parsedDetail) {
    parts.push(parsedDetail.label);
    parts.push(parsedDetail.rest);
  }
  if (parts.length === 0 && typeof event.blockIndex === 'number') {
    parts.push(`${event.blockIndex + 1}`);
  }
  if (!isBlockEvent) {
    parts.push(titleOverride);
  }
  if (!event.detail || parts.length === 0 || !parsedDetail) {
    if (event.detail) parts.push(event.detail);
  }
  return parts.join(' — ');
};

const formatAttemptIndicator = (attempt: OperationEvent['attempt']) => {
  if (!attempt) return '';
  const used = Math.max(0, attempt.current);
  const suffix = `${used}/${attempt.max}`;
  const blocks = used > 0 ? '■'.repeat(used) : '0';
  return `${blocks} ${suffix}`.trim();
};

const formatPlannerLine = (countText: string) => {
  const count = Number(countText);
  if (!Number.isFinite(count) || count <= 0) {
    return 'Building plan';
  }
  return `Building plan (${count} diagrams)`;
};

const buildSummary = (log: OperationLog) => {
  const errors = log.events.filter((e) => e.level === 'error').length;
  const total = log.events.length;
  const parts = [`Итог: событий ${total}`];
  if (errors) parts.push(`ошибок ${errors}`);
  return parts.join(' • ');
};

const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const resolveLastLlmStartAt = (log: OperationLog) => {
  if (log.lastLLMStartedAt) return log.lastLLMStartedAt;
  for (let i = log.events.length - 1; i >= 0; i -= 1) {
    const event = log.events[i];
    if (event.title === 'LLM' && event.detail?.startsWith('start')) {
      return event.createdAt;
    }
  }
  return null;
};

export const buildOperationLogViewModel = (
  operationLog: OperationLog,
  args?: { showSummaryLine?: boolean; timeoutMs?: number; now?: number }
): OperationLogViewModel => {
  const timeoutMs = args?.timeoutMs ?? LLM_TIMEOUT_MS;
  const showSummaryLine = args?.showSummaryLine ?? true;
  const now = args?.now ?? Date.now();
  const hasFinishedEvent = operationLog.events.some(
    (event) => event.phase === 'done' || event.title === 'Done' || event.title === 'Failed'
  );
  const isRunning = operationLog.status === 'running' && !hasFinishedEvent;
  const firstTitle = operationLog.events[0]?.title ?? '';
  const summaryLabel = isRunning
    ? firstTitle === 'Чат'
      ? 'Thinking'
      : 'Building'
    : firstTitle === 'Чат'
      ? 'Finished thinking'
      : 'Finished building';
  const summaryLine = !isRunning && showSummaryLine ? buildSummary(operationLog) : null;
  const lastLlmStartAt = resolveLastLlmStartAt(operationLog);

  const statusByBlock = new Map<number, 'ok' | 'err'>();
  const errorEventsByBlock = new Map<number, Array<{ id: string; text: string }>>();
  const displayEvents: LogRow[] = [];
  for (let i = 0; i < operationLog.events.length; i += 1) {
    const event = operationLog.events[i];
    if (event.title === 'LLM') {
      continue;
    }
    if (event.title === 'Чат' && event.detail?.includes('язык')) {
      continue;
    }
    if (event.title === 'Чат' && event.detail === 'нажата') {
      continue;
    }
    if (event.title === 'Чат' && event.detail === 'start') {
      continue;
    }
    if (typeof event.blockIndex === 'number') {
      if (event.title === 'Block validation') {
        statusByBlock.set(event.blockIndex, event.detail === 'valid' ? 'ok' : 'err');
      } else if (event.title === 'Block' && (event.level === 'warn' || event.level === 'error')) {
        statusByBlock.set(event.blockIndex, 'err');
      }
      if ((event.level === 'warn' || event.level === 'error') && event.detail) {
        const list = errorEventsByBlock.get(event.blockIndex) ?? [];
        list.push({ id: event.id, text: event.detail });
        errorEventsByBlock.set(event.blockIndex, list);
      }
    }
    if (event.title === 'Block') {
      if (typeof event.blockIndex === 'number') {
        const hasAttemptEntry = displayEvents.some(
          (entry) => entry.kind === 'block_attempt' && entry.blockIndex === event.blockIndex
        );
        if (hasAttemptEntry && event.metrics?.durationMs) {
          for (let j = displayEvents.length - 1; j >= 0; j -= 1) {
            const prev = displayEvents[j];
            if (prev.kind !== 'block_attempt' || prev.blockIndex !== event.blockIndex) continue;
            if (!prev.timeMs) {
              prev.timeMs = event.metrics.durationMs;
            }
            break;
          }
        }
        if (hasAttemptEntry) continue;
      }
      const hasAttempt = operationLog.events
        .slice(i + 1)
        .some((next) => next.title === 'Block attempt' && next.blockIndex === event.blockIndex);
      if (hasAttempt) continue;
    }
    if (event.title === 'Planner' && event.detail === 'request') {
      let nextReady: OperationEvent | null = null;
      for (let j = operationLog.events.length - 1; j >= 0; j -= 1) {
        const candidate = operationLog.events[j];
        if (candidate.title !== 'Planner' || !candidate.detail?.startsWith('ready')) continue;
        nextReady = candidate;
        break;
      }
      if (nextReady?.detail) {
        const match = nextReady.detail.match(/\((\d+)\)/);
        const count = match?.[1] ?? '';
        const duration = nextReady.metrics?.durationMs ?? null;
        displayEvents.push({
          id: event.id,
          text: formatPlannerLine(count),
          kind: 'attempt',
          timeMs: duration ?? undefined,
        });
      }
      continue;
    }
    if (event.title === 'Planner' && event.detail?.startsWith('ready')) {
      continue;
    }
    if (event.title === 'Итог' && event.detail === 'generating') {
      continue;
    }

    if (event.title === 'Block' && event.detail && typeof event.blockIndex === 'number') {
      const isErrorLevel = event.level === 'warn' || event.level === 'error';
      if (isErrorLevel) {
        let merged = false;
        for (let j = displayEvents.length - 1; j >= 0; j -= 1) {
          const prev = displayEvents[j];
          if (prev.kind !== 'block_attempt') continue;
          if (prev.blockIndex !== event.blockIndex) continue;
          if (!prev.text.includes('ошибка:')) {
            prev.text = `${prev.text} — ошибка: ${event.detail}`;
          }
          merged = true;
          break;
        }
        if (merged) {
          continue;
        }
      }
    }

    const isValidBlockValidation = event.title === 'Block validation' && event.detail === 'valid';
    if (isValidBlockValidation) {
      const prev = displayEvents[displayEvents.length - 1];
      if (prev && prev.kind === 'block_attempt' && prev.blockIndex === event.blockIndex) {
        continue;
      }
    }

    if (event.attempt) {
      const key = `${event.title}:${event.blockIndex ?? 'na'}`;
      const indicator = formatAttemptIndicator(event.attempt);
      const baseText = formatEvent(event);
      const attemptText = event.attempt.current > 1 && indicator
        ? `${baseText} — ${indicator}`
        : baseText;
      let updated = false;
      for (let j = displayEvents.length - 1; j >= 0; j -= 1) {
        const prev = displayEvents[j];
        if (prev.key !== key) continue;
        if (prev.kind !== 'attempt' && prev.kind !== 'block_attempt') continue;
        prev.text = attemptText;
        updated = true;
        break;
      }
      if (!updated) {
        displayEvents.push({
          id: event.id,
          text: attemptText,
          blockIndex: event.blockIndex,
          kind: event.title === 'Block attempt' ? 'block_attempt' : 'attempt',
          key,
        });
      }
      continue;
    }

    const kind = event.title === 'Block attempt'
      ? 'block_attempt'
      : event.title === 'Block validation'
        ? 'block_validation'
        : event.title === 'Block'
          ? 'block'
          : undefined;
    displayEvents.push({
      id: event.id,
      text: formatEvent(event),
      blockIndex: event.blockIndex,
      kind,
      timeMs: event.metrics?.durationMs,
      isTerminal: event.title === 'Done' || event.title === 'Failed',
      tooltipMessages: event.tooltipMessages ?? event.tooltip,
      tooltipDocs: event.tooltipDocs ?? event.tooltip,
      eventKind: event.kind,
      contextScope: event.contextScope,
    });
  }

  const decoratedEvents: LogRow[] = displayEvents.map((event) => {
    if (typeof event.blockIndex !== 'number') return event;
    if (event.kind !== 'block' && event.kind !== 'block_attempt') return event;
    const status = statusByBlock.get(event.blockIndex);
    if (!status) return event;
    const suffix = status === 'ok' ? '✅' : '⚠️';
    return { ...event, text: `${event.text} ${suffix}`, status };
  });

  const rows: LogRow[] = [];
  for (const event of decoratedEvents) {
    rows.push(event);
    if (event.status === 'err' && typeof event.blockIndex === 'number') {
      const errors = errorEventsByBlock.get(event.blockIndex) ?? [];
      const grouped = new Map<string, number>();
      for (const error of errors) {
        grouped.set(error.text, (grouped.get(error.text) ?? 0) + 1);
      }
      for (const [text, count] of grouped.entries()) {
        const suffix = count > 1 ? ` (x${count})` : '';
        rows.push({
          id: `${event.id}-err-${text}`,
          text: `⚠️ ${text}${suffix}`,
          blockIndex: event.blockIndex,
        });
      }
    }
  }
  const plannerIndex = rows.findIndex((row) =>
    row.contextScope === 'planner' || row.text.startsWith('Building plan')
  );
  if (plannerIndex >= 0) {
    rows.splice(plannerIndex, 0, {
      id: `${operationLog.id}-section-plan`,
      text: 'Plan',
      isSection: true,
    });
  }
  const firstBlockIndex = rows.findIndex((row) =>
    row.contextScope === 'block' || typeof row.blockIndex === 'number'
  );
  if (firstBlockIndex >= 0) {
    rows.splice(firstBlockIndex, 0, {
      id: `${operationLog.id}-section-diagrams`,
      text: 'Diagrams',
      isSection: true,
    });
  }
  if (isRunning && lastLlmStartAt) {
    const remainingMs = Math.max(0, timeoutMs - (now - lastLlmStartAt));
    if (remainingMs > 0) {
      const countdown = formatCountdown(remainingMs);
      if (rows.length > 0) {
        rows[rows.length - 1] = {
          ...rows[rows.length - 1],
          timeLabel: countdown,
        };
      } else {
        rows.push({
          id: `${operationLog.id}-timeout`,
          text: '',
          timeLabel: countdown,
        });
      }
    }
  }
  if (!isRunning && operationLog.finishedAt) {
    const totalMs = Math.max(0, operationLog.finishedAt - operationLog.startedAt);
    for (const row of rows) {
      if (!row.isTerminal) continue;
      row.timeLabel = formatDuration(totalMs);
      break;
    }
  }
  for (const row of rows) {
    if (row.timeMs && !isRunning) {
      row.timeLabel = formatDuration(row.timeMs);
    }
  }

  return { summaryLabel, summaryLine, rows };
};
