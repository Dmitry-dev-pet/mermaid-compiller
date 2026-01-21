import type { OperationEvent, OperationLog } from '../../types';
import { parseBlockDetail } from './operationLogBlockDetailUtils';

export const formatEventParts = (event: OperationEvent): { labelText: string; contentText: string; text: string } => {
  const isBlockEvent = event.title.startsWith('Block');
  const titleOverride =
    event.title === 'Notebook build'
      ? 'Сборка'
      : event.title === 'Planner'
        ? 'План'
        : event.title === 'Notebook'
          ? 'Ноутбук'
          : event.title;
  const detail = event.detail?.trim() ?? '';

  if (isBlockEvent) {
    const parsedDetail = detail ? parseBlockDetail(detail) : null;
    if (typeof event.blockIndex === 'number' && parsedDetail) {
      const labelText = parsedDetail.label;
      const contentText = parsedDetail.rest;
      return { labelText, contentText, text: `${labelText} — ${contentText}` };
    }
    if (typeof event.blockIndex === 'number') {
      const labelText = `${event.blockIndex + 1}`;
      const contentText = detail || titleOverride;
      return { labelText, contentText, text: `${labelText} — ${contentText}` };
    }
    return { labelText: '', contentText: detail || titleOverride, text: detail || titleOverride };
  }

  if (detail) {
    const labelText = titleOverride;
    const contentText = detail;
    return { labelText, contentText, text: `${labelText} — ${contentText}` };
  }

  return { labelText: '', contentText: titleOverride, text: titleOverride };
};

export const formatAttemptIndicator = (attempt: OperationEvent['attempt']) => {
  if (!attempt) return '';
  const used = Math.max(0, attempt.current);
  const suffix = `${used}/${attempt.max}`;
  const blocks = used > 0 ? '■'.repeat(used) : '0';
  return `${blocks} ${suffix}`.trim();
};

export const formatPlannerLine = (countText: string) => {
  const count = Number(countText);
  if (!Number.isFinite(count) || count <= 0) {
    return 'Building plan';
  }
  return `Building plan (${count} diagrams)`;
};

export const buildSummary = (log: OperationLog) => {
  const errors = log.events.filter((e) => e.level === 'error').length;
  const total = log.events.length;
  const parts = [`Итог: событий ${total}`];
  if (errors) parts.push(`ошибок ${errors}`);
  return parts.join(' • ');
};

export const formatCountdown = (ms: number) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export const resolveLastLlmStartAt = (log: OperationLog) => {
  if (log.lastLLMStartedAt) return log.lastLLMStartedAt;
  for (let i = log.events.length - 1; i >= 0; i -= 1) {
    const event = log.events[i];
    if (event.title === 'LLM' && event.detail?.startsWith('start')) {
      return event.createdAt;
    }
  }
  return null;
};

export const resolveSummaryLabel = (firstTitle: string) => {
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

export const isHiddenOperationEvent = (event: OperationEvent) => {
  if (event.detail === 'start') return true;
  if (event.title === 'LLM') return true;
  if ((event.title === 'Notebook build' || event.title === 'Сборка') && event.detail === 'start') {
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

