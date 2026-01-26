import type { AIConfig, Message, Model, ModelParams } from "../../types";
import type { LLMRequestContext } from "./types";

export interface LLMProviderStrategy {
  fetchModels(config: AIConfig): Promise<Model[]>;
  generateDiagram(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  fixDiagram(
    code: string,
    errorMessage: string,
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  chat(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  chatDiagram(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  chatNotebook(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  analyzeDiagram(
    code: string,
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  planNotebook(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
  summarizeBuild(
    messages: Message[],
    config: AIConfig,
    context: LLMRequestContext,
    modelParams?: ModelParams | null,
    signal?: AbortSignal | null,
  ): Promise<string>;
}
