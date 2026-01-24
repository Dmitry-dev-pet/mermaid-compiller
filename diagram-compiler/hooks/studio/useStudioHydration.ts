import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Message, MermaidState } from '../../types';
import type { HistoryLoadResult } from '../core/useHistory';
import type { HistorySession, TimeStep } from '../../services/history/types';
import { DEFAULT_MERMAID_STATE } from '../../constants';
import { createMermaidNotebookMarkdown } from '../../services/mermaidService';

type SafeAppendTimeStep = (args: {
  type: 'seed';
  messages: [];
  nextMermaid: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'>;
  meta?: Record<string, unknown>;
}) => void | Promise<unknown>;

type UseStudioHydrationArgs = {
  historyLoadResult: HistoryLoadResult | null;
  historySteps: TimeStep[];
  historySession: HistorySession | null;
  isHistoryReady: boolean;
  setMessagesForContext: (contextId: string, updater: (prev: Message[]) => Message[]) => void;
  setMermaidState: Dispatch<SetStateAction<MermaidState>>;
  hydrateOperationLogs: (steps: TimeStep[]) => void;
  safeAppendTimeStep: SafeAppendTimeStep;
  isHydratingRef: MutableRefObject<boolean>;
  hydratedSessionIdRef: MutableRefObject<string | null>;
  seededNotebookSessionIdsRef: MutableRefObject<Set<string>>;
  lastManualRecordedCodeRef: MutableRefObject<string>;
  mainContextId: string;
};

export const useStudioHydration = ({
  historyLoadResult,
  historySteps,
  historySession,
  isHistoryReady,
  setMessagesForContext,
  setMermaidState,
  hydrateOperationLogs,
  safeAppendTimeStep,
  isHydratingRef,
  hydratedSessionIdRef,
  seededNotebookSessionIdsRef,
  lastManualRecordedCodeRef,
  mainContextId,
}: UseStudioHydrationArgs) => {
  useEffect(() => {
    if (!historyLoadResult) return;
    const sessionId = historyLoadResult.session.id;
    if (hydratedSessionIdRef.current === sessionId) return;
    hydratedSessionIdRef.current = sessionId;

    setMessagesForContext(mainContextId, (prev) => {
      const init = prev.find((m) => m.id === 'init');
      const docMessages = historySteps
        .filter((step) => {
          const meta = step.meta as Record<string, unknown> | undefined;
          return meta?.mode !== 'notebook';
        })
        .flatMap((step) => step.messages ?? [])
        .filter((m) => m.id !== 'init');
      return init ? [init, ...docMessages] : docMessages;
    });

    if (historyLoadResult.currentRevisionMermaid !== null) {
      const code = historyLoadResult.currentRevisionMermaid;
      const diag = historyLoadResult.currentRevisionDiagnostics;

      lastManualRecordedCodeRef.current = code;
      setMermaidState((prev) => ({
        ...prev,
        code,
        isValid: diag?.isValid ?? true,
        lastValidCode: diag?.isValid === false ? prev.lastValidCode : code,
        errorMessage: diag?.errorMessage,
        errorLine: diag?.errorLine,
        source: 'compiled',
        status: code.trim() ? ((diag?.isValid ?? true) ? 'valid' : 'invalid') : 'empty',
      }));
    } else {
      lastManualRecordedCodeRef.current = '';
      setMermaidState(DEFAULT_MERMAID_STATE);
    }

    isHydratingRef.current = false;
  }, [
    historyLoadResult,
    historySteps,
    hydratedSessionIdRef,
    isHydratingRef,
    lastManualRecordedCodeRef,
    mainContextId,
    setMermaidState,
    setMessagesForContext,
  ]);

  useEffect(() => {
    if (!historyLoadResult) return;
    hydrateOperationLogs(historySteps);
  }, [historyLoadResult, historySteps, hydrateOperationLogs]);

  useEffect(() => {
    if (!historySession?.id) return;
    const sessionId = historySession.id;
    if (seededNotebookSessionIdsRef.current.has(sessionId)) return;
    if (historySession.currentRevisionId) {
      seededNotebookSessionIdsRef.current.add(sessionId);
      return;
    }
    if (historySteps.length > 0) {
      seededNotebookSessionIdsRef.current.add(sessionId);
      return;
    }

    seededNotebookSessionIdsRef.current.add(sessionId);
    const markdown = createMermaidNotebookMarkdown({ blocks: 1 });
    lastManualRecordedCodeRef.current = markdown;
    setMermaidState((prev) => ({
      ...prev,
      code: markdown,
      isValid: true,
      lastValidCode: markdown,
      errorMessage: undefined,
      errorLine: undefined,
      source: 'compiled',
      status: 'valid',
    }));
    void safeAppendTimeStep({
      type: 'seed',
      messages: [],
      nextMermaid: {
        code: markdown,
        isValid: true,
        errorMessage: undefined,
        errorLine: undefined,
      },
      meta: { seeded: 'notebook' },
    });
  }, [
    historySession?.currentRevisionId,
    historySession?.id,
    historySteps.length,
    lastManualRecordedCodeRef,
    safeAppendTimeStep,
    seededNotebookSessionIdsRef,
    setMermaidState,
  ]);

  useEffect(() => {
    if (!isHistoryReady) return;
    if (historyLoadResult) return;
    isHydratingRef.current = false;
  }, [historyLoadResult, isHistoryReady, isHydratingRef]);
};
