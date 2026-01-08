import React, { useEffect, useMemo, useState } from 'react';
import type { OperationEvent, OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';

type Props = {
  operationLog: OperationLog;
  showSummaryLine?: boolean;
  timeoutMs?: number;
};

type DisplayEvent = {
  id: string;
  text: string;
  blockIndex?: number;
  kind?: 'block' | 'block_attempt' | 'block_validation' | 'attempt';
  key?: string;
  status?: 'ok' | 'err';
  timeMs?: number;
  timeLabel?: string;
  isTerminal?: boolean;
  meta?: Record<string, unknown>;
  isSection?: boolean;
  tooltip?: string;
  tooltipMessages?: string;
  tooltipDocs?: string;
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

const ChatOperationLog: React.FC<Props> = ({ operationLog, showSummaryLine = true, timeoutMs = LLM_TIMEOUT_MS }) => {
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
  const [remainingMs, setRemainingMs] = useState(0);
  const [pinnedTooltip, setPinnedTooltip] = useState<string | null>(null);
  const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  const lastLlmStartAt = useMemo(() => {
    if (operationLog.lastLLMStartedAt) return operationLog.lastLLMStartedAt;
    for (let i = operationLog.events.length - 1; i >= 0; i -= 1) {
      const event = operationLog.events[i];
      if (event.title === 'LLM' && event.detail?.startsWith('start')) {
        return event.createdAt;
      }
    }
    return null;
  }, [operationLog.events, operationLog.lastLLMStartedAt]);

  useEffect(() => {
    if (!isRunning || !lastLlmStartAt) {
      setRemainingMs(0);
      return;
    }
    const update = () => {
      const elapsed = Date.now() - lastLlmStartAt;
      const next = Math.max(0, timeoutMs - elapsed);
      setRemainingMs(next);
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [isRunning, lastLlmStartAt, timeoutMs]);

  useEffect(() => {
    if (!pinnedTooltip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinnedTooltip(null);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        setPinnedTooltip(null);
        return;
      }
      const wrapper = target.closest('[data-tooltip-id]');
      if (!wrapper) setPinnedTooltip(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pinnedTooltip]);

  const statusByBlock = new Map<number, 'ok' | 'err'>();
  const errorEventsByBlock = new Map<number, Array<{ id: string; text: string }>>();
  const displayEvents: DisplayEvent[] = [];
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
    const nextEvent: DisplayEvent = {
      id: event.id,
      text: formatEvent(event),
      blockIndex: event.blockIndex,
      kind,
      timeMs: event.metrics?.durationMs,
      isTerminal: event.title === 'Done' || event.title === 'Failed',
      meta: event.metrics ? { ...event.metrics } : undefined,
      tooltip: event.tooltip,
      tooltipMessages: event.tooltipMessages ?? event.tooltip,
      tooltipDocs: event.tooltipDocs ?? event.tooltip,
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
  const plannerIndex = rows.findIndex((row) =>
    row.text.startsWith('Контекст — planner') || row.text.startsWith('Building plan')
  );
  if (plannerIndex >= 0) {
    rows.splice(plannerIndex, 0, {
      id: `${operationLog.id}-section-plan`,
      text: 'Plan',
      isSection: true,
    });
  }
  const firstBlockIndex = rows.findIndex((row) => typeof row.blockIndex === 'number');
  if (firstBlockIndex >= 0) {
    rows.splice(firstBlockIndex, 0, {
      id: `${operationLog.id}-section-diagrams`,
      text: 'Diagrams',
      isSection: true,
    });
  }
  if (isRunning && remainingMs > 0) {
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
  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      <details className="text-[11px] text-slate-500 dark:text-slate-400" open={isRunning}>
        <summary className="cursor-pointer list-none">{summaryLabel}</summary>
        <div className="mt-1 space-y-1">
          {rows.map((event) => (
            <div key={event.id} className="flex items-start gap-2 text-[11px] leading-snug">
              {event.isSection ? (
                <span className="flex-1 uppercase tracking-wide text-[10px] text-slate-400 dark:text-slate-500">
                  {event.text}
                </span>
              ) : (
                <>
                  <span className="text-slate-400 dark:text-slate-500">-</span>
                  <span className="w-[3.5rem] text-right text-slate-400 dark:text-slate-500 tabular-nums">
                    {event.timeLabel ?? ''}
                  </span>
                  <div className="flex-1 break-words">
                    {(() => {
                      const hasTooltip = Boolean(event.tooltipMessages || event.tooltipDocs || event.tooltip);
                      if (!hasTooltip) return <div className="whitespace-pre-wrap">{event.text}</div>;
                      const lines = event.text.split('\n');
                      const renderLine = (line: string, index: number) => {
                        const messageMatch = event.tooltipMessages
                          ? line.match(/^(.*?)(messages:\s.*)$/i)
                          : null;
                        if (messageMatch && event.tooltipMessages) {
                          const [, prefix, messageText] = messageMatch;
                          const tooltipId = `${event.id}-messages`;
                          const isPinned = pinnedTooltip === tooltipId;
                          return (
                            <span key={`line-${index}`} className="inline-flex items-center gap-1">
                              {prefix ? <span>{prefix}</span> : null}
                              <span
                                className="group relative inline-flex items-center gap-1 cursor-help"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setPinnedTooltip((prev) => (prev === tooltipId ? null : tooltipId));
                                }}
                              >
                                <span className="underline decoration-dotted" data-tooltip-id={tooltipId}>{messageText}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
                                <span
                                  aria-hidden
                                  className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
                                >
                                  Нажмите для подробностей
                                </span>
                                <span
                                  id={tooltipId}
                                  tabIndex={-1}
                                  aria-hidden={!isPinned}
                                  className={`absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg transition-opacity whitespace-pre-wrap ${isPinned ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none group-hover:pointer-events-none'}`}
                                >
                                  {event.tooltipMessages}
                                </span>
                              </span>
                            </span>
                          );
                        }
                        const match = line.match(/^(.*?\bdocs\b.*?:\s*)(.+)$/i);
                        if (!match) {
                          return <span key={`line-${index}`}>{line}</span>;
                        }
                        const [_, prefix, files] = match;
                        const docsTooltipId = `${event.id}-docs-${index}`;
                        const isPinned = pinnedTooltip === docsTooltipId;
                        return (
                          <span key={`line-${index}`} className="inline-flex flex-wrap items-center gap-1">
                            <span>{prefix}</span>
                            <span
                              className="group relative inline-flex items-center gap-1 cursor-help"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                setPinnedTooltip((prev) => (prev === docsTooltipId ? null : docsTooltipId));
                              }}
                            >
                              <span className="underline decoration-dotted" data-tooltip-id={docsTooltipId}>{files}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
                              >
                                Нажмите для подробностей
                              </span>
                              <span
                                id={docsTooltipId}
                                tabIndex={-1}
                                aria-hidden={!isPinned}
                                className={`absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg transition-opacity whitespace-pre-wrap ${isPinned ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none group-hover:pointer-events-none'}`}
                              >
                                {event.tooltipDocs ?? ''}
                              </span>
                            </span>
                          </span>
                        );
                      };
                      return lines.map((line, index) => (
                        <div key={`line-${index}`} className="whitespace-pre-wrap">
                          {renderLine(line, index)}
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
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
