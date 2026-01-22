import { normalizeDiagramType } from '../../utils/diagramTypes';

type SelectionSource = 'chat' | 'build' | 'fallback';

const parseIntentDiagrams = (intentText: string) => {
  const lines = intentText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^##\s+Diagrams\b/i.test(line.trim()));
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, idx) => idx > startIndex && /^##\s+/.test(line.trim()));
  const stopIndex = endIndex === -1 ? lines.length : endIndex;
  const items: Array<{ title: string; type: string; raw: string }> = [];
  for (let i = startIndex + 1; i < stopIndex; i += 1) {
    const line = lines[i].trim();
    if (!/^\d+\.\s+/.test(line)) continue;
    const parts = line.replace(/^\d+\.\s+/, '').split(/\s+[—-]\s+/);
    if (parts.length < 2) continue;
    const title = parts[0]?.trim() ?? '';
    const type = normalizeDiagramType(parts[1]?.trim() ?? '') ?? parts[1]?.trim() ?? '';
    if (!type) continue;
    items.push({ title, type, raw: line.replace(/^\d+\.\s+/, '').trim() });
  }
  return items;
};

const parseIntentTitle = (intentText: string) => {
  const lines = intentText.split(/\r?\n/).map((line) => line.trim());
  const titledIndex = lines.findIndex((line) => /^##\s+(Название|Title|Name)\b/i.test(line));
  if (titledIndex !== -1) {
    for (let i = titledIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (/^##\s+/.test(line)) break;
      return line.replace(/^[-*]\s+/, '');
    }
  }
  for (const line of lines) {
    if (!line) continue;
    if (/^##\s+/.test(line)) continue;
    const cleaned = line.replace(/^Intent:\s*/i, '').replace(/^[-*]\s+/, '');
    if (cleaned) return cleaned;
  }
  return '';
};

const sanitizeSelectionText = (value: string) => {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseIntentOptionsAndQuestions = (intentText: string) => {
  const lines = intentText.split(/\r?\n/);
  const options: string[] = [];
  const questions: string[] = [];
  let inQuestions = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(##\s+)?(Open questions|Questions|Вопросы)/i.test(line)) {
      inQuestions = true;
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    const bulleted = line.match(/^\s*[-*]\s+(.*)$/);
    if (numbered) {
      const value = sanitizeSelectionText(numbered[1] ?? '');
      if (value) (inQuestions ? questions : options).push(value);
      continue;
    }
    if (bulleted && inQuestions) {
      const value = sanitizeSelectionText(bulleted[1] ?? '');
      if (value) questions.push(value);
    }
  }
  return { options, questions };
};

export const formatSelectionNote = (intentText: string, diagramType: string, source: SelectionSource) => {
  const items = parseIntentDiagrams(intentText);
  const normalizedType = normalizeDiagramType(diagramType) ?? diagramType;
  const sourceLabel = source === 'chat' ? 'чат' : source === 'build' ? 'build' : 'fallback';
  const matches = items.filter((item) => item.type === normalizedType);
  if (matches.length) {
    const picked = matches.map((item) => item.raw).join('; ');
    return `Выбрано: ${picked} (источник: ${sourceLabel}).`;
  }
  const { options, questions } = parseIntentOptionsAndQuestions(intentText);
  if (options.length || questions.length) {
    const parts: string[] = [];
    if (options.length) {
      parts.push(`Выбрано из предложений (${options.length}): ${options.join('; ')}`);
    }
    if (questions.length) {
      parts.push(`Вопросы из чата (${questions.length}): ${questions.join('; ')}`);
    }
    return `${parts.join('. ')} (источник: ${sourceLabel}).`;
  }
  const title = parseIntentTitle(intentText);
  if (title) {
    return `Выбрано: ${title} — ${normalizedType} (источник: ${sourceLabel}).`;
  }
  return `Выбрано: ${normalizedType} (источник: ${sourceLabel}).`;
};
