import type { OperationEvent, OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';
import type { LogRow, OperationLogViewModel } from './operationLogViewModelTypes';
import { resolveNotebookTypes } from './operationLogBlockDetailUtils';
import { stripDiagramTypeFromRows } from './operationLogContextRowUtils';
import { buildViewRows } from './operationLogRowViewUtils';
import {
  buildSummary,
  formatAttemptIndicator,
  formatCountdown,
  formatDuration,
  formatEventParts,
  formatPlannerLine,
  isHiddenOperationEvent,
  resolveLastLlmStartAt,
  resolveSummaryLabel,
} from './operationLogEventFormattingUtils';
import {
  expandContextRowToVolumeRows,
  formatCompactCount,
  resolveTotalVolumeTokens,
  resolveVolumeForEvent,
} from './operationLogTokenVolumeUtils';

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
  const labels = resolveSummaryLabel(firstTitle);
  const summaryLabel = isRunning ? labels.active : labels.done;
  const summaryLine = !isRunning && showSummaryLine ? buildSummary(operationLog) : null;
  const lastLlmStartAt = resolveLastLlmStartAt(operationLog);

  const statusByBlock = new Map<number, 'ok' | 'err'>();
  const errorEventsByBlock = new Map<number, Array<{ id: string; text: string }>>();
  const displayEvents: LogRow[] = [];
  for (let i = 0; i < operationLog.events.length; i += 1) {
    const event = operationLog.events[i];
    if (isHiddenOperationEvent(event)) continue;
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
        const durationMs = nextReady.metrics?.durationMs;
        const key = 'planner';
        const nextEntry: LogRow = {
          id: nextReady.id,
          text: formatPlannerLine(count),
          kind: 'attempt',
          key,
          timeMs: durationMs,
        };
        const existingIndex = displayEvents.findIndex((row) => row.key === key);
        if (existingIndex >= 0) {
          displayEvents[existingIndex] = { ...displayEvents[existingIndex], ...nextEntry };
        } else {
          displayEvents.push(nextEntry);
        }
        continue;
      }
    }

    if (event.title === 'Planner' && event.detail?.startsWith('ready')) {
      const match = event.detail.match(/\((\d+)\)/);
      const count = match?.[1] ?? '';
      const durationMs = event.metrics?.durationMs;
      const key = 'planner';
      const nextEntry: LogRow = {
        id: event.id,
        text: formatPlannerLine(count),
        kind: 'attempt',
        key,
        timeMs: durationMs,
      };
      const existingIndex = displayEvents.findIndex((row) => row.key === key);
      if (existingIndex >= 0) {
        displayEvents[existingIndex] = { ...displayEvents[existingIndex], ...nextEntry };
      } else {
        displayEvents.push(nextEntry);
      }
      continue;
    }

    if (event.title === 'Notebook build' && event.detail?.startsWith('N=')) {
      const key = 'notebook-build';
      const types = resolveNotebookTypes(operationLog.events);
      const suffix = types.length ? ` (${types.join('/')})` : '';
      const entry: LogRow = {
        id: event.id,
        text: `Сборка — ${event.detail}${suffix}`,
        kind: 'attempt',
        key,
      };
      const existingIndex = displayEvents.findIndex((row) => row.key === key);
      if (existingIndex >= 0) {
        displayEvents[existingIndex] = { ...displayEvents[existingIndex], ...entry };
      } else {
        displayEvents.push(entry);
      }
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
      continue;
    }

    if (event.attempt) {
      const key = `${event.title}:${event.blockIndex ?? 'na'}`;
      const indicator = formatAttemptIndicator(event.attempt);
      const base = formatEventParts(event);
      const attemptText = event.attempt.current > 1 && indicator ? `${base.text} — ${indicator}` : base.text;
      const attemptContentText =
        event.attempt.current > 1 && indicator ? `${base.contentText} — ${indicator}` : base.contentText;
      let updated = false;
      for (let j = displayEvents.length - 1; j >= 0; j -= 1) {
        const prev = displayEvents[j];
        if (prev.key !== key) continue;
        if (prev.kind !== 'attempt' && prev.kind !== 'block_attempt') continue;
        prev.text = attemptText;
        prev.labelText = base.labelText;
        prev.contentText = attemptContentText;
        updated = true;
        break;
      }
      if (!updated) {
        displayEvents.push({
          id: event.id,
          text: attemptText,
          labelText: base.labelText,
          contentText: attemptContentText,
          blockIndex: event.blockIndex,
          kind: event.title === 'Block attempt' ? 'block_attempt' : 'attempt',
          key,
        });
      }
      continue;
    }

    const kind =
      event.title === 'Block attempt'
        ? 'block_attempt'
        : event.title === 'Block validation'
          ? 'block_validation'
          : event.title === 'Block'
            ? 'block'
            : undefined;
    const formatted = formatEventParts(event);
    displayEvents.push({
      id: event.id,
      text: formatted.text,
      labelText: formatted.labelText,
      contentText: formatted.contentText,
      blockIndex: event.blockIndex,
      kind,
      ...(resolveVolumeForEvent(event) ?? {}),
      timeMs: event.metrics?.durationMs,
      isTerminal: event.title === 'Done' || event.title === 'Failed',
      tooltipMessages: event.tooltipMessages ?? event.tooltip,
      tooltipDocs: event.tooltipDocs ?? event.tooltip,
      eventKind: event.kind,
      contextScope: event.contextScope,
      contextMeta: event.contextMeta,
    });
  }

  const decoratedEvents: LogRow[] = displayEvents.map((event) => {
    if (typeof event.blockIndex !== 'number') return event;
    if (event.kind !== 'block' && event.kind !== 'block_attempt') return event;
    const status = statusByBlock.get(event.blockIndex);
    if (!status) return event;
    return { ...event, status };
  });

  let rows: LogRow[] = [];
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
    row.eventKind === 'planner'
    || row.contextScope === 'planner'
    || row.text.startsWith('Building plan')
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
  const firstSummaryIndex = rows.findIndex((row) =>
    row.contextScope === 'summary'
    || row.text.startsWith('Итог')
    || row.text.toLowerCase().startsWith('summary')
  );
  if (firstSummaryIndex >= 0) {
    rows.splice(firstSummaryIndex, 0, {
      id: `${operationLog.id}-section-result`,
      text: 'Result',
      isSection: true,
    });
  }
  if (isRunning && lastLlmStartAt) {
    const remainingMs = Math.max(0, timeoutMs - (now - lastLlmStartAt));
    if (remainingMs > 0) {
      const countdown = formatCountdown(remainingMs);
      const summaryIndex = rows.findIndex((row) => row.key === 'summary');
      if (summaryIndex >= 0) {
        rows[summaryIndex] = {
          ...rows[summaryIndex],
          timeLabel: countdown,
        };
      } else if (rows.length > 0) {
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

  const expandedRows: LogRow[] = [];
  for (const row of rows) {
    if (row.isSection) {
      expandedRows.push(row);
      continue;
    }
    expandedRows.push(...expandContextRowToVolumeRows(row));
  }
  rows = expandedRows;

  if (!isRunning) {
    const totalTokens = resolveTotalVolumeTokens(rows);
    if (totalTokens > 0) {
      const terminalIndex = rows.findIndex((row) => row.isTerminal);
      const targetIndex = terminalIndex >= 0 ? terminalIndex : Math.max(0, rows.length - 1);
      if (rows[targetIndex]) {
        rows[targetIndex] = {
          ...rows[targetIndex],
          volumeTokens: totalTokens,
          volumeLabel: `${formatCompactCount(totalTokens)}`,
        };
      }
    }
  }

  stripDiagramTypeFromRows(rows, isRunning);

  const viewRows = buildViewRows(rows);
  return { summaryLabel, summaryLine, rows: viewRows };
};

