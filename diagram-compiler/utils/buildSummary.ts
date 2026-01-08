export const normalizeSummaryText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const spaced = trimmed.replace(/([.!?])([A-Za-zА-Яа-я])/g, '$1 $2');
  const prefixMatch = spaced.match(/^(Итог:|Summary:)\s*/i);
  const prefix = prefixMatch?.[0] ?? '';
  const rest = prefix ? spaced.slice(prefix.length).trim() : spaced;
  const sentences = rest
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const sentence of sentences) {
    if (unique[unique.length - 1] === sentence) continue;
    if (!unique.includes(sentence)) {
      unique.push(sentence);
    }
  }
  const rebuilt = unique.join(' ').trim();
  return `${prefix}${rebuilt}`.trim();
};

export const sanitizeSummaryText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fencedMatch?.[1] ?? trimmed).trim();
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const content = typeof parsed.content === 'string' ? parsed.content.trim() : '';
      if (content) return content;
      const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
      if (summary) return summary;
    }
  } catch {
    // ignore parse errors, fall back to raw text
  }
  return candidate;
};
