import { AIConfig, Message, Model, DiagramType } from '../../types';
import { LLMProviderStrategy } from './LLMProviderStrategy';

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
}

const getLanguageInstruction = (lang: string) => 
  (lang && lang !== 'auto') ? `\nIMPORTANT: Respond in ${lang}.` : '';

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


    const endpoint = `${baseUrl}/chat/completions`;

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
      const response = await fetch(`${baseUrl}/v1/models`, { headers });
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
    const typeRule = diagramType 
      ? `You MUST generate a ${diagramType} diagram.`
      : `Default to 'flowchart TD' if unspecified.`;

    const systemPrompt = `You are an expert Mermaid.js generator.
Goal: Generate VALID Mermaid code based on the conversation history.

Rules:
1. Output ONLY Mermaid code inside 
2. No chatter.
3. ${typeRule}
4. Use provided documentation context if relevant.${getLanguageInstruction(language)}

Docs Context:
${docsContext.slice(0, 2000)}... (truncated)
`;
    return this.fetchCompletion(messages, config, systemPrompt);
  }

  async fixDiagram(
    code: string,
    errorMessage: string,
    config: AIConfig,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = `You are a Mermaid code repair assistant.
Fix the syntax error in the provided code.
Return ONLY the corrected code block.${getLanguageInstruction(language)}

Docs Context:
${docsContext.slice(0, 1000)}...`;

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
    const typeRule = diagramType 
      ? `Preferred Diagram Type: ${diagramType}.`
      : `Default to 'flowchart TD' if unspecified.`;

    const systemPrompt = `You are a Mermaid.js diagram assistant in CHAT mode.

GOAL:
- Help the user reason about the diagram and requirements using TEXT ONLY.

RULES:
1. Output plain text only. Do NOT output Mermaid code or any fenced code blocks.
2. You may receive the current Mermaid diagram code in the conversation context; use it to answer, but do not quote it verbatim.
3. If the user asks to generate/update/simplify the diagram, explain what to change and tell them to press the Build button to apply it.
4. Ask clarifying questions when the request is ambiguous.
5. Respect the ${typeRule} in your guidance unless the user explicitly asks for a different type.${getLanguageInstruction(language)}

Docs Context:
${docsContext.slice(0, 1200)}...
`;

    return this.fetchCompletion(messages, config, systemPrompt);
  }

  async analyzeDiagram(
    code: string,
    config: AIConfig,
    docsContext: string,
    language: string
  ): Promise<string> {
    const systemPrompt = `You are an expert Mermaid.js diagram explainer.
Explain the provided Mermaid code in a concise and clear manner.
Focus on describing the structure, components, and relationships.
If there are any syntax errors or unusual patterns, highlight them.
DO NOT generate any Mermaid code.
Use the provided documentation context if relevant.${getLanguageInstruction(language)}

Docs Context:
${docsContext.slice(0, 1000)}...
`;

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
