export type Provider = 'openrouter' | 'cliproxy';

export type DiagramType =
  'sequence'
  | 'flowchart'
  | 'er'
  | 'c4'
  | 'class'
  | 'state'
  | 'gantt'
  | 'mindmap'
  | 'pie'
  | 'timeline'
  | 'userJourney';

export interface Model {
  id: string;
  name: string;
  contextLength?: number;
  isFree?: boolean;
}

export interface AIConfig {
  provider: Provider;
  openRouterKey: string;
  openRouterEndpoint: string;
  proxyKey: string;
  proxyEndpoint: string;
  selectedModelId: string;
  filters: {
    freeOnly: boolean;
    context8k: boolean;
    testedOnly: boolean;
    experimental: boolean;
  };
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
  error?: string;
  availableModels: Model[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface MermaidState {
  code: string;
  isValid: boolean;
  lastValidCode: string; // For rendering prev state if broken
  errorLine?: number;
  errorMessage?: string;
  source: 'user' | 'compiled' | 'user-override';
  status: 'empty' | 'valid' | 'invalid' | 'edited';
}

export interface AppState {
  diagramType: DiagramType;
  columnWidths: [number, number, number]; // percentages
  isResizing: number | null;
  isPreviewFullScreen: boolean;
  theme: 'light' | 'dark';
  language: string;
}
