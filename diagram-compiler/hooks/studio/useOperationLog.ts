import { useCallback, useMemo, useState } from 'react';
import type { OperationEvent, OperationLog, OperationPhase, OperationLevel } from '../../types';
import type { TimeStep } from '../../services/history/types';
import { generateId } from '../../utils';

export const extractOperationLogsFromSteps = (steps: TimeStep[]): OperationLog[] => {
  const logs: OperationLog[] = [];
  for (const step of steps) {
    const meta = step.meta as Record<string, unknown> | undefined;
    const opLog = meta?.operationLog as OperationLog | undefined;
    if (!opLog || !opLog.id) continue;
    logs.push(opLog);
  }
  return logs;
};

export const useOperationLog = () => {
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);

  const startOperation = useCallback((title: string) => {
    const id = generateId();
    const log: OperationLog = {
      id,
      status: 'running',
      startedAt: Date.now(),
      events: [
        {
          id: generateId(),
          opId: id,
          createdAt: Date.now(),
          phase: 'planning',
          level: 'info',
          title,
          detail: 'start',
        },
      ],
    };
    setOperationLogs((prev) => [...prev, log]);
    return id;
  }, []);

  const addOperationEvent = useCallback(
    (opId: string, args: { phase: OperationPhase; level: OperationLevel; title: string; detail?: string; blockIndex?: number; attempt?: OperationEvent['attempt']; metrics?: OperationEvent['metrics']; error?: OperationEvent['error'] }) => {
      setOperationLogs((prev) =>
        prev.map((log) => {
          if (log.id !== opId) return log;
          const event: OperationEvent = {
            id: generateId(),
            opId,
            createdAt: Date.now(),
            phase: args.phase,
            level: args.level,
            title: args.title,
            detail: args.detail,
            blockIndex: args.blockIndex,
            attempt: args.attempt,
            metrics: args.metrics,
            error: args.error,
          };
          return { ...log, events: [...log.events, event] };
        })
      );
    },
    []
  );

  const finishOperation = useCallback((opId: string, status: OperationLog['status']) => {
    setOperationLogs((prev) =>
      prev.map((log) =>
        log.id === opId
          ? {
              ...log,
              status,
              finishedAt: Date.now(),
              events: [
                ...log.events,
                {
                  id: generateId(),
                  opId,
                  createdAt: Date.now(),
                  phase: status === 'error' ? 'error' : 'done',
                  level: status === 'error' ? 'error' : 'info',
                  title: status === 'error' ? 'Failed' : 'Done',
                },
              ],
            }
          : log
      )
    );
  }, []);

  const getOperationLog = useCallback(
    (opId: string) => operationLogs.find((log) => log.id === opId) ?? null,
    [operationLogs]
  );

  const hydrateOperationLogs = useCallback((steps: TimeStep[]) => {
    const logs = extractOperationLogsFromSteps(steps);
    if (!logs.length) return;
    setOperationLogs((prev) => {
      const existingIds = new Set(prev.map((log) => log.id));
      const next = logs.filter((log) => !existingIds.has(log.id));
      return next.length ? [...prev, ...next] : prev;
    });
  }, []);

  const activeOperationLog = useMemo(() => {
    for (let i = operationLogs.length - 1; i >= 0; i -= 1) {
      if (operationLogs[i].status === 'running') return operationLogs[i];
    }
    return null;
  }, [operationLogs]);

  return {
    operationLogs,
    activeOperationLog,
    setOperationLogs,
    startOperation,
    addOperationEvent,
    finishOperation,
    getOperationLog,
    hydrateOperationLogs,
  };
};
