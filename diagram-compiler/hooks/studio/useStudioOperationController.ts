import { useCallback, useEffect, useRef, useState } from "react";
import type { LLMRequestStartNotice } from "../../services/llmRequestRunner";

export const useStudioOperationController = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeLLMRequest, setActiveLLMRequest] =
    useState<LLMRequestStartNotice | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const prepareAbortController = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const clearAbortController = useCallback(
    (controller?: AbortController | null) => {
      if (!controller || abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    },
    [],
  );

  const stopActiveOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const getAbortSignal = useCallback(
    () => abortControllerRef.current?.signal ?? null,
    [],
  );

  const runWithAbortController = useCallback(
    async <T>(action: () => Promise<T>) => {
      const controller = prepareAbortController();
      try {
        return await action();
      } finally {
        clearAbortController(controller);
      }
    },
    [clearAbortController, prepareAbortController],
  );

  const onLLMRequestStart = useCallback((notice: LLMRequestStartNotice) => {
    setActiveLLMRequest(notice);
  }, []);

  useEffect(() => {
    if (!isProcessing && activeLLMRequest) {
      setActiveLLMRequest(null);
    }
  }, [activeLLMRequest, isProcessing]);

  return {
    isProcessing,
    setIsProcessing,
    stopActiveOperation,
    getAbortSignal,
    runWithAbortController,
    onLLMRequestStart,
  };
};
