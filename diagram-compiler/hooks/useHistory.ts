import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, MermaidState } from '../types';
import { createSession, ensureActiveSession, getRevision, loadActiveSessionState, recordStep } from '../services/history/store';
import type { DiagramRevision, HistorySession, StepMeta, TimeStep, TimeStepType } from '../services/history/types';

export type HistoryLoadResult = {
  session: HistorySession;
  messages: Message[];
  currentRevisionMermaid: string | null;
  currentRevisionDiagnostics?: Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine'>;
};

export type DiagramMarker = {
  stepId: string;
  stepIndex: number;
  type: TimeStepType;
  createdAt: number;
  revisionId: string;
};

export type DiagramStepAnchors = Record<string, string>;

export const useHistory = () => {
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [historySession, setHistorySession] = useState<HistorySession | null>(null);
  const [historyLoadResult, setHistoryLoadResult] = useState<HistoryLoadResult | null>(null);
  const [historySteps, setHistorySteps] = useState<TimeStep[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stepsRef = useRef<TimeStep[]>([]);

  const loadHistory = useCallback(async (): Promise<HistoryLoadResult | null> => {
    try {
      const { session, steps, currentRevision } = await loadActiveSessionState();
      sessionIdRef.current = session.id;
      setHistorySession(session);
      stepsRef.current = steps;
      setHistorySteps(steps);
      const lastStepWithCurrent = steps.slice().reverse().find((s) => s.currentRevisionId === session.currentRevisionId);
      setSelectedStepId(lastStepWithCurrent?.id ?? null);

      const messages = steps.flatMap((s) => s.messages ?? []);
      const diagnostics = currentRevision?.diagnostics
        ? {
            isValid: currentRevision.diagnostics.isValid,
            errorMessage: currentRevision.diagnostics.errorMessage,
            errorLine: currentRevision.diagnostics.errorLine,
          }
        : undefined;

      return {
        session,
        messages,
        currentRevisionMermaid: currentRevision?.mermaid ?? null,
        currentRevisionDiagnostics: diagnostics,
      };
    } catch (e) {
      console.error('Failed to load history', e);
      return null;
    } finally {
      setIsHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    void loadHistory().then((res) => setHistoryLoadResult(res));
  }, [loadHistory]);

  useEffect(() => {
    stepsRef.current = historySteps;
  }, [historySteps]);

  const appendTimeStep = useCallback(
    async (args: {
      type: TimeStepType;
      messages: Message[];
      meta?: StepMeta;
      nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
      setCurrentRevisionId?: string | null;
    }) => {
      const sessionId = sessionIdRef.current ?? (await ensureActiveSession()).id;
      sessionIdRef.current = sessionId;
      const { session, step } = await recordStep({
        sessionId,
        type: args.type,
        messages: args.messages,
        meta: args.meta,
        nextMermaid: args.nextMermaid,
        setCurrentRevisionId: args.setCurrentRevisionId,
      });
      setHistorySession(session);
      setHistorySteps((prev) => [...prev, step]);
    },
    []
  );

  const diagramMarkers = useMemo<DiagramMarker[]>(() => {
    const out: DiagramMarker[] = [];
    let prevRevisionId: string | null = null;

    for (const step of historySteps) {
      const rev = step.currentRevisionId;
      if (!rev) {
        prevRevisionId = null;
        continue;
      }
      if (rev !== prevRevisionId) {
        out.push({
          stepId: step.id,
          stepIndex: step.index,
          type: step.type,
          createdAt: step.createdAt,
          revisionId: rev,
        });
      }
      prevRevisionId = rev;
    }

    return out;
  }, [historySteps]);

  const diagramStepAnchors = useMemo<DiagramStepAnchors>(() => {
    const map: DiagramStepAnchors = {};
    for (const step of historySteps) {
      const msgs = step.messages ?? [];
      const lastAssistant = msgs.slice().reverse().find((m) => m.role === 'assistant')?.id;
      const last = msgs[msgs.length - 1]?.id;
      const best = lastAssistant ?? last;
      if (best) map[step.id] = best;
    }
    return map;
  }, [historySteps]);

  const selectDiagramStep = useCallback(async (stepId: string): Promise<DiagramRevision | null> => {
    const step = stepsRef.current.find((s) => s.id === stepId);
    if (!step) return null;
    setSelectedStepId(stepId);
    const revId = step.currentRevisionId;
    if (!revId) return null;
    return getRevision(revId);
  }, []);

  const startNewSession = useCallback(async (): Promise<HistorySession> => {
    const session = await createSession();
    sessionIdRef.current = session.id;
    setHistorySession(session);
    stepsRef.current = [];
    setHistorySteps([]);
    setSelectedStepId(null);
    setHistoryLoadResult({
      session,
      messages: [],
      currentRevisionMermaid: null,
    });
    return session;
  }, []);

  return {
    isHistoryReady,
    historySession,
    historyLoadResult,
    historySteps,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    loadHistory,
    appendTimeStep,
    selectDiagramStep,
    startNewSession,
  };
};
