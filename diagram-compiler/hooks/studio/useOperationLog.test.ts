import { describe, expect, it } from 'vitest';
import type { OperationLog } from '../../types';
import type { TimeStep } from '../../services/history/types';
import { extractOperationLogsFromSteps } from './useOperationLog';

describe('extractOperationLogsFromSteps', () => {
  it('deduplicates by operation id and keeps the latest snapshot', () => {
    const opId = 'op-1';
    const first: OperationLog = {
      id: opId,
      status: 'running',
      startedAt: 10,
      events: [{ id: 'e-1', opId, createdAt: 10, phase: 'planning', level: 'info', title: 'start' }],
    };
    const second: OperationLog = {
      id: opId,
      status: 'done',
      startedAt: 10,
      finishedAt: 20,
      events: [
        { id: 'e-1', opId, createdAt: 10, phase: 'planning', level: 'info', title: 'start' },
        { id: 'e-2', opId, createdAt: 20, phase: 'done', level: 'info', title: 'done' },
      ],
    };

    const other: OperationLog = {
      id: 'op-2',
      status: 'done',
      startedAt: 5,
      finishedAt: 6,
      events: [{ id: 'e-3', opId: 'op-2', createdAt: 5, phase: 'planning', level: 'info', title: 'start' }],
    };

    const steps: TimeStep[] = [
      { id: 's-1', sessionId: 'sess', index: 1, type: 'build', createdAt: 1, messages: [], currentRevisionId: null, meta: { operationLog: first } },
      { id: 's-2', sessionId: 'sess', index: 2, type: 'build', createdAt: 2, messages: [], currentRevisionId: null, meta: { operationLog: other } },
      { id: 's-3', sessionId: 'sess', index: 3, type: 'build', createdAt: 3, messages: [], currentRevisionId: null, meta: { operationLog: second } },
    ];

    const logs = extractOperationLogsFromSteps(steps);
    expect(logs).toHaveLength(2);
    expect(logs[0]?.id).toBe('op-2');
    expect(logs[1]?.id).toBe(opId);
    expect(logs[1]?.status).toBe('done');
    expect(logs[1]?.finishedAt).toBe(20);
    expect(logs[1]?.events).toHaveLength(2);
  });
});

