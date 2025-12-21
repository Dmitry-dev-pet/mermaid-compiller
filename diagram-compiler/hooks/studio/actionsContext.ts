import type { Dispatch, SetStateAction } from 'react';
import type { AIConfig, AppState, ConnectionState, MermaidState, Message, DiagramIntent } from '../../types';
import { validateMermaid } from '../../services/mermaidService';
import { detectLanguage } from '../../utils';
import type { StepMeta, TimeStepType } from '../../services/history/types';

export type StudioActionsDeps = {
  aiConfig: AIConfig;
  connectionState: ConnectionState;
  appState: AppState;
  mermaidState: MermaidState;
  diagramIntent: DiagramIntent | null;
  setDiagramIntent: Dispatch<SetStateAction<DiagramIntent | null>>;
  setMermaidState: Dispatch<SetStateAction<MermaidState>>;
  addMessage: (role: 'user' | 'assistant', content: string) => Message;
  getMessages: () => Message[];
  setIsProcessing: (value: boolean) => void;
  getBuildDocsContext: () => Promise<string>;
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
  resolveLanguage: (text?: string) => string;
  resolveAnalyzeLanguage: () => string;
  normalizeText: (text: string) => string;
  getDiagramContextMessage: () => Message | null;
  getIntentMessage: (intentText: string) => Message;
  getCurrentIntent: () => DiagramIntent | null;
  setCurrentIntent: (intent: DiagramIntent | null) => void;
  buildLLMMessages: (relevantMessages: Message[]) => Message[];
  getLastUserText: (relevantMessages: Message[]) => string;
  applyCompiledResult: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
  applyValidationPreservingSource: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
  getCurrentModelName: () => string;
  getBuildDocsContext: () => Promise<string>;
};

export const createStudioContext = (deps: StudioActionsDeps): StudioContext => {
  const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
  const getRelevantMessages = () => deps.getMessages().filter((m) => m.id !== 'init');

  const resolveLanguage = (text?: string): string => {
    const basis =
      text?.trim() ||
      deps
        .getMessages()
        .slice()
        .reverse()
        .find((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0)?.content;

    if (!basis) return 'English';

    return detectLanguage(basis);
  };

  const resolveAnalyzeLanguage = (): string => {
    const configured = deps.appState.analyzeLanguage;
    if (configured && configured !== 'auto') return configured;
    return resolveLanguage();
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

  const getIntentMessage = (intentText: string): Message => ({
    id: 'diagram-intent',
    role: 'user',
    content: `Intent:\n${intentText.trim()}`,
    timestamp: Date.now(),
  });

  const getCurrentIntent = () => deps.diagramIntent;
  const setCurrentIntent = (intent: DiagramIntent | null) => {
    deps.setDiagramIntent(intent);
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

  const getCurrentModelName = () => {
    const modelId = deps.aiConfig.selectedModelId;
    return modelId ? `model=${modelId}` : 'model=unknown';
  };

  return {
    ...deps,
    getRelevantMessages,
    resolveLanguage,
    resolveAnalyzeLanguage,
    normalizeText,
    getDiagramContextMessage,
    getIntentMessage,
    getCurrentIntent,
    setCurrentIntent,
    buildLLMMessages,
    getLastUserText,
    applyCompiledResult,
    applyValidationPreservingSource,
    getCurrentModelName,
  };
};
