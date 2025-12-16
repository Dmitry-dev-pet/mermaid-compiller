import { useState } from 'react';
import { useAI } from './useAI';
import { useMermaid } from './useMermaid';
import { useLayout } from './useLayout';
import { useChat } from './useChat';
import { validateMermaid, extractMermaidCode } from '../services/mermaidService';
import { generateDiagram, fixDiagram, chat, analyzeDiagram } from '../services/llmService';
import { fetchDocsContext } from '../services/docsContextService';
import { stripMermaidCode, detectLanguage } from '../utils';
import type { Message } from '../types';
import { AUTO_FIX_MAX_ATTEMPTS } from '../constants';

export const useDiagramStudio = () => {
  const { aiConfig, setAiConfig, connectionState, connectAI, disconnectAI } = useAI();
  const { mermaidState, setMermaidState, handleMermaidChange } = useMermaid();
  const { appState, setAppState, startResize, setDiagramType, toggleTheme, setLanguage } = useLayout();
  const { messages, setMessages, addMessage, clearMessages, getMessages } = useChat();

  const [isProcessing, setIsProcessing] = useState(false);

  const truncate = (text: string, maxLen: number) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, maxLen - 1)}…`;
  };

  const toBriefSummary = (text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const parts = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    return truncate(parts.slice(0, 2).join(' '), 220);
  };

  const resolveLanguage = (text?: string): string => {
    if (appState.language !== 'auto') return appState.language;

    const basis =
      text?.trim() ||
      getMessages()
        .slice()
        .reverse()
        .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;

    if (!basis) return 'English';

    const detected = detectLanguage(basis);
    setLanguage(detected);
    return detected;
  };



  const getDiagramContextMessage = (): Message | null => {
    const code = mermaidState.code.trim();
    if (!code) return null;

    return {
      id: 'diagram-context',
      role: 'user',
      content: `Current Mermaid diagram code (context only; do not output Mermaid code in Chat mode and do not repeat this verbatim):
\`\`\`mermaid
${code}
\`\`\``,
      timestamp: Date.now(),
    };
  };

  const handleChatMessage = async (text: string) => {
    addMessage('user', text);
    if (connectionState.status !== 'connected') {
      addMessage('assistant', "I'm offline. Connect AI to generate diagrams.");
      return;
    }

    const language = resolveLanguage(text);

    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const relevantMessages = getMessages().filter(m => m.id !== 'init');


        const diagramContext = getDiagramContextMessage();
        const llmMessages = diagramContext ? [...relevantMessages, diagramContext] : relevantMessages;
        const responseText = await chat(llmMessages, aiConfig, appState.diagramType, docs, language);
        addMessage('assistant', stripMermaidCode(responseText));

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        addMessage('assistant', `Error: ${message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleBuildFromPrompt = async (text?: string) => {
    const prompt = text?.trim() ?? '';
    if (prompt) addMessage('user', prompt);

    if (connectionState.status !== 'connected') {
      addMessage('assistant', "I'm offline. Connect AI to generate diagrams.");
      return;
    }

    const language = resolveLanguage(prompt);

    setIsProcessing(true);
    try {
      const docs = await fetchDocsContext(appState.diagramType);
      const relevantMessages = getMessages().filter((m) => m.id !== 'init');

      const hasUserContext = relevantMessages.some(
        (m) => m.role === 'user' && m.content.trim().length > 0
      );
      if (!hasUserContext) {
        addMessage('assistant', 'Nothing to build yet. Send a message first.');
        return;
      }

      const currentDiagramCode = mermaidState.code.trim();
      const diagramContext = getDiagramContextMessage();
      const llmMessages = diagramContext ? [...relevantMessages, diagramContext] : relevantMessages;

      const lastUserText =
        relevantMessages
          .slice()
          .reverse()
          .find((m) => m.role === 'user' && m.content.trim().length > 0)?.content ?? '';

      const beforeSummarySource = prompt || lastUserText;

      let fullChatSummary = '';
      try {
        const summaryReq: Message = {
          id: 'build-summary-req',
          role: 'user',
          content:
            'Summarize the entire chat so far into 2-3 short sentences describing what diagram should be built next.\n' +
            'Include the current diagram (if any) and what should change.\n' +
            'TEXT ONLY. No Mermaid. No code blocks.',
          timestamp: Date.now(),
        };
        const summaryText = await chat(
          [...llmMessages, summaryReq],
          aiConfig,
          appState.diagramType,
          docs,
          language
        );
        fullChatSummary = toBriefSummary(stripMermaidCode(summaryText));
      } catch {
        fullChatSummary = '';
      }

      const fallbackLines = [
        `Will ${currentDiagramCode ? 'update' : 'create'} a ${appState.diagramType} diagram using chat context${currentDiagramCode ? ' + current code' : ''}.`,
        beforeSummarySource ? `Request: ${truncate(beforeSummarySource, 160)}` : '',
      ].filter(Boolean);

      addMessage('assistant', `Build (before): ${fullChatSummary || fallbackLines.join(' ')}`);
      const rawCode = await generateDiagram(llmMessages, aiConfig, appState.diagramType, docs, language);
      const cleanCode = extractMermaidCode(rawCode);

      if (!cleanCode.trim()) {
        addMessage('assistant', 'Build failed: no Mermaid code returned.');
        return;
      }

      let currentCode = cleanCode;
      let validation = await validateMermaid(currentCode);
      let autoFixAttempts = 0;

      const applyResult = (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => {
        setMermaidState((prev) => ({
          ...prev,
          code,
          isValid: v.isValid ?? false,
          lastValidCode: v.lastValidCode ?? prev.lastValidCode,
          errorMessage: v.errorMessage,
          errorLine: v.errorLine,
          status: v.isValid ? 'valid' : 'invalid',
          source: 'compiled',
        }));
      };

      applyResult(currentCode, validation);

      while (!validation.isValid && autoFixAttempts < AUTO_FIX_MAX_ATTEMPTS) {
        autoFixAttempts += 1;

        const fixedRaw = await fixDiagram(
          currentCode,
          validation.errorMessage || 'Unknown error',
          aiConfig,
          docs,
          language
        );
        const fixedCode = extractMermaidCode(fixedRaw);
        if (!fixedCode.trim()) break;

        currentCode = fixedCode;
        validation = await validateMermaid(currentCode);
        applyResult(currentCode, validation);

        if (validation.isValid) break;
      }

      const autoFixNote =
        autoFixAttempts === 0
          ? ''
          : validation.isValid
            ? ` Auto-fixed (${autoFixAttempts}).`
            : ` Auto-fix attempted (${autoFixAttempts}), still invalid.`;

      let afterSummary = '';
      try {
        const explanation = await analyzeDiagram(currentCode, aiConfig, docs, language);
        afterSummary = toBriefSummary(explanation);
      } catch {
        afterSummary = '';
      }

      addMessage(
        'assistant',
        `Build (after): Built ${appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}${autoFixNote}${afterSummary ? `\nSummary: ${afterSummary}` : ''}`
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      addMessage('assistant', `Build failed: ${message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecompile = async () => {
    if (connectionState.status !== 'connected') {
        alert("Connect AI first!");
        return;
    }
    
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const language = appState.language === 'auto' ? 'English' : appState.language;
        const relevantMessages = getMessages().filter(m => m.id !== 'init');
        const rawCode = await generateDiagram(relevantMessages, aiConfig, appState.diagramType, docs, language);
        const cleanCode = extractMermaidCode(rawCode);
        const validation = await validateMermaid(cleanCode);
        
        setMermaidState((prev) => ({
            ...prev,
            code: cleanCode,
            isValid: validation.isValid ?? false,
            lastValidCode: validation.lastValidCode,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
            status: validation.isValid ? 'valid' : 'invalid',
            source: 'compiled'
        }));

        addMessage('assistant', `Generated ${appState.diagramType} diagram. ${validation.isValid ? 'Valid.' : 'Contains errors.'}`);

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Generation failed: ${message}`);
        addMessage('assistant', `Error generating diagram: ${message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFixSyntax = async () => {
    if (connectionState.status !== 'connected') return;
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const language = appState.language === 'auto' ? 'English' : appState.language;

        let currentCode = mermaidState.code;
        let validation = await validateMermaid(currentCode);
        let attempts = 0;

        while (!validation.isValid && attempts < AUTO_FIX_MAX_ATTEMPTS) {
          attempts += 1;
          const fixedRaw = await fixDiagram(
            currentCode,
            validation.errorMessage || mermaidState.errorMessage || 'Unknown error',
            aiConfig,
            docs,
            language
          );
          const fixedCode = extractMermaidCode(fixedRaw);
          if (!fixedCode.trim()) break;

          currentCode = fixedCode;
          validation = await validateMermaid(currentCode);
          setMermaidState((prev) => ({
            ...prev,
            code: currentCode,
            isValid: validation.isValid ?? false,
            lastValidCode: validation.lastValidCode ?? prev.lastValidCode,
            errorMessage: validation.errorMessage,
            errorLine: validation.errorLine,
            status: validation.isValid ? 'valid' : 'invalid',
          }));

          if (validation.isValid) break;
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Fix failed: ${message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAnalyze = async () => {
    if (connectionState.status !== 'connected' || !mermaidState.code.trim()) {
        alert("Connect AI and provide Mermaid code first!");
        return;
    }
    setIsProcessing(true);
    try {
        const docs = await fetchDocsContext(appState.diagramType);
        const language = appState.language === 'auto' ? 'English' : appState.language;
        const explanation = await analyzeDiagram(mermaidState.code, aiConfig, docs, language);
        
        addMessage('assistant', explanation);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        alert(`Analysis failed: ${message}`);
        addMessage('assistant', `Error analyzing diagram: ${message}`);
    } finally {
        setIsProcessing(false);
    }
  };

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
    setLanguage
  };
};
