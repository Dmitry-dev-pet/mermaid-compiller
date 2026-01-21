import { useCallback, useMemo, useRef, useState } from 'react';
import type { OperationEvent, OperationLog, OperationPhase, OperationLevel } from '../../types';
import type { TimeStep } from '../../services/history/types';
import { generateId } from '../../utils';

export const extractOperationLogsFromSteps = (steps: TimeStep[]): OperationLog[] => {
  const byId = new Map<string, OperationLog>();
  for (const step of steps) {
    const meta = step.meta as Record<string, unknown> | undefined;
    const opLog = meta?.operationLog as OperationLog | undefined;
    if (!opLog || !opLog.id) continue;
    byId.set(opLog.id, opLog);
  }
  return Array.from(byId.values()).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
};

export const useOperationLog = () => {
  const [operationLogs, setOperationLogsState] = useState<OperationLog[]>([]);
  const operationLogsRef = useRef<OperationLog[]>([]);

  const setOperationLogs = useCallback((next: OperationLog[] | ((prev: OperationLog[]) => OperationLog[])) => {
    const prev = operationLogsRef.current;
    const resolved = typeof next === 'function' ? next(prev) : next;
    operationLogsRef.current = resolved;
    setOperationLogsState(resolved);
  }, []);

  const startOperation = useCallback((title: string, contextId?: string) => {
    const id = generateId();
    const log: OperationLog = {
      id,
      contextId,
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
  }, [setOperationLogs]);

  const addOperationEvent = useCallback(
    (opId: string, args: { phase: OperationPhase; level: OperationLevel; title: string; detail?: string; tooltip?: string; tooltipMessages?: string; tooltipDocs?: string; kind?: OperationEvent['kind']; contextScope?: OperationEvent['contextScope']; blockIndex?: number; attempt?: OperationEvent['attempt']; metrics?: OperationEvent['metrics']; error?: OperationEvent['error'] }) => {
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
            tooltip: args.tooltip,
            tooltipMessages: args.tooltipMessages,
            tooltipDocs: args.tooltipDocs,
            kind: args.kind,
            contextScope: args.contextScope,
            blockIndex: args.blockIndex,
            attempt: args.attempt,
            metrics: args.metrics,
            error: args.error,
          };
          const isLLMStart = event.title === 'LLM' && event.detail?.startsWith('start');
          return {
            ...log,
            lastLLMStartedAt: isLLMStart ? event.createdAt : log.lastLLMStartedAt,
            events: [...log.events, event],
          };
        })
      );
    },
    [setOperationLogs]
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
  }, [setOperationLogs]);

  const getOperationLog = useCallback(
    (opId: string) => operationLogsRef.current.find((log) => log.id === opId) ?? null,
    []
  );

  const hydrateOperationLogs = useCallback((steps: TimeStep[]) => {
    const logs = extractOperationLogsFromSteps(steps);
    if (!logs.length) return;
    setOperationLogs((prev) => {
      const existingIds = new Set(prev.map((log) => log.id));
      const next = logs.filter((log) => !existingIds.has(log.id));
      return next.length ? [...prev, ...next] : prev;
    });
  }, [setOperationLogs]);

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
