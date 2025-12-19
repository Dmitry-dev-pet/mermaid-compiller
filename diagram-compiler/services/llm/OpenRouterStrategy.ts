import { AIConfig, Message, Model, DiagramType } from '../../types';
import { LLMProviderStrategy } from './LLMProviderStrategy';
import { buildSystemPrompt } from './prompts';

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
}


/**
 * OpenRouter-specific implementation of LLMProviderStrategy
 */
export class OpenRouterStrategy implements LLMProviderStrategy {
  // ... fetchCompletion and fetchModels remain the same ...

  private async fetchCompletion(
    messages: Message[],
    config: AIConfig,
    systemPrompt?: string
  ): Promise<string> {
    const baseUrl = config.openRouterEndpoint.replace(/\/$/, '');
    const apiKey = config.openRouterKey;
    const model = config.selectedModelId;

    if (!baseUrl) throw new Error("OpenRouter API Endpoint not configured");
    if (!model) throw new Error("No model selected for OpenRouter");
    if (!apiKey) throw new Error("OpenRouter API Key not configured");


    const v1BaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

    const endpoint = `${v1BaseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    
    // OpenRouter specific headers
    headers['X-Title'] = 'Mermaid Graph Gen';

    // Convert internal Message type to OpenAI format
    const apiMessages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: apiMessages,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errorMessage = `API Error (${response.status})`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error?.message) errorMessage += `: ${errJson.error.message}`;
        } catch {
          errorMessage += `: ${errText.slice(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (error: unknown) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(`Connection failed to ${baseUrl}. Check CORS/Network.`);
      }
      throw error;
    }
  }

  async fetchModels(config: AIConfig): Promise<Model[]> {
    const baseUrl = config.openRouterEndpoint.replace(/\/$/, '');
    const apiKey = config.openRouterKey;
    
    if (!baseUrl) return [];
    if (!apiKey) return []; // Cannot fetch models without API key for OpenRouter

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`
    };

    try {
      const v1BaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;

      const response = await fetch(`${v1BaseUrl}/models`, { headers });
      if (!response.ok) {
        // If authentication fails, or other error, return empty
        console.warn("Failed to fetch OpenRouter models:", response.status, await response.text());
        return [];
      }
      const data = await response.json();

      let rawList: OpenRouterModel[] = [];
      if (Array.isArray(data.data)) rawList = data.data as OpenRouterModel[];
      else if (Array.isArray(data)) rawList = data as OpenRouterModel[];

      // Filter based on config.filters
      const filteredModels = rawList.filter((m) => {
        if (config.filters.freeOnly && !m.id.includes('free')) return false; // naive check for 'free' in id
        // Add more filter logic here if OpenRouter API provides fields like context_length, etc.
        return true;
      });

      return filteredModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        contextLength: m.context_length || 0,
        isFree: m.id.includes('free') // naive check
      }));
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      return [];
    }
  }

  async generateDiagram(
    messages: Message[],
    config: AIConfig,
    diagramType: DiagramType,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt('generate', { diagramType, docsContext, language });
    return this.fetchCompletion(messages, config, systemPrompt);
  }

  async fixDiagram(
    code: string,
    errorMessage: string,
    config: AIConfig,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt('fix', { docsContext, language });

    const fixMsg: Message = {
      id: 'fix-req',
      role: 'user',
      content: `Code:


${code}


Error: ${errorMessage}

Fix it.`, 
      timestamp: Date.now()
    };

    return this.fetchCompletion([fixMsg], config, systemPrompt);
  }

  async chat(
    messages: Message[],
    config: AIConfig,
    diagramType: DiagramType,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt('chat', { diagramType, docsContext, language });
    return this.fetchCompletion(messages, config, systemPrompt);
  }

  async analyzeDiagram(
    code: string,
    config: AIConfig,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt('analyze', { docsContext, language });

    const analyzeMsg: Message = {
      id: 'analyze-req',
      role: 'user',
      content: `Analyze and explain the following Mermaid code:

\`\`\`mermaid
${code}
\`\`\`
`, 
      timestamp: Date.now()
    };

    return this.fetchCompletion([analyzeMsg], config, systemPrompt);
  }
}
