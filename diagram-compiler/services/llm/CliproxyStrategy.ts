import type {
  AIConfig,
  Message,
  Model,
  ModelParams,
} from "../../types";
import { LLMProviderStrategy } from "./LLMProviderStrategy";
import { buildSystemPrompt } from "./prompts";
import { deriveModelVendor } from "./modelVendor";
import { resolveModelParams } from "./modelParams";

interface CliproxyModel {
  id: string;
  name?: string;
  context_length?: number;
}

type CliproxyModelEntry = CliproxyModel | string;

/**
 * Cliproxy-specific implementation of LLMProviderStrategy
 */
export class CliproxyStrategy implements LLMProviderStrategy {
  // ... fetchCompletion and fetchModels remain the same ...

  private getProxyConfig(config: AIConfig): { baseUrl: string; apiKey: string } {
    if (config.provider === 'agent') {
      return { baseUrl: config.agentEndpoint, apiKey: config.agentToken };
    }
    return { baseUrl: config.proxyEndpoint, apiKey: config.proxyKey };
  }

  private async fetchCompletion(
    messages: Message[],
    config: AIConfig,
    systemPrompt?: string,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const proxyConfig = this.getProxyConfig(config);
    const baseUrl = proxyConfig.baseUrl.replace(/\/$/, "");
    const apiKey = proxyConfig.apiKey;
    const model = config.selectedModelId;

    if (!baseUrl) throw new Error("Cliproxy API Endpoint not configured");
    if (!model) throw new Error("No model selected for Cliproxy");
    if (!apiKey)
      console.warn("Cliproxy API Key not configured. Proceeding without key.");

    const endpoint = `${baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Only add Authorization header if apiKey is present
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    // Convert internal Message type to OpenAI format
    const apiMessages = [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        signal: signal ?? undefined,
        body: JSON.stringify({
          model,
          messages: apiMessages,
          ...resolveModelParams(modelParams),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        const requestId =
          response.headers.get("x-request-id") ||
          response.headers.get("x-openrouter-request-id") ||
          response.headers.get("cf-ray");
        let errorMessage = `API Error (${response.status} ${response.statusText || "Unknown"})`;
        if (requestId) errorMessage += ` [request-id: ${requestId}]`;
        try {
          const errJson = JSON.parse(errText);
          const parts: string[] = [];
          if (errJson.error?.message) parts.push(errJson.error.message);
          if (errJson.error?.code) parts.push(`code=${errJson.error.code}`);
          if (errJson.error?.type) parts.push(`type=${errJson.error.type}`);
          if (errJson.message) parts.push(errJson.message);
          if (parts.length > 0) {
            errorMessage += `: ${parts.join(" | ")}`;
          }
          errorMessage += `: ${JSON.stringify(errJson).slice(0, 2000)}`;
        } catch {
          if (errText.trim()) {
            errorMessage += `: ${errText.slice(0, 2000)}`;
          }
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "";
    } catch (error: unknown) {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        throw new Error(`Connection failed to ${baseUrl}. Check CORS/Network.`);
      }
      throw error;
    }
  }

  async fetchModels(config: AIConfig): Promise<Model[]> {
    const proxyConfig = this.getProxyConfig(config);
    const baseUrl = proxyConfig.baseUrl.replace(/\/$/, "");
    const apiKey = proxyConfig.apiKey;

    if (!baseUrl) return [];

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
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
    let data = await tryEndpoint("/v1/models");
    if (!data) data = await tryEndpoint("/models");
    if (!data) data = await tryEndpoint("/api/models");

    if (!data) {
      return [];
    }

    const hasDataArray = (value: unknown): value is { data: unknown } =>
      typeof value === "object" && value !== null && "data" in value;

    let rawList: CliproxyModelEntry[] = [];
    if (hasDataArray(data) && Array.isArray(data.data))
      rawList = data.data as CliproxyModelEntry[];
    else if (Array.isArray(data)) rawList = data as CliproxyModelEntry[];

    // Apply filtering if necessary, Cliproxy might return a pre-filtered list or not support it.
    // For now, assuming raw list directly maps.
    return rawList.map((m) => {
      const id = typeof m === "string" ? m : m.id;
      const name = typeof m === "string" ? m : m.name || m.id;

      return {
        id,
        name,
        contextLength: typeof m === "string" ? 0 : m.context_length || 0,
        isFree: false, // Cliproxy typically proxies paid models or local ones
        vendor: deriveModelVendor(id, name),
      };
    });
  }

  async generateDiagram(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("generate", {
      diagramType: context.diagramType ?? "auto",
      docsContext: context.docsContext,
      language: context.language,
      allowedDiagramTypes: context.allowedDiagramTypes,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async fixDiagram(
    code: string,
    errorMessage: string,
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("fix", {
      docsContext: context.docsContext,
      language: context.language,
      thinkingStyle: context.thinkingStyle,
    });

    const fixMsg: Message = {
      id: "fix-req",
      role: "user",
      content: `Code:


${code}


Error: ${errorMessage}

Fix it.`,
      timestamp: Date.now(),
    };

    return this.fetchCompletion(
      [fixMsg],
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async chat(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("chat", {
      diagramType: context.diagramType ?? "auto",
      docsContext: context.docsContext,
      language: context.language,
      allowedDiagramTypes: context.allowedDiagramTypes,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async chatDiagram(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("chat_diagram", {
      diagramType: context.diagramType ?? "auto",
      docsContext: context.docsContext,
      language: context.language,
      allowedDiagramTypes: context.allowedDiagramTypes,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async chatNotebook(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("chat_notebook", {
      diagramType: context.diagramType ?? "auto",
      allowedDiagramTypes: context.allowedDiagramTypes ?? null,
      docsContext: context.docsContext,
      language: context.language,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async analyzeDiagram(
    code: string,
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("analyze", {
      docsContext: context.docsContext,
      language: context.language,
      thinkingStyle: context.thinkingStyle,
    });

    const analyzeMsg: Message = {
      id: "analyze-req",
      role: "user",
      content: `Analyze and explain the following Mermaid code:

\`\`\`mermaid
${code}
\`\`\`
`,
      timestamp: Date.now(),
    };

    return this.fetchCompletion(
      [analyzeMsg],
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async planNotebook(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("plan_notebook", {
      docsContext: context.docsContext,
      language: context.language,
      diagramType: context.diagramType ?? "auto",
      allowedDiagramTypes: context.allowedDiagramTypes ?? null,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }

  async summarizeBuild(
    messages: Message[],
    config: AIConfig,
    context: import("./types").LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt("summary", {
      docsContext: context.docsContext,
      language: context.language,
      diagramType: context.diagramType ?? "auto",
      allowedDiagramTypes: context.allowedDiagramTypes ?? null,
      thinkingStyle: context.thinkingStyle,
    });
    return this.fetchCompletion(
      messages,
      config,
      systemPrompt,
      modelParams,
      signal,
    );
  }
}
