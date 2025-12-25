import type { AIConfig, AppState, Message } from '../../types';

export type TimeStepType =
  | 'seed'
  | 'manual_edit'
  | 'chat'
  | 'build'
  | 'fix'
  | 'analyze'
  | 'recompile'
  | 'system';

export type StepMeta = Record<string, unknown>;

export interface HistorySession {
  id: string;
  createdAt: number;
  updatedAt?: number;
  title?: string;
  nextStepIndex: number;
  currentRevisionId: string | null;
  settings?: SessionSettings;
}

export interface SessionSettings {
  appState: AppState;
  aiConfig: AIConfig;
  modelParams?: Record<string, number | string | boolean | null>;
}

export interface TimeStep {
  id: string;
  sessionId: string;
  index: number;
  type: TimeStepType;
  createdAt: number;
  messages: Message[];
  currentRevisionId: string | null;
  meta?: StepMeta;
}

export interface RevisionDiagnostics {
  isValid: boolean;
  errorMessage?: string;
  errorLine?: number;
}

export interface DiagramRevision {
  id: string;
  sessionId: string;
  createdAt: number;
  createdByStepId: string;
  parentRevisionId: string | null;
  mermaid: string;
  diagnostics?: RevisionDiagnostics;
}
