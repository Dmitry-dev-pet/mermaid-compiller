import type { OperationPhase } from '../../types';
import { runLLMRequest } from '../../services/llmRequestRunner';
import type { LLMRequestStartNotice } from '../../services/llmRequestRunner';
import type { StudioContext } from './actionsContext';
import type { StudioOperationHelpers } from './runStudioOperation';

type TimeoutNotice = {
  attempt: number;
  maxAttempts: number;
  error: Error;
  task: string;
};

type RunLLMArgs<T> = {
  task: string;
  phase: OperationPhase;
  run: () => Promise<T>;
  retries: number;
  timeoutMs: number;
  stageTitle?: string;
  stageContextScope?: import('../../types').OperationEvent['contextScope'];
  onTimeoutDetail?: (notice: TimeoutNotice) => string;
  onStart?: (notice: LLMRequestStartNotice) => void;
};

export type StudioOperationRunner = {
  runLLM: <T>(args: RunLLMArgs<T>) => Promise<T>;
};

export const createStudioOperationRunner = (
  ctx: Pick<StudioContext, 'onLLMRequestStart'>,
  helpers: Pick<StudioOperationHelpers, 'logEvent'>
): StudioOperationRunner => {
  const runLLM: StudioOperationRunner['runLLM'] = async (args) => {
    const stageTitle = args.stageTitle;
    let stageStarted = false;

    return runLLMRequest({
      task: args.task,
      run: args.run,
      retries: args.retries,
      timeoutMs: args.timeoutMs,
      onStart: (notice) => {
        ctx.onLLMRequestStart?.(notice);
        args.onStart?.(notice);
        helpers.logEvent({
          phase: args.phase,
          level: 'info',
          title: 'LLM',
          detail: `start ${notice.task}`,
          kind: 'status',
          contextScope: args.stageContextScope,
        });
        if (stageTitle && !stageStarted) {
          stageStarted = true;
          helpers.logEvent({
            phase: args.phase,
            level: 'info',
            title: stageTitle,
            detail: 'generating',
            kind: 'status',
            contextScope: args.stageContextScope,
          });
        }
      },
      onTimeout: (notice) => {
        const detail = args.onTimeoutDetail
          ? args.onTimeoutDetail(notice as unknown as TimeoutNotice)
          : `LLM timeout (${notice.attempt}/${notice.maxAttempts})`;
        helpers.logEvent({
          phase: args.phase,
          level: 'warn',
          title: 'Timeout',
          detail,
          kind: 'status',
          contextScope: args.stageContextScope,
        });
      },
      onFinish: (notice) => {
        helpers.logEvent({
          phase: args.phase,
          level: notice.status === 'success' ? 'info' : 'warn',
          title: 'LLM',
          detail: notice.status,
          metrics: { durationMs: notice.durationMs },
          kind: 'status',
          contextScope: args.stageContextScope,
        });
        if (stageTitle && notice.status === 'success') {
          helpers.logEvent({
            phase: args.phase,
            level: 'info',
            title: stageTitle,
            detail: 'ready',
            metrics: { durationMs: notice.durationMs },
            kind: 'status',
            contextScope: args.stageContextScope,
          });
        }
      },
    });
  };

  return { runLLM };
};

