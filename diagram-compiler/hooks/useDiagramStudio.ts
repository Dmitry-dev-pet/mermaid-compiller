import { useEffect, useRef, useState } from 'react';
import { useAI } from './useAI';
import { useMermaid } from './useMermaid';
import { useLayout } from './useLayout';
import { useChat } from './useChat';
import { createStudioActions } from './studioActions';
import { useHistory } from './useHistory';

export const useDiagramStudio = () => {
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, toggleTheme, setLanguage } = useLayout();
  const { messages, setMessages, addMessage, clearMessages, getMessages } = useChat();
  const { isHistoryReady, historyLoadResult, appendTimeStep } = useHistory();

  const [isProcessing, setIsProcessing] = useState(false);

  const isHydratingRef = useRef(true);
  const lastManualRecordedCodeRef = useRef<string>('');

  useEffect(() => {
    if (!historyLoadResult) return;

    setMessages((prev) => {
      const init = prev.find((m) => m.id === 'init');
      const loaded = historyLoadResult.messages.filter((m) => m.id !== 'init');
      return init ? [init, ...loaded] : loaded;
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
    }

    isHydratingRef.current = false;
  }, [historyLoadResult, setMermaidState, setMessages]);

  useEffect(() => {
    if (!isHistoryReady) return;
    if (historyLoadResult) return;
    isHydratingRef.current = false;
  }, [historyLoadResult, isHistoryReady]);

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

      appendTimeStep({
        type: 'manual_edit',
        messages: [],
        nextMermaid: code.trim()
          ? {
              code,
              isValid: mermaidState.isValid,
              errorMessage: mermaidState.errorMessage,
              errorLine: mermaidState.errorLine,
            }
          : null,
        setCurrentRevisionId: code.trim() ? undefined : null,
      }).catch((e) => console.error('Failed to record manual edit step', e));
    }, 900);

    return () => window.clearTimeout(timer);
  }, [
    appendTimeStep,
    isHistoryReady,
    isProcessing,
    mermaidState.code,
    mermaidState.errorLine,
    mermaidState.errorMessage,
    mermaidState.isValid,
    mermaidState.source,
  ]);

  const { handleChatMessage, handleBuildFromPrompt, handleRecompile, handleFixSyntax, handleAnalyze } =
    createStudioActions({
      aiConfig,
      connectionState,
      appState,
      mermaidState,
      setMermaidState,
      addMessage,
      getMessages,
      setLanguage,
      setIsProcessing,
      recordTimeStep: appendTimeStep,
    });

  return {
    aiConfig,
    setAiConfig,
    connectionState,
    mermaidState,
    messages,
    setMessages, // Kept for compatibility if needed, though addMessage/clearMessages is preferred
    appState,
    setAppState,
    isProcessing,
    connectAI,
    disconnectAI,
    handleMermaidChange,
    handleChatMessage,
    handleBuildFromPrompt,
    handleRecompile,
    handleFixSyntax,
    handleAnalyze,
    startResize,
    setDiagramType,
    clearMessages,
    toggleTheme,
    setLanguage,
  };
};
