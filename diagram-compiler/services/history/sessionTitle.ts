import type { Message } from '../../types';
import type { HistorySession } from './types';

export const formatDefaultSessionTitle = (createdAt: number) => {
  const iso = new Date(createdAt).toISOString().slice(0, 19).replace('T', ' ');
  return `Project ${iso}`;
};

export const isDefaultSessionTitle = (session: Pick<HistorySession, 'createdAt' | 'title'>) => {
  return (session.title ?? '') === formatDefaultSessionTitle(session.createdAt);
};

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

const isLikelyFiller = (value: string) => {
  const v = normalize(value).toLowerCase();
  if (!v) return true;
  if (/^\d+$/.test(v)) return true;
  if (v.length <= 2) return true;
  if (['ok', 'okay', 'да', 'нет', 'угу', 'ага', 'yo', 'lol'].includes(v)) return true;
  return false;
};

const firstLine = (value: string) => normalize(value).split(/\r?\n/)[0]?.trim() ?? '';

const cleanTitle = (value: string) => {
  const line = firstLine(value);
  return line.replace(/^[\s"'`«»]+|[\s"'`«»]+$/g, '').replace(/\s*[.。!！?？]+$/g, '').trim();
};

const extractTitleFromAssistant = (value: string) => {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const m =
      line.match(/^(?:\d+\.\s+|-\s+)(.+?)\s+—\s+(flowchart|er|sequence)\b/i) ??
      line.match(/^(.+?)\s+—\s+(flowchart|er|sequence)\b/i);
    if (m?.[1]) {
      const title = cleanTitle(m[1]);
      if (title && !isLikelyFiller(title)) return title;
    }
  }
  return '';
};

export const deriveAutoSessionTitle = (messages: Message[]) => {
  const firstUser = messages.find((m) => m.role === 'user' && m.content.trim().length > 0)?.content ?? '';
  const userCandidate = cleanTitle(firstUser);
  if (userCandidate && !isLikelyFiller(userCandidate) && userCandidate.length <= 80) {
    return userCandidate.slice(0, 60);
  }

  const firstAssistant = messages.find((m) => m.role === 'assistant' && m.content.trim().length > 0)?.content ?? '';
  const assistantCandidate = extractTitleFromAssistant(firstAssistant);
  if (assistantCandidate) return assistantCandidate.slice(0, 60);

  return '';
};
