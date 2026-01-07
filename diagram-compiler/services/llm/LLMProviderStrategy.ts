import type { AIConfig, Message, Model, ModelParams } from '../../types';

export interface LLMProviderStrategy {
  fetchModels(config: AIConfig): Promise<Model[]>;
  generateDiagram(messages: Message[], config: AIConfig, diagramType: string, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  fixDiagram(code: string, errorMessage: string, config: AIConfig, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  chat(messages: Message[], config: AIConfig, diagramType: string, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  chatDiagram(messages: Message[], config: AIConfig, diagramType: string, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  chatNotebook(messages: Message[], config: AIConfig, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  analyzeDiagram(code: string, config: AIConfig, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  planNotebook(messages: Message[], config: AIConfig, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
  summarizeBuild(messages: Message[], config: AIConfig, docsContext: string, language: string, modelParams?: ModelParams | null): Promise<string>;
}
