import { AIConfig, Message, DiagramType, Model } from '../types';
import { LLMProviderStrategy } from './llm/LLMProviderStrategy';
import { OpenRouterStrategy } from './llm/OpenRouterStrategy';
import { CliproxyStrategy } from './llm/CliproxyStrategy';
import { withTimeout } from './llmTimeout';

// Instantiate strategies
const openRouterStrategy = new OpenRouterStrategy();
const cliproxyStrategy = new CliproxyStrategy();

/**
 * Selects the appropriate LLM strategy based on the AIConfig provider.
 * @param config The AI configuration.
 * @returns The selected LLM provider strategy.
 * @throws Error if an unsupported provider is specified.
 */
const getStrategy = (config: AIConfig): LLMProviderStrategy => {
  switch (config.provider) {
    case 'openrouter':
      return openRouterStrategy;
    case 'cliproxy':
      return cliproxyStrategy;
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
};

export const fetchModels = async (config: AIConfig): Promise<Model[]> => {
  const strategy = getStrategy(config);
  return strategy.fetchModels(config);
};

export const generateDiagram = async (
  messages: Message[],
  config: AIConfig,
  diagramType: DiagramType,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.generateDiagram(messages, config, diagramType, docsContext, language));
};

export const fixDiagram = async (
  code: string,
  error: string,
  config: AIConfig,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.fixDiagram(code, error, config, docsContext, language));
};

export const chat = async (
  messages: Message[],
  config: AIConfig,
  diagramType: DiagramType,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.chat(messages, config, diagramType, docsContext, language));
};

export const analyzeDiagram = async (
  code: string,
  config: AIConfig,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.analyzeDiagram(code, config, docsContext, language));
};

export const planNotebook = async (
  messages: Message[],
  config: AIConfig,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.planNotebook(messages, config, docsContext, language));
};

export const chatNotebook = async (
  messages: Message[],
  config: AIConfig,
  docsContext: string,
  language: string
): Promise<string> => {
  const strategy = getStrategy(config);
  return withTimeout(strategy.chatNotebook(messages, config, docsContext, language));
};
