import { describe, expect, it } from 'vitest';
import { buildOperationLogViewModel } from './operationLogViewModelBuilder';
import type { OperationLog } from '../../types';

const createEvent = (
  args: Partial<OperationLog['events'][number]> & { id: string; opId: string }
): OperationLog['events'][number] => ({
  createdAt: 1,
  phase: 'build',
  level: 'info',
  title: 'Event',
  ...args,
});

describe('buildOperationLogViewModel', () => {
  it('adds sections and error rows for block events', () => {
    const log: OperationLog = {
      id: 'op-1',
      status: 'running',
      startedAt: 10,
      events: [
        createEvent({ id: 'e-1', opId: 'op-1', title: 'Build', detail: 'start', phase: 'planning' }),
        createEvent({ id: 'e-2', opId: 'op-1', title: 'Planner', detail: 'ready (2)', contextScope: 'planner' }),
        createEvent({
          id: 'e-3',
          opId: 'op-1',
          title: 'Block',
          detail: '1/1 - flowchart - Fix block',
          blockIndex: 0,
        }),
        createEvent({
          id: 'e-4',
          opId: 'op-1',
          title: 'Block',
          detail: 'syntax error',
          blockIndex: 0,
          level: 'warn',
        }),
        createEvent({
          id: 'e-5',
          opId: 'op-1',
          title: 'Block validation',
          detail: 'invalid',
          blockIndex: 0,
          level: 'warn',
        }),
      ],
    };

    const viewModel = buildOperationLogViewModel(log, { timeoutMs: 5000, now: 1000 });
    const texts = viewModel.rows.map((row) => row.text);

    expect(texts).toContain('Plan');
    expect(texts).toContain('Diagrams');
    expect(texts.some((text) => text.startsWith('⚠️ syntax error'))).toBe(true);
  });

  it('adds countdown for running log and duration for finished log', () => {
    const running: OperationLog = {
      id: 'op-2',
      status: 'running',
      startedAt: 0,
      lastLLMStartedAt: 1,
      events: [
        createEvent({ id: 'r-1', opId: 'op-2', title: 'Build', detail: 'start', phase: 'planning' }),
        createEvent({ id: 'r-2', opId: 'op-2', title: 'Block', detail: '1/1 - flowchart', blockIndex: 0 }),
      ],
    };

    const runningView = buildOperationLogViewModel(running, { timeoutMs: 5000, now: 1000 });
    expect(runningView.summaryLabel).toBe('Building');
    expect(runningView.rows.some((row) => Boolean(row.timeLabel))).toBe(true);

    const finished: OperationLog = {
      id: 'op-3',
      status: 'done',
      startedAt: 0,
      finishedAt: 4000,
      events: [
        createEvent({ id: 'f-1', opId: 'op-3', title: 'Build', detail: 'start', phase: 'planning' }),
        createEvent({ id: 'f-2', opId: 'op-3', title: 'Done', detail: 'done', phase: 'done', level: 'info' }),
      ],
    };

    const finishedView = buildOperationLogViewModel(finished, { now: 5000 });
    expect(finishedView.summaryLine).not.toBeNull();
    expect(finishedView.rows.some((row) => row.timeLabel === '4.0s')).toBe(true);
  });

  it('adds diagram type badge from block text when diagramType is missing', () => {
    const cases = [
      { detail: '1/3 - flowchart - Timeline', expected: 'FC' },
      { detail: '2/3 - sequence - Handshake', expected: 'SD' },
      { detail: '3/3 - er - Model', expected: 'ER' },
      { detail: '1/1 - architecture - Services', expected: 'AR' },
    ];

    const log: OperationLog = {
      id: 'op-4',
      status: 'running',
      startedAt: 0,
      events: [
        createEvent({ id: 'b-1', opId: 'op-4', title: 'Build', detail: 'start', phase: 'planning' }),
        ...cases.map((item, index) =>
          createEvent({
            id: `b-${index + 2}`,
            opId: 'op-4',
            title: 'Block',
            detail: item.detail,
            blockIndex: index,
          })
        ),
      ],
    };

    const viewModel = buildOperationLogViewModel(log, { now: 1000 });
    for (const item of cases) {
      const row = viewModel.rows.find((entry) => entry.leftBadge?.text === item.expected);
      expect(row).toBeTruthy();
    }
  });
});
