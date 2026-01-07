import type { DiagramIntent, Message } from '../types';
import { normalizeDiagramType } from './diagramTypes';

export type ResolvedIntent = {
  content: string;
  source: 'build' | 'chat' | 'fallback';
};

export const resolveIntentFromInput = (args: {
  prompt: string;
  diagramIntent: DiagramIntent | null;
  messages: Message[];
  allowFallback?: boolean;
  preferAssistant?: boolean;
  assistantMode?: Message['mode'];
}): ResolvedIntent | null => {
  const prompt = args.prompt.trim();
  if (prompt) return { content: prompt, source: 'build' };

  const diagramIntent = args.diagramIntent;
  if (diagramIntent?.content.trim()) {
    return {
      content: diagramIntent.content,
      source: diagramIntent.source ?? 'chat',
    };
  }

  const isStatusMessage = (message: Message) => {
    if (message.role !== 'assistant') return false;
    const content = message.content.trim();
    if (!content) return false;
    if (!/\n-\s/.test(content)) return false;
    return /^(Chat|Чат|Build|Сборка|Analyze|Анализ|Fix|Исправление|Notebook|Ноутбук|Planner|Планировщик)(:|\s|\n)/i
      .test(content);
  };

  if (args.preferAssistant) {
    const fallbackAssistant = args.messages
      .slice()
      .reverse()
      .find((m) => (
        m.id !== 'init'
        && m.role === 'assistant'
        && (!args.assistantMode || m.mode === args.assistantMode)
        && m.content.trim().length > 0
        && !isStatusMessage(m)
      ))?.content;
    if (fallbackAssistant) return { content: fallbackAssistant, source: 'chat' };
  }

  if (args.allowFallback === false) return null;

  const fallback = args.messages
    .slice()
    .reverse()
    .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;
  if (fallback) return { content: fallback, source: 'fallback' };

  return null;
};

export const normalizeIntentText = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';

  const dedupeRepeatedBlock = (text: string): string => {
    const marker = '## Summary';
    const normalized = text.trim();
    const secondIndex = normalized.indexOf(marker, marker.length);
    if (secondIndex === -1) return text;
    const head = normalized.slice(0, secondIndex).trim();
    const tail = normalized.slice(secondIndex).trim();
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    if (normalize(head) === normalize(tail)) {
      return head;
    }
    return text;
  };

  const withoutPrefix = trimmed.replace(/^intent:\s*/i, '');
  const sectionStart = withoutPrefix.search(/^##\s+/m);

  const isAllowedLine = (line: string) => {
    const value = line.trim();
    if (!value) return true;
    if (/^Intent:/i.test(value)) return true;
    if (/^##\s+/.test(value)) return true;
    if (/^[-*]\s+/.test(value)) return true;
    if (/^\d+\.\s+/.test(value)) return true;
    return false;
  };

  if (sectionStart >= 0) {
    const sectionLines = withoutPrefix.slice(sectionStart).split(/\r?\n/);
    const kept: string[] = [];
    for (const line of sectionLines) {
      if (!isAllowedLine(line)) break;
      kept.push(line);
    }
    const normalized = kept.join('\n').trim();
    if (normalized) return dedupeRepeatedBlock(normalized);
  }

  const lines = withoutPrefix.split(/\r?\n/);
  const kept: string[] = [];

  for (const line of lines) {
    if (!isAllowedLine(line)) break;
    kept.push(line);
  }

  const normalized = kept.join('\n').trim();
  return dedupeRepeatedBlock(normalized || withoutPrefix);
};

export const enforceAllowedDiagramTypesInIntent = (
  input: string,
  allowedTypes: readonly string[],
  fallbackType?: string
): string => {
  const trimmed = input.trim();
  if (!trimmed || !allowedTypes.length) return input;
  const fallback = fallbackType ?? allowedTypes[0];
  const lines = input.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^##\s+Diagrams\b/i.test(line.trim()));
  if (startIndex === -1) return input;

  const stopIndex = lines.findIndex((line, idx) => idx > startIndex && /^##\s+/.test(line.trim()));
  const endIndex = stopIndex === -1 ? lines.length : stopIndex;
  const separators = [' — ', ' - '];

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const line = lines[i];
    if (!/^\s*\d+\.\s+/.test(line)) continue;
    let updated = line;
    for (const separator of separators) {
      if (!updated.includes(separator)) continue;
      const parts = updated.split(separator);
      if (parts.length < 3) continue;
      const rawType = parts[1]?.trim() ?? '';
      const normalized = normalizeDiagramType(rawType);
      const nextType = normalized && allowedTypes.includes(normalized) ? normalized : fallback;
      parts[1] = nextType;
      updated = parts.join(separator);
      break;
    }
    lines[i] = updated;
  }

  return lines.join('\n');
};
