import { AIConfig, Message, Model } from '../../types';

export interface LLMProviderStrategy {
  fetchModels(config: AIConfig): Promise<Model[]>;
  generateDiagram(messages: Message[], config: AIConfig, diagramType: string, docsContext: string, language: string): Promise<string>;
  fixDiagram(code: string, errorMessage: string, config: AIConfig, docsContext: string, language: string): Promise<string>;
  chat(messages: Message[], config: AIConfig, diagramType: string, docsContext: string, language: string): Promise<string>;
  analyzeDiagram(code: string, config: AIConfig, docsContext: string, language: string): Promise<string>;
}
