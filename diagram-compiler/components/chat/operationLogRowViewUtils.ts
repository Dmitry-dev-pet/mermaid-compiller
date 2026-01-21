import type { LogRow, OperationLogRowView } from './operationLogViewModelTypes';
import { isContextRow } from './operationLogContextRowUtils';

export const buildViewRows = (rows: LogRow[]): OperationLogRowView[] => {
  return rows.map((row, index) => {
    if (row.isSection) {
      return {
        id: row.id,
        isSection: true,
        text: row.text,
        leftLabel: '',
        blockIndex: row.blockIndex,
      };
    }

    const rawText = row.text ?? '';
    let labelText = row.labelText ?? '';
    let contentText = row.contentText ?? rawText;
    const hasLabel = Boolean(labelText);
    const isContextTextRow = isContextRow(row);
    const isTimeLabelCountdown = typeof row.timeLabel === 'string' && /^\d+:\d\d$/.test(row.timeLabel);
    const isTimeLabelDuration = typeof row.timeLabel === 'string' && /s$/.test(row.timeLabel);
    const isTimeLabelDiagramType = Boolean(row.timeLabel) && isContextTextRow && !isTimeLabelCountdown && !isTimeLabelDuration;
    const isNumericLabel = /^\d+(?:\/\d+)?$/.test(labelText.trim());
    const isBlockRow = row.kind === 'block' || row.kind === 'block_attempt' || row.kind === 'block_validation';
    if (isNumericLabel && row.blockIndex !== undefined && !isBlockRow) {
      labelText = '';
      if (!hasLabel) contentText = rawText;
    }
    if (!labelText && isContextTextRow && contentText.includes(' — ')) {
      const innerSplit = contentText.indexOf(' — ');
      const innerLabel = contentText.slice(0, innerSplit).trim();
      if (innerLabel.toLowerCase() === 'контекст' || innerLabel.toLowerCase() === 'context') {
        contentText = contentText.slice(innerSplit + 3);
      }
    }
    const baseLeftLabel = labelText || (isContextTextRow ? 'Контекст' : '');
    const leftLabel = isTimeLabelDiagramType && row.timeLabel ? `${row.timeLabel} ${baseLeftLabel}`.trim() : baseLeftLabel;
    const timeLabel = isTimeLabelDiagramType ? '' : (row.timeLabel ?? '');
    const leftBadge = isBlockRow && row.diagramTypeLabel ? { text: row.diagramTypeLabel, status: row.status } : undefined;
    const prev = rows[index - 1];
    const isNewBlock = typeof row.blockIndex === 'number' && typeof prev?.blockIndex === 'number' && row.blockIndex !== prev.blockIndex;

    return {
      id: row.id,
      text: contentText,
      leftLabel,
      leftBadge,
      volumeLabel: row.volumeLabel,
      timeLabel,
      isNewBlock,
      tooltipMessages: row.tooltipMessages,
      tooltipDocs: row.tooltipDocs,
      contextScope: row.contextScope,
      blockIndex: row.blockIndex,
    };
  });
};

