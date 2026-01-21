import type { LogRow } from './operationLogViewModelTypes';
import {
  resolveDiagramTypeShortLabelFromText,
  stripDiagramTypeFromText,
  stripInnerBlockLabelFromContextText,
} from './operationLogTextUtils';

const isContextRowText = (text: string) => text.includes('Контекст') || text.toLowerCase().includes('context');

export const isContextRow = (row: LogRow) => {
  if (row.eventKind === 'context') return true;
  if (row.labelText && isContextRowText(row.labelText)) return true;
  return isContextRowText(row.text);
};

export const stripDiagramTypeFromRows = (rows: LogRow[], isRunning: boolean) => {
  for (const row of rows) {
    const sourceText = row.contentText ?? row.text;
    const typeLabel = resolveDiagramTypeShortLabelFromText(sourceText);
    const strippedContent = stripInnerBlockLabelFromContextText(stripDiagramTypeFromText(sourceText));
    row.contentText = strippedContent;
    row.text = row.labelText ? `${row.labelText} — ${strippedContent}` : strippedContent;
    if (typeLabel) {
      row.diagramTypeLabel = typeLabel;
    }

    if (typeLabel && isContextRow(row)) {
      const isCountdown = typeof row.timeLabel === 'string' && /^\d+:\d\d$/.test(row.timeLabel);
      if (!row.timeLabel || (!isCountdown && row.timeLabel.endsWith('s'))) {
        row.timeLabel = typeLabel;
      }
      if (!row.timeLabel) row.timeLabel = typeLabel;
    }
  }
};

