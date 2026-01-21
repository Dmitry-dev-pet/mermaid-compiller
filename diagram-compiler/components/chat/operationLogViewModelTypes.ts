import type { OperationEvent } from '../../types';

export type LogRow = {
  id: string;
  text: string;
  labelText?: string;
  contentText?: string;
  blockIndex?: number;
  kind?: 'block' | 'block_attempt' | 'block_validation' | 'attempt';
  key?: string;
  status?: 'ok' | 'err';
  diagramTypeLabel?: string;
  contextMeta?: OperationEvent['contextMeta'];
  volumeTokens?: number;
  volumeLabel?: string;
  timeMs?: number;
  timeLabel?: string;
  isTerminal?: boolean;
  isSection?: boolean;
  tooltipMessages?: string;
  tooltipDocs?: string;
  eventKind?: OperationEvent['kind'];
  contextScope?: OperationEvent['contextScope'];
};

export type OperationLogTextRow = {
  id: string;
  text: string;
  tooltipMessages?: string;
  tooltipDocs?: string;
  contextScope?: OperationEvent['contextScope'];
  blockIndex?: number;
};

export type OperationLogRowView = OperationLogTextRow & {
  leftLabel: string;
  leftBadge?: { text: string; status?: 'ok' | 'err' };
  volumeLabel?: string;
  timeLabel?: string;
  isNewBlock?: boolean;
  isSection?: boolean;
  blockIndex?: number;
};

export type OperationLogViewModel = {
  summaryLabel: string;
  summaryLine: string | null;
  rows: OperationLogRowView[];
};

