import type { OperationEvent } from '../../types';
import type { LogRow } from './operationLogViewModelTypes';
import { isContextRow } from './operationLogContextRowUtils';

export const formatCompactCount = (value: number) => {
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
  if (trimmed.includes(':')) return false;
  return true;
};

export const resolveVolumeForEvent = (event: OperationEvent): { volumeTokens: number; volumeLabel: string } | null => {
  const explicitTokens = event.metrics?.tokens;
  if (typeof explicitTokens === 'number' && Number.isFinite(explicitTokens) && explicitTokens > 0) {
    const label = `${formatCompactCount(explicitTokens)}`;
    return { volumeTokens: Math.round(explicitTokens), volumeLabel: label };
  }

  const isContext = event.kind === 'context' || event.title === 'Контекст';
  if (!isContext || !event.detail) return null;

  const metaMessageTokens = event.contextMeta?.messageTokens ?? null;
  const metaDocsTokens = event.contextMeta?.docsTokens?.reduce((sum, item) => sum + (item.tokens || 0), 0) ?? null;
  if ((metaMessageTokens ?? 0) > 0 || (metaDocsTokens ?? 0) > 0) {
    const total = (metaMessageTokens ?? 0) + (metaDocsTokens ?? 0);
    return { volumeTokens: total, volumeLabel: `${formatCompactCount(total)}` };
  }

  const msgMatch = event.detail.match(/messages:\s*\d+\s*\((\d+)\s*tok\)/i);
  const docsMatch = event.detail.match(/docs\s*\([^)]*?,\s*([0-9]+(?:\.[0-9])?k?)\s*tok\)/i);
  const msgTokens = (msgMatch ? parseTokenEstimate(msgMatch[1] ?? '') : null) ?? extractMessageTokensFromTooltip(event.tooltipMessages);
  const docsTokens = (docsMatch ? parseTokenEstimate(docsMatch[1] ?? '') : null) ?? extractDocsTokensFromTooltip(event.tooltipDocs);
  const total = (msgTokens ?? 0) + (docsTokens ?? 0);
  if (total <= 0) return null;
  return { volumeTokens: total, volumeLabel: `${formatCompactCount(total)}` };
};

export const expandContextRowToVolumeRows = (row: LogRow): LogRow[] => {
  const isContext = isContextRow(row);
  if (!isContext) return [row];

  const shouldCarryTime =
    typeof row.timeLabel === 'string'
    && (/^\d+:\d\d$/.test(row.timeLabel) || /s$/.test(row.timeLabel));
  const carriedTimeLabel = shouldCarryTime ? row.timeLabel : undefined;
  const baseRow = shouldCarryTime ? { ...row, timeLabel: undefined } : row;
  const subRowBase: LogRow = { ...baseRow, eventKind: undefined };

  const label = row.labelText ?? 'Контекст';
  const metaSelectionLine = row.contextMeta?.selectionLine?.trim() || '';
  const metaInputsLine = row.contextMeta?.inputsLine?.trim() || '';
  const metaDocsFiles = row.contextMeta?.docsFiles ?? null;
  const useMeta = Boolean(metaSelectionLine || metaInputsLine || (metaDocsFiles && metaDocsFiles.length));

  const content = row.contentText ?? row.text;
  const normalizedContent = expandDocsListsInText(content);
  const lines = normalizedContent.split('\n').map((line) => line.trim()).filter(Boolean);

  const docsTokensByFile = row.contextMeta?.docsTokens?.length
    ? new Map(row.contextMeta.docsTokens.map((item) => [item.file, item.tokens]))
    : parseDocsFileTokensFromTooltip(row.tooltipDocs);
  const messageTokens = row.contextMeta?.messageTokens ?? extractMessageTokensFromTooltip(row.tooltipMessages);

  const out: LogRow[] = [];
  let idx = 0;
  let hasHeaderRow = false;

  const first = useMeta ? metaSelectionLine : (lines[0] ?? '');
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
        ...subRowBase,
        id: `${row.id}-sel`,
        labelText: label,
        contentText: first,
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

  const remaining = useMeta
    ? [
        ...(metaInputsLine ? [metaInputsLine] : []),
        ...(metaDocsFiles?.length ? ['docs:', ...metaDocsFiles] : []),
      ]
    : lines.slice(idx);
  const isSelectionLine = (line: string) => /^selection:\s*/i.test(line);
  const isDocsHeaderLine = (line: string) => /^docs:\s*$/i.test(line);
  const isDocsFileLine = (line: string) => /^[A-Za-z0-9_.-]+\.(?:md|mdx)\b/i.test(line);
  const msgLine = remaining.find((line) => {
    if (!line.trim()) return false;
    if (isSelectionLine(line)) return false;
    if (isDocsHeaderLine(line)) return false;
    if (isDocsFileLine(line)) return false;
    return true;
  }) ?? '';
  const normalizedMsgLine = msgLine.trim();
  const displayMsgLine = (() => {
    const strippedPrefix = normalizedMsgLine.replace(/^messages:\s*/i, '').trim();
    if (/^\d+$/.test(strippedPrefix)) return `msgs×${strippedPrefix}`;
    if (/^\d+$/.test(normalizedMsgLine)) return `msgs×${normalizedMsgLine}`;
    return strippedPrefix || normalizedMsgLine;
  })();
  if (msgLine) {
    out.push({
      ...subRowBase,
      id: `${row.id}-messages`,
      labelText: hasHeaderRow ? '' : label,
      contentText: displayMsgLine,
      text: hasHeaderRow ? displayMsgLine : `${label} — ${displayMsgLine}`,
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
        ...subRowBase,
        id: `${row.id}-doc-${normalizedFile}`,
        labelText: hasHeaderRow ? '' : label,
        contentText: normalizedFile,
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

export const resolveTotalVolumeTokens = (rows: LogRow[]) => {
  let total = 0;
  for (const row of rows) {
    if (row.isSection) continue;
    if (typeof row.volumeTokens !== 'number') continue;
    if (!Number.isFinite(row.volumeTokens) || row.volumeTokens <= 0) continue;
    total += row.volumeTokens;
  }
  return total;
};

