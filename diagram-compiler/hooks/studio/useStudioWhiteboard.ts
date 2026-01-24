import { useCallback, useEffect, useRef, useState } from 'react';
import type { MermaidState } from '../../types';
import type { HistoryLoadResult } from '../core/useHistory';
import type { DiagramRevision, HistorySession } from '../../services/history/types';
import { resolveWhiteboardSceneForBlock, updateWhiteboardBundleForBlock } from '../../services/history/whiteboardBundle';

type UseStudioWhiteboardArgs = {
  historyLoadResult: HistoryLoadResult | null;
  historySession: HistorySession | null;
  getRevision: (revisionId: string) => Promise<DiagramRevision | null>;
  updateCurrentRevisionWhiteboard: (whiteboard: string | null, revisionId?: string | null) => Promise<DiagramRevision | null>;
  markdownMermaidBlocksLength: number;
  markdownMermaidActiveIndex: number;
  mermaidState: MermaidState;
  safeAppendTimeStep: (args: {
    type: import('../../services/history/types').TimeStepType;
    messages: import('../../types').Message[];
    meta?: import('../../services/history/types').StepMeta;
    nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
    setCurrentRevisionId?: string | null;
  }) => Promise<unknown> | unknown;
};

export const useStudioWhiteboard = ({
  historyLoadResult,
  historySession,
  getRevision,
  updateCurrentRevisionWhiteboard,
  markdownMermaidBlocksLength,
  markdownMermaidActiveIndex,
  mermaidState,
  safeAppendTimeStep,
}: UseStudioWhiteboardArgs) => {
  const [whiteboardSceneJson, setWhiteboardSceneJson] = useState<string | null>(null);
  const [whiteboardBundleJson, setWhiteboardBundleJson] = useState<string | null>(null);
  const whiteboardRawRef = useRef<string | null>(null);

  const resolveWhiteboardSceneForActiveContext = useCallback((raw: string | null): string | null => {
    const isMarkdownBlock = markdownMermaidBlocksLength > 0;
    if (!isMarkdownBlock) return raw?.trim() ? raw : null;
    return resolveWhiteboardSceneForBlock(raw, markdownMermaidActiveIndex);
  }, [markdownMermaidActiveIndex, markdownMermaidBlocksLength]);

  const setWhiteboardFromRaw = useCallback((raw: string | null) => {
    whiteboardRawRef.current = raw;
    setWhiteboardBundleJson(raw);
    setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(raw));
  }, [resolveWhiteboardSceneForActiveContext]);

  useEffect(() => {
    if (!historyLoadResult) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWhiteboardFromRaw(historyLoadResult.currentRevisionWhiteboard ?? null);
  }, [historyLoadResult, setWhiteboardFromRaw]);

  useEffect(() => {
    const revId = historySession?.currentRevisionId ?? null;
    if (!revId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWhiteboardFromRaw(null);
      return;
    }
    void getRevision(revId).then((rev) => {
      const raw = rev?.whiteboard ?? null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWhiteboardFromRaw(raw);
    });
  }, [getRevision, historySession?.currentRevisionId, setWhiteboardFromRaw]);

  const saveWhiteboardForCurrentRevision = useCallback(async (sceneJson: string | null) => {
    const isMarkdownBlock = markdownMermaidBlocksLength > 0;
    const nextRaw = (() => {
      const trimmed = sceneJson?.trim() ? sceneJson : null;
      if (!isMarkdownBlock) return trimmed;
      return updateWhiteboardBundleForBlock(whiteboardRawRef.current, markdownMermaidActiveIndex, trimmed);
    })();

    setWhiteboardFromRaw(nextRaw);

    let revisionId = historySession?.currentRevisionId ?? null;
    if (!revisionId) {
      const code = mermaidState.code;
      if (!code.trim()) return null;
      const step = await safeAppendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: {
          code,
          isValid: mermaidState.isValid,
          errorMessage: mermaidState.errorMessage,
          errorLine: mermaidState.errorLine,
        },
      });
      revisionId = (step as { session?: { currentRevisionId?: string | null } } | null)?.session?.currentRevisionId ?? null;
    }

    const updated = await updateCurrentRevisionWhiteboard(nextRaw, revisionId);
    if (updated) {
      setWhiteboardFromRaw(updated.whiteboard ?? null);
    }
    return updated;
  }, [
    historySession?.currentRevisionId,
    markdownMermaidActiveIndex,
    markdownMermaidBlocksLength,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    safeAppendTimeStep,
    setWhiteboardFromRaw,
    updateCurrentRevisionWhiteboard,
  ]);

  useEffect(() => {
    setWhiteboardSceneJson(resolveWhiteboardSceneForActiveContext(whiteboardRawRef.current));
  }, [markdownMermaidActiveIndex, markdownMermaidBlocksLength, resolveWhiteboardSceneForActiveContext]);

  return {
    whiteboardSceneJson,
    whiteboardBundleJson,
    saveWhiteboardForCurrentRevision,
    setWhiteboardFromRaw,
  };
};
