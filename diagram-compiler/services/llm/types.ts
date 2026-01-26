import type { DiagramType, ThinkingStyle } from "../../types";

export type LLMRequestContext = {
  diagramType?: DiagramType;
  allowedDiagramTypes?: DiagramType[] | null;
  docsContext: string;
  language: string;
  thinkingStyle?: ThinkingStyle;
};
