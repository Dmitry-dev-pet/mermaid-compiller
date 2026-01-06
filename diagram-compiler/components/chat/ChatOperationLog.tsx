import React from 'react';
import type { OperationEvent, OperationLog } from '../../types';

type Props = {
  operationLog: OperationLog;
  showSummaryLine?: boolean;
};

type DisplayEvent = {
  id: string;
  text: string;
  blockIndex?: number;
  kind?: 'block' | 'block_attempt' | 'block_validation' | 'attempt';
  key?: string;
  status?: 'ok' | 'err';
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
  const parsedDetail = event.detail ? parseBlockDetail(event.detail) : null;
  if (typeof event.blockIndex === 'number' && parsedDetail) {
    parts.push(parsedDetail.label);
    parts.push(parsedDetail.rest);
  }
  if (parts.length === 0 && typeof event.blockIndex === 'number') {
    parts.push(`${event.blockIndex + 1}`);
  }
  if (!isBlockEvent) {
    parts.push(event.title);
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

const buildSummary = (log: OperationLog) => {
  const errors = log.events.filter((e) => e.level === 'error').length;
  const total = log.events.length;
  const parts = [`Итог: событий ${total}`];
  if (errors) parts.push(`ошибок ${errors}`);
  return parts.join(' • ');
};

const ChatOperationLog: React.FC<Props> = ({ operationLog, showSummaryLine = true }) => {
  const hasFinishedEvent = operationLog.events.some(
    (event) => event.phase === 'done' || event.title === 'Done' || event.title === 'Failed'
  );
  const isRunning = operationLog.status === 'running' && !hasFinishedEvent;
  const summaryLabel = isRunning ? 'Working' : 'Finished working';
  const summaryLine = !isRunning && showSummaryLine ? buildSummary(operationLog) : null;
  const statusByBlock = new Map<number, 'ok' | 'err'>();
  const errorEventsByBlock = new Map<number, Array<{ id: string; text: string }>>();
  const displayEvents: DisplayEvent[] = [];
  for (let i = 0; i < operationLog.events.length; i += 1) {
    const event = operationLog.events[i];
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
        if (hasAttemptEntry) continue;
      }
      const hasAttempt = operationLog.events
        .slice(i + 1)
        .some((next) => next.title === 'Block attempt' && next.blockIndex === event.blockIndex);
      if (hasAttempt) continue;
    }

    if (event.title === 'Block' && event.detail && typeof event.blockIndex === 'number') {
      const isErrorLevel = event.level === 'warn' || event.level === 'error';
      if (isErrorLevel) {
        for (let j = displayEvents.length - 1; j >= 0; j -= 1) {
          const prev = displayEvents[j];
          if (prev.kind !== 'block_attempt') continue;
          if (prev.blockIndex !== event.blockIndex) continue;
          if (!prev.text.includes('ошибка:')) {
            prev.text = `${prev.text} — ошибка: ${event.detail}`;
          }
          return;
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
    const nextEvent: DisplayEvent = {
      id: event.id,
      text: formatEvent(event),
      blockIndex: event.blockIndex,
      kind,
    };
    const prev = displayEvents[displayEvents.length - 1];
    if (prev && prev.text === nextEvent.text && prev.kind === nextEvent.kind && prev.blockIndex === nextEvent.blockIndex) {
      continue;
    }
    displayEvents.push(nextEvent);
  }

  const decoratedEvents = displayEvents.map((event) => {
    if (typeof event.blockIndex !== 'number') return event;
    if (event.kind !== 'block' && event.kind !== 'block_attempt') return event;
    const status = statusByBlock.get(event.blockIndex);
    if (!status) return event;
    const suffix = status === 'ok' ? '✅' : '⚠️';
    return { ...event, text: `${event.text} ${suffix}`, status };
  });

  const rows: DisplayEvent[] = [];
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

  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      <details className="text-[11px] text-slate-500 dark:text-slate-400" open={isRunning}>
        <summary className="cursor-pointer list-none">{summaryLabel}</summary>
        <div className="mt-1 space-y-1">
          {rows.map((event) => (
            <div key={event.id} className="flex items-start gap-2 text-[11px] leading-snug">
              <span className="text-slate-400 dark:text-slate-500">-</span>
              <span className="flex-1 whitespace-pre-wrap break-words">{event.text}</span>
            </div>
          ))}
        </div>
      </details>
      {summaryLine && (
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap truncate">
          {summaryLine}
        </div>
      )}
    </div>
  );
};

export default ChatOperationLog;
