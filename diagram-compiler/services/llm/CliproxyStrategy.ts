import { AIConfig, Message, Model, DiagramType } from '../../types';
import { LLMProviderStrategy } from './LLMProviderStrategy';

interface CliproxyModel {
  id: string;
  name?: string;
  context_length?: number;
}

type CliproxyModelEntry = CliproxyModel | string;

const getLanguageInstruction = (lang: string) => 
  (lang && lang !== 'auto') ? `\nIMPORTANT: Respond in ${lang}.` : '';

/**
 * Cliproxy-specific implementation of LLMProviderStrategy
 */
export class CliproxyStrategy implements LLMProviderStrategy {
  // ... fetchCompletion and fetchModels remain the same ...

  private async fetchCompletion(
    messages: Message[],
    config: AIConfig,
    systemPrompt?: string
  ): Promise<string> {
    const baseUrl = config.proxyEndpoint.replace(/\/$/, '');
    const apiKey = config.proxyKey;
    const model = config.selectedModelId;

    if (!baseUrl) throw new Error("Cliproxy API Endpoint not configured");
    if (!model) throw new Error("No model selected for Cliproxy");
    if (!apiKey) console.warn("Cliproxy API Key not configured. Proceeding without key.");


    const endpoint = `${baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Only add Authorization header if apiKey is present
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

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
    const baseUrl = config.proxyEndpoint.replace(/\/$/, '');
    const apiKey = config.proxyKey;
    
    if (!baseUrl) return [];

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const tryEndpoint = async (path: string): Promise<unknown | null> => {
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers });
        if (response.ok) return await response.json();
        return null;
      } catch {
        return null;
      }
    };

    // Try standard endpoints for models
    let data = await tryEndpoint('/v1/models');
    if (!data) data = await tryEndpoint('/models');
    if (!data) data = await tryEndpoint('/api/models');

    if (!data) {
      return [];
    }

    const hasDataArray = (value: unknown): value is { data: unknown } =>
      typeof value === 'object' && value !== null && 'data' in value;

    let rawList: CliproxyModelEntry[] = [];
    if (hasDataArray(data) && Array.isArray(data.data)) rawList = data.data as CliproxyModelEntry[];
    else if (Array.isArray(data)) rawList = data as CliproxyModelEntry[];

    // Apply filtering if necessary, Cliproxy might return a pre-filtered list or not support it.
    // For now, assuming raw list directly maps.
    return rawList.map((m) => ({
      id: typeof m === 'string' ? m : m.id,
      name: typeof m === 'string' ? m : (m.name || m.id),
      contextLength: typeof m === 'string' ? 0 : (m.context_length || 0),
      isFree: false, // Cliproxy typically proxies paid models or local ones
    }));
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
