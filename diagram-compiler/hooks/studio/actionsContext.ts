import type { Dispatch, SetStateAction } from 'react';
import type { AIConfig, AppState, ConnectionState, MermaidState, Message, DiagramIntent, DocsMode } from '../../types';
import { MermaidMarkdownBlock, replaceMermaidBlockInMarkdown, validateMermaid } from '../../services/mermaidService';
import type { AnalyticsContext } from '../../services/analyticsService';
import { detectLanguage } from '../../utils';
import { normalizeIntentText } from '../../utils/intent';
import type { StepMeta, TimeStepType } from '../../services/history/types';

export type MermaidUpdateTarget =
  | { mode: 'markdown'; block: MermaidMarkdownBlock }
  | { mode: 'code' };

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
  getDiagramContextCode?: () => string;
  getAnalyticsContext?: (mode: DocsMode) => Promise<AnalyticsContext>;
  trackAnalyticsEvent?: (event: string, payload?: Record<string, unknown>) => void;
  resolveMermaidUpdateTarget?: () => MermaidUpdateTarget | null;
  setIsProcessing: (value: boolean) => void;
  getDocsContext: (mode: DocsMode) => Promise<string>;
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
  resolveMermaidUpdate: (code: string, validation: Awaited<ReturnType<typeof validateMermaid>>) => Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'>;
  applyCompiledResult: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
  applyValidationPreservingSource: (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => void;
  getAnalyticsContext: (mode: DocsMode) => Promise<AnalyticsContext>;
  trackAnalyticsEvent: (event: string, payload?: Record<string, unknown>) => void;
  getCurrentModelName: () => string;
  getDocsContext: (mode: DocsMode) => Promise<string>;
  safeRecordTimeStep: StudioActionsDeps['recordTimeStep'];
};

export const createStudioContext = (deps: StudioActionsDeps): StudioContext => {
  const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
  const getRelevantMessages = () => deps.getMessages().filter((m) => m.id !== 'init');

  const resolveLanguage = (text?: string): string => {
    if (deps.appState.language && deps.appState.language !== 'auto') {
      return deps.appState.language;
    }
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
    const code = deps.getDiagramContextCode ? deps.getDiagramContextCode().trim() : deps.mermaidState.code.trim();
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
    content: `Intent:\n${normalizeIntentText(intentText)}`,
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

  const resolveMermaidUpdateTarget = () => {
    return deps.resolveMermaidUpdateTarget?.() ?? null;
  };

  const resolveMermaidCode = (code: string) => {
    const target = resolveMermaidUpdateTarget();
    if (target?.mode === 'markdown') {
      return replaceMermaidBlockInMarkdown(deps.mermaidState.code, target.block, code);
    }
    return code;
  };

  const resolveMermaidUpdate = (
    code: string,
    validation: Awaited<ReturnType<typeof validateMermaid>>
  ): Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> => {
    const target = resolveMermaidUpdateTarget();
    if (target?.mode === 'markdown') {
      return {
        code: resolveMermaidCode(code),
        isValid: true,
        errorMessage: undefined,
        errorLine: undefined,
      };
    }
    return {
      code,
      isValid: !!validation.isValid,
      errorMessage: validation.errorMessage,
      errorLine: validation.errorLine,
    };
  };

  const applyCompiledResult = (code: string, v: Awaited<ReturnType<typeof validateMermaid>>) => {
    const target = resolveMermaidUpdateTarget();
    if (target?.mode === 'markdown') {
      const nextCode = replaceMermaidBlockInMarkdown(deps.mermaidState.code, target.block, code);
      deps.setMermaidState((prev) => ({
        ...prev,
        code: nextCode,
        isValid: true,
        lastValidCode: nextCode,
        errorMessage: undefined,
        errorLine: undefined,
        status: nextCode.trim() ? 'valid' : 'empty',
        source: 'compiled',
      }));
      return;
    }

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

  const getAnalyticsContext = async (mode: DocsMode) => {
    return deps.getAnalyticsContext
      ? deps.getAnalyticsContext(mode)
      : {
          provider: deps.aiConfig.provider,
          model: deps.aiConfig.selectedModelId || null,
          modelParams: { temperature: 0.2 },
          modelFilters: deps.aiConfig.filtersByProvider[deps.aiConfig.provider] ?? null,
          diagramType: deps.appState.diagramType,
          language: deps.appState.language ?? null,
          analyzeLanguage: deps.appState.analyzeLanguage ?? null,
        };
  };

  const trackAnalyticsEvent = (event: string, payload: Record<string, unknown> = {}) => {
    deps.trackAnalyticsEvent?.(event, payload);
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

  const safeRecordTimeStep: StudioActionsDeps['recordTimeStep'] = async (args) => {
    try {
      await deps.recordTimeStep(args);
    } catch (e) {
      console.error('Failed to record history step', e);
    }
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
    resolveMermaidUpdate,
    applyCompiledResult,
    applyValidationPreservingSource,
    getAnalyticsContext,
    trackAnalyticsEvent,
    getCurrentModelName,
    safeRecordTimeStep,
  };
};
