import type { OperationEvent } from '../../types';

export const toRunnerContextEvent = (event: {
  title: string;
  detail?: string;
  tooltipMessages?: string;
  tooltipDocs?: string;
  kind?: OperationEvent['kind'];
  contextScope?: OperationEvent['contextScope'];
}) => ({
  title: event.title,
  detail: event.detail ?? '',
  tooltipMessages: event.tooltipMessages,
  tooltipDocs: event.tooltipDocs,
  kind: event.kind,
  contextScope: event.contextScope,
});

