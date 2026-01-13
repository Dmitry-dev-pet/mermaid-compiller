import { detectMermaidDiagramType, extractMermaidCode, parseMermaidJsonResponse, validateMermaid } from '../../services/mermaidService';
import { generateDiagram, fixDiagram } from '../../services/llmService';
import { runAttemptLoop } from './retry';
import { runAutoFixLoop } from './autoFix';
import { runLLMRequest } from '../../services/llmRequestRunner';
import { LLM_TIMEOUT_MS, LLM_TIMEOUT_RETRIES } from '../../constants';
import { formatMermaidErrorLine, sanitizeMermaidByType } from '../../utils/mermaidSanitizer';
import { augmentMermaidErrorForAutoFix } from '../../utils/mermaidAutoFixHints';
import type { AIConfig, DiagramType, Message, ModelParams } from '../../types';
import type { StudioOperationRunner } from './operationRunner';

type BuildAttemptCallbacks = {
  onAttempt?: (attempt: number, maxAttempts: number) => void;
  onEmpty?: (attempt: number, maxAttempts: number) => void;
  onError?: (attempt: number, maxAttempts: number, message: string) => void;
  onJsonStatus?: (attempt: number, status: string, reason?: string) => void;
  onTypeMismatch?: (attempt: number, expected: DiagramType, received: string) => void;
};

type BuildAutoFixCallbacks = {
  onAutoFixAttempt?: (attempt: number, maxAttempts: number, errorLine?: string) => void;
  onAutoFixIteration?: (code: string, validation: Awaited<ReturnType<typeof validateMermaid>>) => void;
};

type BuildValidationCallbacks = {
  onValidation?: (isValid: boolean, autoFixAttempts: number) => void;
  onValidationError?: (errorLine: string) => void;
};

type BuildPipelineOptions = {
  aiConfig: AIConfig;
  modelParams?: ModelParams | null;
  diagramType: DiagramType;
  llmMessages: Message[];
  docs: string;
  language: string;
  maxAttempts: number;
  autoFixMaxAttempts: number;
  buildRequestRetries?: number;
  autoFixRequestRetries?: number;
  timeoutMs?: number;
  fallbackCode?: string | null;
  allowFallback?: boolean;
  callbacks?: BuildAttemptCallbacks & BuildAutoFixCallbacks & BuildValidationCallbacks;
  onLLMRequestStart?: (notice: import('../../services/llmRequestRunner').LLMRequestStartNotice) => void;
  runner?: StudioOperationRunner;
  stageContextScope?: import('../../types').OperationEvent['contextScope'];
  contextEvent?: {
    title?: string;
    detail: string;
    tooltipMessages?: string;
    tooltipDocs?: string;
    kind?: import('../../types').OperationEvent['kind'];
    contextScope?: import('../../types').OperationEvent['contextScope'];
  };
};

type BuildPipelineResult = {
  status: 'ok' | 'error';
  code: string;
  validation: Awaited<ReturnType<typeof validateMermaid>>;
  autoFixAttempts: number;
  attempts: number;
  emptyResponses: number;
  usedFallback: boolean;
  lastError?: string;
};

export const getFallbackMermaid = (diagramType: DiagramType): string | null => {
  switch (diagramType) {
    case 'flowchart':
      return [
        'flowchart TD',
        'A["Start"] --> B["End"]',
      ].join('\n');
    case 'sequence':
      return [
        'sequenceDiagram',
        'participant A as User',
        'participant B as System',
        'A->>B: Request',
        'B-->>A: Response',
      ].join('\n');
    case 'er':
      return [
        'erDiagram',
        'USER ||--o{ ORDER : places',
        'USER {',
        '  int id',
        '}',
        'ORDER {',
        '  int id',
        '}',
      ].join('\n');
    case 'architecture':
      return [
        'architecture-beta',
        '  service client(server)[Client]',
        '  service proxy(server)[Proxy]',
        '  service target(server)[Target]',
        '  client:R -- L:proxy',
        '  proxy:R -- L:target',
      ].join('\n');
    default:
      return null;
  }
};

export const runBuildPipeline = async (options: BuildPipelineOptions): Promise<BuildPipelineResult> => {
  const {
    aiConfig,
    modelParams,
    diagramType,
    llmMessages,
    docs,
    language,
    maxAttempts,
    autoFixMaxAttempts,
    buildRequestRetries = 1,
    autoFixRequestRetries = LLM_TIMEOUT_RETRIES,
    timeoutMs,
    fallbackCode,
    allowFallback = true,
    callbacks,
    onLLMRequestStart,
    runner,
    stageContextScope,
    contextEvent,
  } = options;
  let currentAttempt = 0;
  let suppressEmpty = false;
  let contextSent = false;
  const attemptResult = await runAttemptLoop({
    maxAttempts,
    onAttempt: (attempt) => {
      currentAttempt = attempt;
      callbacks?.onAttempt?.(attempt, maxAttempts);
    },
    onEmpty: (attempt) => {
      if (suppressEmpty) {
        suppressEmpty = false;
        return;
      }
      callbacks?.onEmpty?.(attempt, maxAttempts);
    },
    onError: (attempt, error) => {
      const message = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(attempt, maxAttempts, message);
    },
    execute: async () => {
      const rawCode = runner
        ? await runner.runLLM({
            task: 'build',
            phase: 'build',
            run: () => generateDiagram(llmMessages, aiConfig, diagramType, docs, language, modelParams),
            retries: buildRequestRetries,
            timeoutMs: timeoutMs ?? LLM_TIMEOUT_MS,
            stageContextScope,
            contextEvent: contextEvent && !contextSent ? contextEvent : undefined,
          })
        : await runLLMRequest({
            task: 'build',
            run: () => generateDiagram(llmMessages, aiConfig, diagramType, docs, language, modelParams),
            retries: buildRequestRetries,
            timeoutMs,
            onStart: onLLMRequestStart,
          });
      contextSent = true;
      const parsed = parseMermaidJsonResponse(rawCode);
      if (parsed) {
        if (parsed.status !== 'ok') {
          suppressEmpty = true;
          callbacks?.onJsonStatus?.(currentAttempt, parsed.status, parsed.reason);
          return null;
        }
        if (!parsed.mermaid?.trim()) {
          return null;
        }
        if (diagramType !== 'auto' && parsed.diagramType && parsed.diagramType !== diagramType) {
          suppressEmpty = true;
          callbacks?.onTypeMismatch?.(currentAttempt, diagramType, parsed.diagramType);
          return null;
        }
        return parsed.mermaid;
      }
      const cleanCode = extractMermaidCode(rawCode);
      if (!cleanCode.trim()) return null;
      if (diagramType !== 'auto') {
        const detectedType = detectMermaidDiagramType(cleanCode.trim());
        if (detectedType && detectedType !== diagramType) {
          suppressEmpty = true;
          callbacks?.onTypeMismatch?.(currentAttempt, diagramType, detectedType);
          return null;
        }
      }
      return cleanCode;
    },
  });

  const resolvedFallback = allowFallback
    ? (fallbackCode ?? getFallbackMermaid(diagramType))
    : (fallbackCode ?? '');
  const resolvedCode = attemptResult.value?.trim() || resolvedFallback?.trim() || '';
  const usedFallback = !attemptResult.value?.trim() && !!resolvedFallback;

  if (!resolvedCode) {
    return {
      status: 'error',
      code: '',
      validation: await validateMermaid('', { logError: false }),
      autoFixAttempts: 0,
      attempts: attemptResult.attempts,
      emptyResponses: attemptResult.emptyResponses,
      usedFallback: false,
      lastError: attemptResult.lastError ?? 'no_mermaid_code',
    };
  }

  const sanitized = sanitizeMermaidByType(diagramType, resolvedCode);
  const initialValidation = await validateMermaid(sanitized, { logError: false });
  let autoFixAttempt = 0;
  const { code: currentCode, validation, attempts: autoFixAttempts } = await runAutoFixLoop({
    initialCode: sanitized,
    initialValidation,
    maxAttempts: autoFixMaxAttempts,
    validate: (code) => validateMermaid(sanitizeMermaidByType(diagramType, code), { logError: false }),
    fix: async (code, errorMessage) => {
      autoFixAttempt += 1;
      const currentAttempt = Math.min(autoFixAttempt, autoFixMaxAttempts);
      const enrichedErrorMessage = augmentMermaidErrorForAutoFix(diagramType, errorMessage);
      const errorLine = formatMermaidErrorLine(enrichedErrorMessage, 200);
      callbacks?.onAutoFixAttempt?.(currentAttempt, autoFixMaxAttempts, errorLine || undefined);
      const fixedRaw = runner
        ? await runner.runLLM({
            task: 'auto-fix',
            phase: 'fix',
            run: () => fixDiagram(code, enrichedErrorMessage, aiConfig, docs, language, modelParams),
            retries: autoFixRequestRetries,
            timeoutMs: timeoutMs ?? LLM_TIMEOUT_MS,
            stageContextScope,
          })
        : await runLLMRequest({
            task: 'auto-fix',
            run: () => fixDiagram(code, enrichedErrorMessage, aiConfig, docs, language, modelParams),
            retries: autoFixRequestRetries,
            timeoutMs,
            onStart: onLLMRequestStart,
          });
      return sanitizeMermaidByType(diagramType, extractMermaidCode(fixedRaw));
    },
    onIteration: (code, nextValidation) => {
      callbacks?.onAutoFixIteration?.(code, nextValidation);
    },
  });

  callbacks?.onValidation?.(validation.isValid, autoFixAttempts);
  if (!validation.isValid && validation.errorMessage) {
    const errorLine = formatMermaidErrorLine(validation.errorMessage, 180);
    if (errorLine) callbacks?.onValidationError?.(errorLine);
  }

  return {
    status: 'ok',
    code: currentCode,
    validation,
    autoFixAttempts,
    attempts: attemptResult.attempts,
    emptyResponses: attemptResult.emptyResponses,
    usedFallback,
    lastError: attemptResult.lastError ?? undefined,
  };
};
