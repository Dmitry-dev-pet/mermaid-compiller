import { useCallback, useRef, useState } from 'react';
import type { MermaidState } from '../../types';

type PreviewSnapshot = {
  code: string;
  diagnostics?: {
    isValid?: boolean;
    errorMessage?: string;
    errorLine?: number;
  } | null;
};

type UseProjectPreviewArgs = {
  loadSessionSnapshot: (sessionId: string) => Promise<PreviewSnapshot | null>;
};

export const useProjectPreview = ({ loadSessionSnapshot }: UseProjectPreviewArgs) => {
  const [previewMermaidState, setPreviewMermaidState] = useState<MermaidState | null>(null);
  const previewCacheRef = useRef<Record<string, MermaidState>>({});
  const previewLoadingRef = useRef<Set<string>>(new Set());

  const clearProjectPreview = useCallback(() => {
    setPreviewMermaidState(null);
  }, []);

  const buildPreviewState = useCallback((snapshot: PreviewSnapshot) => {
    const code = snapshot.code ?? '';
    const isValid = snapshot.diagnostics?.isValid ?? true;
    return {
      code,
      isValid,
      lastValidCode: isValid ? code : '',
      errorMessage: snapshot.diagnostics?.errorMessage,
      errorLine: snapshot.diagnostics?.errorLine,
      source: 'compiled',
      status: code.trim()
        ? (isValid ? 'valid' : 'invalid')
        : 'empty',
    } as MermaidState;
  }, []);

  const showProjectPreview = useCallback(async (sessionId: string) => {
    if (previewCacheRef.current[sessionId]) {
      setPreviewMermaidState(previewCacheRef.current[sessionId]);
      return;
    }
    if (previewLoadingRef.current.has(sessionId)) return;
    previewLoadingRef.current.add(sessionId);
    const snapshot = await loadSessionSnapshot(sessionId);
    previewLoadingRef.current.delete(sessionId);
    if (!snapshot) return;
    const nextState = buildPreviewState(snapshot);
    previewCacheRef.current[sessionId] = nextState;
    setPreviewMermaidState(nextState);
  }, [buildPreviewState, loadSessionSnapshot]);

  return {
    previewMermaidState,
    showProjectPreview,
    clearProjectPreview,
  };
};
