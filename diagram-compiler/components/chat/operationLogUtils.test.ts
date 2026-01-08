import { describe, expect, it } from 'vitest';
import type { OperationLog } from '../../types';
import { buildOperationLogViewModel } from './operationLogUtils';

const baseLog = (overrides?: Partial<OperationLog>): OperationLog => ({
  id: 'op-1',
  status: 'running',
  startedAt: 0,
  events: [
    {
      id: 'e-1',
      opId: 'op-1',
      createdAt: 0,
      phase: 'planning',
      level: 'info',
      title: 'Notebook build',
      detail: 'start',
    },
  ],
  ...overrides,
});

describe('buildOperationLogViewModel', () => {
  it('adds plan section and building plan line', () => {
    const log = baseLog({
      events: [
        {
          id: 'e-1',
          opId: 'op-1',
          createdAt: 0,
          phase: 'planning',
          level: 'info',
          title: 'Notebook build',
          detail: 'start',
        },
        {
          id: 'e-2',
          opId: 'op-1',
          createdAt: 10,
          phase: 'planning',
          level: 'info',
          title: 'Planner',
          detail: 'request',
        },
        {
          id: 'e-3',
          opId: 'op-1',
          createdAt: 20,
          phase: 'planning',
          level: 'info',
          title: 'Planner',
          detail: 'ready (3)',
          metrics: { durationMs: 1200 },
        },
      ],
    });

    const vm = buildOperationLogViewModel(log, { now: 1000, showSummaryLine: false });
    expect(vm.rows.some((row) => row.isSection && row.text === 'Plan')).toBe(true);
    expect(vm.rows.some((row) => row.text === 'Building plan (3 diagrams)')).toBe(true);
  });

  it('adds diagrams section before first block row', () => {
    const log = baseLog({
      status: 'done',
      finishedAt: 5000,
      events: [
        {
          id: 'e-1',
          opId: 'op-1',
          createdAt: 0,
          phase: 'planning',
          level: 'info',
          title: 'Notebook build',
          detail: 'start',
        },
        {
          id: 'e-2',
          opId: 'op-1',
          createdAt: 100,
          phase: 'build',
          level: 'info',
          title: 'Block',
          detail: '1/2 - flowchart - First diagram',
          blockIndex: 0,
        },
      ],
    });

    const vm = buildOperationLogViewModel(log, { now: 6000, showSummaryLine: false });
    const firstBlockIndex = vm.rows.findIndex((row) => row.blockIndex === 0);
    const diagramsIndex = vm.rows.findIndex((row) => row.isSection && row.text === 'Diagrams');
    expect(diagramsIndex).toBeGreaterThanOrEqual(0);
    expect(diagramsIndex).toBeLessThan(firstBlockIndex);
  });
});
