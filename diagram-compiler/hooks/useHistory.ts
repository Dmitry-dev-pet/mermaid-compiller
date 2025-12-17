import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message, MermaidState } from '../types';
import { ensureActiveSession, loadActiveSessionState, recordStep } from '../services/history/store';
import type { HistorySession, StepMeta, TimeStepType } from '../services/history/types';

export type HistoryLoadResult = {
  session: HistorySession;
  messages: Message[];
  currentRevisionMermaid: string | null;
  currentRevisionDiagnostics?: Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine'>;
};

export const useHistory = () => {
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [historySession, setHistorySession] = useState<HistorySession | null>(null);
  const [historyLoadResult, setHistoryLoadResult] = useState<HistoryLoadResult | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const loadHistory = useCallback(async (): Promise<HistoryLoadResult | null> => {
    try {
      const { session, steps, currentRevision } = await loadActiveSessionState();
      sessionIdRef.current = session.id;
      setHistorySession(session);

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
      const { session } = await recordStep({
        sessionId,
        type: args.type,
        messages: args.messages,
        meta: args.meta,
        nextMermaid: args.nextMermaid,
        setCurrentRevisionId: args.setCurrentRevisionId,
      });
      setHistorySession(session);
    },
    []
  );

  return {
    isHistoryReady,
    historySession,
    historyLoadResult,
    loadHistory,
    appendTimeStep,
  };
};
