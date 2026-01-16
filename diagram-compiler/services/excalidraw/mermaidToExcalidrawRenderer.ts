import mermaid from 'mermaid';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

import {
  parseMermaidToExcalidrawSkeletons,
  parseMermaidToExcalidrawSkeletonsLenient,
  type MermaidDiagramTypeHint,
} from './mermaidToExcalidrawService';

let mermaidInitializePatched = false;
const ensureMermaidToExcalidrawReady = () => {
  if (mermaidInitializePatched) return;
  mermaidInitializePatched = true;
  const original = mermaid.initialize.bind(mermaid);
  mermaid.initialize = ((config: unknown) => {
    try {
      return original(config as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already registered')) return;
      throw error;
    }
  }) as typeof mermaid.initialize;
};

export const renderMermaidToExcalidrawElements = async (args: {
  mermaidCode: string;
  diagramTypeHint: MermaidDiagramTypeHint;
  themeVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<{ elements: OrderedExcalidrawElement[]; files: BinaryFiles }> => {
  ensureMermaidToExcalidrawReady();
  const { skeletons, files } = await parseMermaidToExcalidrawSkeletons({
    mermaidCode: args.mermaidCode,
    diagramTypeHint: args.diagramTypeHint,
    themeVariables: args.themeVariables,
    timeoutMs: args.timeoutMs,
  });
  const elements = convertToExcalidrawElements(
    skeletons as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false }
  ).map((el) => ({ ...el, locked: false }));

  return { elements, files };
};

export const renderMermaidToExcalidrawElementsLenient = async (args: {
  mermaidCode: string;
  themeVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<{ elements: OrderedExcalidrawElement[]; files: BinaryFiles }> => {
  ensureMermaidToExcalidrawReady();
  const { skeletons, files } = await parseMermaidToExcalidrawSkeletonsLenient({
    mermaidCode: args.mermaidCode,
    themeVariables: args.themeVariables,
    timeoutMs: args.timeoutMs,
  });
  const elements = convertToExcalidrawElements(
    skeletons as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false }
  ).map((el) => ({ ...el, locked: false }));

  return { elements, files };
};

export const __test = {
  ensureMermaidToExcalidrawReady,
};
