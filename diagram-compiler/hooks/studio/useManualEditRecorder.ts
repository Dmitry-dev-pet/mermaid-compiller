import { useEffect, type MutableRefObject } from 'react';
import type { MermaidState } from '../../types';

type ManualEditRecorderArgs = {
  isHistoryReady: boolean;
  isHydratingRef: MutableRefObject<boolean>;
  isProcessing: boolean;
  mermaidState: MermaidState;
  lastManualRecordedCodeRef: MutableRefObject<string>;
  historySessionCurrentRevisionId?: string | null;
  appendTimeStep: (args: {
    type: 'manual_edit';
    messages: [];
    nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
    setCurrentRevisionId?: string | null;
  }) => Promise<void>;
  updateCurrentRevision: (nextMermaid: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'>) => Promise<unknown>;
};

export const useManualEditRecorder = ({
  isHistoryReady,
  isHydratingRef,
  isProcessing,
  mermaidState,
  lastManualRecordedCodeRef,
  historySessionCurrentRevisionId,
  appendTimeStep,
  updateCurrentRevision,
}: ManualEditRecorderArgs) => {
  useEffect(() => {
    if (!isHistoryReady) return;
    if (isHydratingRef.current) return;
    if (isProcessing) return;
    if (mermaidState.source === 'compiled') return;

    const code = mermaidState.code;
    if (code === lastManualRecordedCodeRef.current) return;

    const timer = window.setTimeout(() => {
      if (isHydratingRef.current) return;
      if (mermaidState.source === 'compiled') return;
      if (code === lastManualRecordedCodeRef.current) return;

      lastManualRecordedCodeRef.current = code;

      const trimmed = code.trim();

      if (!trimmed) {
        appendTimeStep({
          type: 'manual_edit',
          messages: [],
          nextMermaid: null,
          setCurrentRevisionId: null,
        }).catch((e) => console.error('Failed to record manual edit step', e));
        return;
      }

      if (historySessionCurrentRevisionId) {
        updateCurrentRevision({
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        }).catch((e) => console.error('Failed to update manual edit revision', e));
        return;
      }

      appendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: {
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        },
      }).catch((e) => console.error('Failed to record manual edit step', e));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    appendTimeStep,
    historySessionCurrentRevisionId,
    isHistoryReady,
    isHydratingRef,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    mermaidState.source,
    lastManualRecordedCodeRef,
    updateCurrentRevision,
  ]);
};
