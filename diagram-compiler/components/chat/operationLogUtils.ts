import type { OperationEvent, OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';
import { getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';
import { normalizeDiagramType } from '../../utils/diagramTypes';
import {
  resolveDiagramTypeShortLabelFromText,
  stripDiagramTypeFromText,
  stripInnerBlockLabelFromContextText,
} from './operationLogTextUtils';

export type LogRow = {
  id: string;
  text: string;
  blockIndex?: number;
  kind?: 'block' | 'block_attempt' | 'block_validation' | 'attempt';
  key?: string;
  status?: 'ok' | 'err';
  diagramTypeLabel?: string;
  volumeTokens?: number;
  volumeLabel?: string;
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

const resolveNotebookTypes = (events: OperationEvent[]) => {
  const blockTypes = new Map<number, string>();
  for (const event of events) {
    if (typeof event.blockIndex !== 'number') continue;
    if (!event.detail) continue;
    if (event.title !== 'Block' && event.title !== 'Block attempt' && event.title !== 'Block validation') {
      continue;
    }
    if (blockTypes.has(event.blockIndex)) continue;
    const parsed = parseBlockDetail(event.detail);
    if (!parsed) continue;
    const [rawType] = parsed.rest.split(' - ');
    const normalized = normalizeDiagramType(rawType?.trim() ?? '') ?? rawType?.trim() ?? '';
    if (!normalized) continue;
    blockTypes.set(event.blockIndex, normalized);
  }
  const counts = new Map<string, number>();
  for (const type of blockTypes.values()) {
    const label = getDiagramTypeShortLabel(type as never);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) =>
    count > 1 ? `${label}×${count}` : label
  );
};

const isContextRowText = (text: string) => text.includes('Контекст') || text.toLowerCase().includes('context');

const formatCompactCount = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(value)}`;
};

const parseTokenEstimate = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d+(?:\.\d)?)\s*(k)?/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] ? Math.round(value * 1000) : Math.round(value);
};

const estimateTokensFromChars = (chars: number) => {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
};

const extractDocsTokensFromTooltip = (tooltipDocs?: string) => {
  const text = tooltipDocs ?? '';
  if (!text.trim()) return null;
  const match = text.match(/,\s*([0-9]+(?:\.[0-9])?k?)\s*tok\)/i);
  if (!match) return null;
  return parseTokenEstimate(match[1] ?? '');
};

const extractMessageTokensFromTooltip = (tooltipMessages?: string) => {
  const text = tooltipMessages ?? '';
  if (!text.trim()) return null;
  const startMatch = text.match(/(^|\n)Messages:\s*\n/i);
  if (!startMatch || startMatch.index === undefined) return null;
  const start = startMatch.index + startMatch[0].length;
  const tail = text.slice(start);
  const endIndex = tail.search(/\n\nDocs:\s*\n/i);
  const body = endIndex >= 0 ? tail.slice(0, endIndex) : tail;
  const chars = body.trim().length;
  const tokens = estimateTokensFromChars(chars);
  return tokens > 0 ? tokens : null;
};

const resolveVolumeForEvent = (event: OperationEvent): { volumeTokens: number; volumeLabel: string } | null => {
  const explicitTokens = event.metrics?.tokens;
  if (typeof explicitTokens === 'number' && Number.isFinite(explicitTokens) && explicitTokens > 0) {
    const label = `${formatCompactCount(explicitTokens)}`;
    return { volumeTokens: Math.round(explicitTokens), volumeLabel: label };
  }

  const isContext = event.kind === 'context' || event.title === 'Контекст';
  if (!isContext || !event.detail) return null;
  const msgMatch = event.detail.match(/messages:\s*\d+\s*\((\d+)\s*tok\)/i);
  const docsMatch = event.detail.match(/docs\s*\([^)]*?,\s*([0-9]+(?:\.[0-9])?k?)\s*tok\)/i);
  const msgTokens =
    (msgMatch ? parseTokenEstimate(msgMatch[1] ?? '') : null)
    ?? extractMessageTokensFromTooltip(event.tooltipMessages);
  const docsTokens =
    (docsMatch ? parseTokenEstimate(docsMatch[1] ?? '') : null)
    ?? extractDocsTokensFromTooltip(event.tooltipDocs);
  const total = (msgTokens ?? 0) + (docsTokens ?? 0);
  if (total <= 0) return null;
  return { volumeTokens: total, volumeLabel: `${formatCompactCount(total)}` };
};

const stripDiagramTypeFromRows = (rows: LogRow[], isRunning: boolean) => {
  for (const row of rows) {
    const typeLabel = resolveDiagramTypeShortLabelFromText(row.text);
    const stripped = stripInnerBlockLabelFromContextText(stripDiagramTypeFromText(row.text));
    row.text = stripped;
    if (typeLabel) {
      row.diagramTypeLabel = typeLabel;
    }

    if (typeLabel && isContextRowText(stripped)) {
      // Preserve countdown timers (mm:ss) if they were injected while running.
      const isCountdown = typeof row.timeLabel === 'string' && /^\d+:\d\d$/.test(row.timeLabel);
      if (!row.timeLabel || (!isCountdown && row.timeLabel.endsWith('s'))) {
        row.timeLabel = typeLabel;
      }
      if (!row.timeLabel) row.timeLabel = typeLabel;
    }
  }
};

const expandDocsListsInText = (text: string) => {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const docsMatch = line.match(/^(.*?\bdocs\b.*?:\s*)(.+)$/i);
    if (!docsMatch) {
      out.push(line);
      continue;
    }
    const [, , files] = docsMatch;
    const fileParts = files
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    out.push('docs:');
    if (fileParts.length) {
      out.push(...fileParts);
    } else if (files.trim()) {
      out.push(files.trim());
    }
  }
  return out.join('\n');
};

const parseDocsFileTokensFromTooltip = (tooltipDocs?: string) => {
  const text = tooltipDocs ?? '';
  if (!text.trim()) return new Map<string, number>();
  const map = new Map<string, number>();
  const re = /([A-Za-z0-9_.-]+\.(?:md|mdx))\s*\(([^)]+)\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(text))) {
    const file = match[1]?.trim() ?? '';
    const raw = match[2]?.trim() ?? '';
    const tokens = parseTokenEstimate(raw);
    if (!file || !tokens) continue;
    map.set(file, tokens);
  }
  return map;
};

const shouldDropContextHeaderLine = (row: LogRow, line: string) => {
  if (row.contextScope !== 'block' && typeof row.blockIndex !== 'number') return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^selection:\s*/i.test(trimmed)) return false;
  // If it's structured (key: value), keep it.
  if (trimmed.includes(':')) return false;
  // For block-scoped context rows, the first line is often the diagram title / block label
  // which duplicates what the block row already shows.
  return true;
};

const expandContextRowToVolumeRows = (row: LogRow): LogRow[] => {
  const isContext = row.eventKind === 'context' || row.text.startsWith('Контекст') || row.text.toLowerCase().startsWith('context');
  if (!isContext) return [row];

  const shouldCarryTime =
    typeof row.timeLabel === 'string'
    && (/^\d+:\d\d$/.test(row.timeLabel) || /s$/.test(row.timeLabel));
  const carriedTimeLabel = shouldCarryTime ? row.timeLabel : undefined;
  const baseRow = shouldCarryTime ? { ...row, timeLabel: undefined } : row;

  const splitIndex = row.text.indexOf(' — ');
  const label = splitIndex > 0 ? row.text.slice(0, splitIndex) : 'Контекст';
  const content = splitIndex > 0 ? row.text.slice(splitIndex + 3) : row.text;
  const normalizedContent = expandDocsListsInText(content);
  const lines = normalizedContent.split('\n').map((line) => line.trim()).filter(Boolean);

  const docsTokensByFile = parseDocsFileTokensFromTooltip(row.tooltipDocs);
  const messageTokens = extractMessageTokensFromTooltip(row.tooltipMessages);

  const out: LogRow[] = [];
  let idx = 0;
  let hasHeaderRow = false;

  const first = lines[0] ?? '';
  const isFirstMeta =
    /^messages:\s*/i.test(first)
    || /^docs:\s*$/i.test(first)
    || /^[A-Za-z0-9_.-]+\.(?:md|mdx)\b/i.test(first);
  if (first && !isFirstMeta) {
    if (shouldDropContextHeaderLine(row, first)) {
      idx = 1;
      hasHeaderRow = true;
    } else {
    out.push({
      ...baseRow,
      id: `${row.id}-sel`,
      text: `${label} — ${first}`,
      volumeTokens: undefined,
      volumeLabel: undefined,
      tooltipMessages: undefined,
      tooltipDocs: undefined,
    });
    idx = 1;
    hasHeaderRow = true;
    }
  }

  const remaining = lines.slice(idx);
  const msgLine = remaining.find((line) => /^messages:\s*\d+/i.test(line)) ?? '';
  const msgCountMatch = msgLine.match(/^messages:\s*(\d+)/i);
  const msgCount = msgCountMatch ? Number(msgCountMatch[1]) : null;
  if (msgCount !== null && Number.isFinite(msgCount)) {
    out.push({
      ...baseRow,
      id: `${row.id}-messages`,
      text: hasHeaderRow ? `messages: ${msgCount}` : `${label} — messages: ${msgCount}`,
      volumeTokens: messageTokens ?? undefined,
      volumeLabel: messageTokens ? `${formatCompactCount(messageTokens)}` : undefined,
      tooltipDocs: undefined,
    });
    hasHeaderRow = true;
  }

  const docsStartIndex = remaining.findIndex((line) => /^docs:\s*$/i.test(line));
  if (docsStartIndex >= 0) {
    const fileLines = remaining
      .slice(docsStartIndex + 1)
      .filter((line) => /^[A-Za-z0-9_.-]+\.(?:md|mdx)\b/i.test(line));
    for (const file of fileLines) {
      const normalizedFile = file.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const tokens = docsTokensByFile.get(normalizedFile) ?? null;
      out.push({
        ...baseRow,
        id: `${row.id}-doc-${normalizedFile}`,
        text: hasHeaderRow ? normalizedFile : `${label} — ${normalizedFile}`,
        volumeTokens: tokens ?? undefined,
        volumeLabel: tokens ? `${formatCompactCount(tokens)}` : undefined,
        tooltipMessages: undefined,
      });
      hasHeaderRow = true;
    }
  }

  if (out.length === 0) return [row];
  if (carriedTimeLabel && out.length > 0) {
    out[out.length - 1] = { ...out[out.length - 1], timeLabel: carriedTimeLabel };
  }
  return out;
};

const resolveTotalVolumeTokens = (rows: LogRow[]) => {
  let total = 0;
  for (const row of rows) {
    if (row.isSection) continue;
    if (typeof row.volumeTokens !== 'number') continue;
    if (!Number.isFinite(row.volumeTokens) || row.volumeTokens <= 0) continue;
    total += row.volumeTokens;
  }
  return total;
};

const formatEvent = (event: OperationEvent) => {
  const parts: string[] = [];
  const isBlockEvent = event.title.startsWith('Block');
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

const resolveSummaryLabel = (firstTitle: string) => {
  const normalized = firstTitle.trim().toLowerCase();
  if (normalized.startsWith('чат') || normalized === 'chat') {
    return { active: 'Thinking', done: 'Finished thinking' };
  }
  if (normalized.startsWith('анализ') || normalized.startsWith('analy')) {
    return { active: 'Analyzing', done: 'Finished analyzing' };
  }
  if (normalized.startsWith('исправ') || normalized === 'fix') {
    return { active: 'Fixing', done: 'Finished fixing' };
  }
  if (normalized.startsWith('пересбор') || normalized.startsWith('recomp')) {
    return { active: 'Recompiling', done: 'Finished recompiling' };
  }
  return { active: 'Building', done: 'Finished building' };
};

const isHiddenOperationEvent = (event: OperationEvent) => {
  if (event.detail === 'start') return true;
  if (event.title === 'LLM') return true;
  if (
    (event.title === 'Notebook build' || event.title === 'Сборка')
    && event.detail === 'start'
  ) {
    return true;
  }
  if (event.title === 'Чат' && event.detail?.includes('язык')) return true;
  if (event.title === 'Чат' && event.detail === 'нажата') return true;
  if (event.title === 'Чат' && event.detail === 'start') return true;
  if (event.title === 'Build' && (event.detail === 'нажата' || event.detail === 'pressed')) {
    return true;
  }
  return false;
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
    if (event.title === 'Итог' && event.detail) {
      const key = 'summary';
      const existingIndex = displayEvents.findIndex((entry) => entry.key === key);
      const detail = event.detail;
      if (detail === 'generating') {
        if (existingIndex === -1) {
          displayEvents.push({
            id: event.id,
            text: 'Итог — generating',
            key,
            kind: 'attempt',
          });
        }
        continue;
      }
      const nextText = detail.startsWith('ready')
        ? 'Итог — ready'
        : detail.startsWith('fallback')
          ? `Итог — ${detail}`
          : `Итог — ${detail}`;
      const nextEntry: LogRow = {
        id: event.id,
        text: nextText,
        key,
        kind: 'attempt',
        timeMs: event.metrics?.durationMs,
      };
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
      // Redundant: block status icon covers the "valid" result.
      continue;
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
      ...(resolveVolumeForEvent(event) ?? {}),
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

  // Expand context rows into single-line sub-rows so the volume column aligns to each line.
  const expandedRows: LogRow[] = [];
  for (const row of rows) {
    if (row.isSection) {
      expandedRows.push(row);
      continue;
    }
    expandedRows.push(...expandContextRowToVolumeRows(row));
  }
  rows = expandedRows;

  // Show total context volume on the terminal row (similar to total duration).
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

  // Final pass: strip diagram type from row text and show diagram type in the left column
  // on context rows (so it appears above the timed result row).
  stripDiagramTypeFromRows(rows, isRunning);

  return { summaryLabel, summaryLine, rows };
};
