import type { Dispatch, SetStateAction } from 'react';
import type { AIConfig, AppState, ConnectionState, MermaidState, Message } from '../../types';
import { validateMermaid } from '../../services/mermaidService';
import { detectLanguage } from '../../utils';
import type { StepMeta, TimeStepType } from '../../services/history/types';

export type StudioActionsDeps = {
  aiConfig: AIConfig;
  connectionState: ConnectionState;
  appState: AppState;
  mermaidState: MermaidState;
  setMermaidState: Dispatch<SetStateAction<MermaidState>>;
  addMessage: (role: 'user' | 'assistant', content: string) => Message;
  getMessages: () => Message[];
  setLanguage: (lang: string) => void;
  setIsProcessing: (value: boolean) => void;
  recordTimeStep: (args: {
    type: TimeStepType;
    messages: Message[];
    meta?: StepMeta;
    nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
    setCurrentRevisionId?: string | null;
  }) => Promise<void>;
};

export type StudioContext = StudioActionsDeps & {
  getRelevantMessages: () => Message[];
  getNonAutoLanguage: () => string;
  resolveLanguage: (text?: string) => string;
  normalizeText: (text: string) => string;
  getDiagramContextMessage: () => Message | null;
  buildLLMMessages: (relevantMessages: Message[]) => Message[];
  getLastUserText: (relevantMessages: Message[]) => string;
  applyCompiledResult: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
  applyValidationPreservingSource: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
};

export const createStudioContext = (deps: StudioActionsDeps): StudioContext => {
  const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
  const getRelevantMessages = () => deps.getMessages().filter((m) => m.id !== 'init');
  const getNonAutoLanguage = () => (deps.appState.language === 'auto' ? 'English' : deps.appState.language);

  const resolveLanguage = (text?: string): string => {
    if (deps.appState.language !== 'auto') return deps.appState.language;

    const basis =
      text?.trim() ||
      deps
        .getMessages()
        .slice()
        .reverse()
        .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;

    if (!basis) return 'English';

    const detected = detectLanguage(basis);
    deps.setLanguage(detected);
    return detected;
  };

  const getDiagramContextMessage = (): Message | null => {
    const code = deps.mermaidState.code.trim();
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

  const buildLLMMessages = (relevantMessages: Message[]) => {
    const diagramContext = getDiagramContextMessage();
    return diagramContext ? [...relevantMessages, diagramContext] : relevantMessages;
  };

  const getLastUserText = (relevantMessages: Message[]) =>
    relevantMessages
      .slice()
      .reverse()
      .find((m) => m.role === 'user' && m.content.trim().length > 0)?.content ?? '';

  const applyCompiledResult = (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => {
    deps.setMermaidState((prev) => ({
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

  const applyValidationPreservingSource = (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => {
    deps.setMermaidState((prev) => ({
      ...prev,
      code,
      isValid: v.isValid ?? false,
      lastValidCode: v.lastValidCode ?? prev.lastValidCode,
      errorMessage: v.errorMessage,
      errorLine: v.errorLine,
      status: v.isValid ? 'valid' : 'invalid',
    }));
  };

  return {
    ...deps,
    getRelevantMessages,
    getNonAutoLanguage,
    resolveLanguage,
    normalizeText,
    getDiagramContextMessage,
    buildLLMMessages,
    getLastUserText,
    applyCompiledResult,
    applyValidationPreservingSource,
  };
};
