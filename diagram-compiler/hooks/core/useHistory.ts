import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message, MermaidState } from '../../types';
import {
  createSession,
  ensureActiveSession,
  getRevision,
  getSessionPreview,
  getSessionSnapshot,
  listSessions,
  loadActiveSessionState,
  loadSessionState,
  recordStep,
  renameSession,
  updateRevision,
  updateSessionSettings,
  deleteSession as removeSession,
} from '../../services/history/store';
import type { DiagramRevision, HistorySession, SessionPreview, SessionSettings, SessionSnapshot, StepMeta, TimeStep, TimeStepType } from '../../services/history/types';

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
  const DELETE_UNDO_MS = 5000;
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [historySession, setHistorySession] = useState<HistorySession | null>(null);
  const [historyLoadResult, setHistoryLoadResult] = useState<HistoryLoadResult | null>(null);
  const [historySteps, setHistorySteps] = useState<TimeStep[]>([]);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stepsRef = useRef<TimeStep[]>([]);
  const pendingDeletionRef = useRef<Map<string, { timer: number; session: HistorySession }>>(new Map());

  const sortSessions = useCallback((items: HistorySession[]) => {
    return items
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  }, []);

  const buildLoadResult = useCallback(
    (session: HistorySession, steps: TimeStep[], currentRevision: DiagramRevision | null): HistoryLoadResult => {
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
    },
    []
  );

  const refreshSessions = useCallback(async () => {
    try {
      const next = await listSessions();
      const sorted = sortSessions(next);
      setSessions(sorted);
      return sorted;
    } catch (e) {
      console.error('Failed to list sessions', e);
      return [];
    }
  }, [sortSessions]);

  const loadHistory = useCallback(async (): Promise<HistoryLoadResult | null> => {
    try {
      const { session, steps, currentRevision } = await loadActiveSessionState();
      sessionIdRef.current = session.id;
      setHistorySession(session);
      stepsRef.current = steps;
      setHistorySteps(steps);
      return buildLoadResult(session, steps, currentRevision);
    } catch (e) {
      console.error('Failed to load history', e);
      return null;
    } finally {
      setIsHistoryReady(true);
    }
  }, [buildLoadResult, refreshSessions]);

  const loadSession = useCallback(async (sessionId: string): Promise<HistoryLoadResult | null> => {
    try {
      const state = await loadSessionState(sessionId);
      if (!state) return null;
      const { session, steps, currentRevision } = state;
      sessionIdRef.current = session.id;
      setHistorySession(session);
      stepsRef.current = steps;
      setHistorySteps(steps);
      const result = buildLoadResult(session, steps, currentRevision);
      setHistoryLoadResult(result);
      void refreshSessions();
      return result;
    } catch (e) {
      console.error('Failed to load session', e);
      return null;
    } finally {
      setIsHistoryReady(true);
    }
  }, [buildLoadResult]);

  useEffect(() => {
    void loadHistory().then((res) => setHistoryLoadResult(res));
    void refreshSessions();
  }, [loadHistory, refreshSessions]);

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
      setSessions((prev) => {
        const next = prev.map((item) => (item.id === session.id ? session : item));
        return sortSessions(next);
      });
    },
    [sortSessions]
  );

  const updateCurrentRevision = useCallback(
    async (nextMermaid: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'>) => {
      const revisionId = historySession?.currentRevisionId;
      if (!revisionId) return null;
      return updateRevision(revisionId, nextMermaid);
    },
    [historySession?.currentRevisionId]
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

  const startNewSession = useCallback(async (args?: { title?: string; settings?: SessionSettings }): Promise<HistorySession> => {
    const session = await createSession(args);
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
    void refreshSessions();
    return session;
  }, [refreshSessions]);

  const renameHistorySession = useCallback(async (sessionId: string, title: string) => {
    const session = await renameSession(sessionId, title);
    if (!session) return null;
    setSessions((prev) => sortSessions(prev.map((item) => (item.id === session.id ? session : item))));
    if (historySession?.id === session.id) {
      setHistorySession(session);
    }
    return session;
  }, [historySession?.id, sortSessions]);

  const saveSessionSettings = useCallback(async (sessionId: string, settings: SessionSettings) => {
    const session = await updateSessionSettings(sessionId, settings);
    if (!session) return null;
    setSessions((prev) => sortSessions(prev.map((item) => (item.id === session.id ? session : item))));
    if (historySession?.id === session.id) {
      setHistorySession(session);
    }
    return session;
  }, [historySession?.id, sortSessions]);

  const scheduleDeleteSession = useCallback(async (sessionId: string) => {
    if (pendingDeletionRef.current.has(sessionId)) return;
    const session = sessions.find((item) => item.id === sessionId) ?? historySession;
    if (!session) return;

    setSessions((prev) => prev.filter((item) => item.id !== sessionId));

    if (historySession?.id === sessionId) {
      setHistorySession(null);
      stepsRef.current = [];
      setHistorySteps([]);
      setSelectedStepId(null);
      sessionIdRef.current = null;
      const remaining = sessions.filter((item) => item.id !== sessionId);
      const next = remaining[0];
      if (next) {
        await loadSession(next.id);
      } else {
        await startNewSession();
      }
    }

    const timer = window.setTimeout(async () => {
      pendingDeletionRef.current.delete(sessionId);
      await removeSession(sessionId);
    }, DELETE_UNDO_MS);

    pendingDeletionRef.current.set(sessionId, { timer, session });
  }, [historySession, loadSession, sessions, startNewSession]);

  const undoDeleteSession = useCallback((sessionId: string) => {
    const pending = pendingDeletionRef.current.get(sessionId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeletionRef.current.delete(sessionId);
    setSessions((prev) => sortSessions([...prev, pending.session]));
  }, [sortSessions]);

  const loadSessionPreview = useCallback(async (sessionId: string): Promise<SessionPreview | null> => {
    try {
      return await getSessionPreview(sessionId);
    } catch (e) {
      console.error('Failed to load session preview', e);
      return null;
    }
  }, []);

  const loadSessionSnapshot = useCallback(async (sessionId: string): Promise<SessionSnapshot | null> => {
    try {
      return await getSessionSnapshot(sessionId);
    } catch (e) {
      console.error('Failed to load session snapshot', e);
      return null;
    }
  }, []);

  return {
    isHistoryReady,
    historySession,
    historyLoadResult,
    historySteps,
    sessions,
    diagramMarkers,
    diagramStepAnchors,
    selectedStepId,
    loadHistory,
    loadSession,
    appendTimeStep,
    updateCurrentRevision,
    selectDiagramStep,
    startNewSession,
    renameHistorySession,
    saveSessionSettings,
    scheduleDeleteSession,
    undoDeleteSession,
    deleteUndoMs: DELETE_UNDO_MS,
    loadSessionPreview,
    loadSessionSnapshot,
  };
};
