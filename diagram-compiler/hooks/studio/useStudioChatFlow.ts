import { useCallback } from 'react';

type UseStudioChatFlowArgs<TDiagramType> = {
  activeChatContextId: string | null;
  mainContextId: string;
  appDiagramType: TDiagramType;
  resolveActiveMermaidContext: () => { diagramType?: TDiagramType | null };
  setDiagramTypeAndWait: (diagramType: TDiagramType) => Promise<void>;
  loadBuildDocsEntries: (diagramType: TDiagramType) => Promise<unknown>;
  baseHandleChatMessage: (text: string) => Promise<unknown>;
  baseHandleBuildFromPrompt: (text?: string) => Promise<unknown>;
  handleNotebookBuild: (text?: string) => Promise<void>;
};

export const useStudioChatFlow = <TDiagramType,>({
  activeChatContextId,
  mainContextId,
  appDiagramType,
  resolveActiveMermaidContext,
  setDiagramTypeAndWait,
  loadBuildDocsEntries,
  baseHandleChatMessage,
  baseHandleBuildFromPrompt,
  handleNotebookBuild,
}: UseStudioChatFlowArgs<TDiagramType>) => {
  const runWithActiveDiagramContext = useCallback(async <T,>(action: () => Promise<T>) => {
    const originalDiagramType = appDiagramType;
    const targetDiagramType = resolveActiveMermaidContext().diagramType ?? originalDiagramType;
    try {
      await setDiagramTypeAndWait(targetDiagramType);
      await loadBuildDocsEntries(targetDiagramType);
      return await action();
    } finally {
      await setDiagramTypeAndWait(originalDiagramType);
    }
  }, [
    appDiagramType,
    loadBuildDocsEntries,
    resolveActiveMermaidContext,
    setDiagramTypeAndWait,
  ]);

  const handleChatMessage = useCallback(async (text: string) => {
    if (activeChatContextId === mainContextId) {
      return baseHandleChatMessage(text);
    }

    return runWithActiveDiagramContext(() => baseHandleChatMessage(text));
  }, [
    activeChatContextId,
    baseHandleChatMessage,
    mainContextId,
    runWithActiveDiagramContext,
  ]);

  const handleBuildFromPrompt = useCallback(async (text?: string) => {
    if (activeChatContextId === mainContextId) {
      await handleNotebookBuild(text);
      return;
    }

    await runWithActiveDiagramContext(() => baseHandleBuildFromPrompt(text));
  }, [
    activeChatContextId,
    baseHandleBuildFromPrompt,
    handleNotebookBuild,
    mainContextId,
    runWithActiveDiagramContext,
  ]);

  return {
    runWithActiveDiagramContext,
    handleChatMessage,
    handleBuildFromPrompt,
  };
};
