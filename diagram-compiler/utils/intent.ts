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
