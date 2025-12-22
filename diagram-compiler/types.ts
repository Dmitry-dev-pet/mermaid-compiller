export type Provider = 'openrouter' | 'cliproxy';

export type DiagramType =
  'architecture'
  | 'block'
  | 'c4'
  | 'class'
  | 'er'
  | 'flowchart'
  | 'gantt'
  | 'gitGraph'
  | 'kanban'
  | 'mindmap'
  | 'packet'
  | 'pie'
  | 'quadrantChart'
  | 'radar'
  | 'requirementDiagram'
  | 'sequence'
  | 'sankey'
  | 'state'
  | 'timeline'
  | 'treemap'
  | 'userJourney'
  | 'xychart'
  | 'zenuml';

export interface Model {
  id: string;
  name: string;
  contextLength?: number;
  isFree?: boolean;
  vendor?: string;
}

export interface OpenRouterFilters {
  vendor: string;
  freeOnly: boolean;
  testedOnly: boolean;
  experimental: boolean;
  minContextWindow: number;
}

export interface CliproxyFilters {
  vendor: string;
}

export type ProviderFilters = {
  openrouter: OpenRouterFilters;
  cliproxy: CliproxyFilters;
};

export interface AIConfig {
  provider: Provider;
  openRouterKey: string;
  openRouterEndpoint: string;
  proxyKey: string;
  proxyEndpoint: string;
  selectedModelId: string;
  selectedModelIdByProvider: Record<Provider, string>;
  filtersByProvider: ProviderFilters;
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

export interface DiagramIntent {
  content: string;
  source: 'chat' | 'build' | 'fallback';
  updatedAt: number;
}

export type DocsMode = 'chat' | 'build' | 'analyze' | 'fix';

export type PromptPreviewMode = 'chat' | 'build' | 'analyze' | 'fix';
export type EditorTab =
  | 'code'
  | 'markdown_mermaid'
  | 'build_docs';

export interface LLMRequestPreview {
  mode: PromptPreviewMode;
  diagramType: DiagramType;
  language: string;
  systemPrompt: string;
  systemPromptRedacted?: string;
  docsContext: string;
  messages: Message[];
  error?: string;
}

export interface PromptPreviewTab {
  title: string;
  content: string;
  redactedContent?: string;
  rawContent?: string;
  systemPrompt?: string;
  systemPromptRedacted?: string;
  language?: string;
  updatedAt: number;
  tokenCounts?: PromptTokenCounts;
}

export interface PromptTokenCounts {
  system: number;
  messages: number;
  total: number;
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
  analyzeLanguage: string;
}
