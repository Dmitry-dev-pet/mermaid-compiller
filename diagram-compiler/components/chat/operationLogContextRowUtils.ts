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

export const stripDiagramTypeFromRows = (rows: LogRow[]) => {
  for (const row of rows) {
    const sourceText = row.contentText ?? row.text;
    const inferredLabel = row.diagramTypeLabel ?? resolveDiagramTypeShortLabelFromText(sourceText) ?? null;
    if (!row.diagramTypeLabel && inferredLabel) {
      row.diagramTypeLabel = inferredLabel;
    }
    const strippedContent = stripInnerBlockLabelFromContextText(
      row.diagramType
        ? stripDiagramTypeFromText(sourceText, row.diagramType)
        : sourceText
    );
    row.contentText = strippedContent;
    row.text = row.labelText ? `${row.labelText} — ${strippedContent}` : strippedContent;
    if (row.diagramTypeLabel && isContextRow(row)) {
      const isCountdown = typeof row.timeLabel === 'string' && /^\d+:\d\d$/.test(row.timeLabel);
      if (!row.timeLabel || (!isCountdown && row.timeLabel.endsWith('s'))) {
        row.timeLabel = row.diagramTypeLabel;
      }
      if (!row.timeLabel) row.timeLabel = row.diagramTypeLabel;
    }
  }
};
