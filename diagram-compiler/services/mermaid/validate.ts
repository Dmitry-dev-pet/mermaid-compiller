import mermaid from "mermaid";
import type { DiagramType, MermaidState } from "../../types";
import { applyInlineDirectionCommand } from "../../utils/inlineDirectionCommand";
import { applyInlineThemeAndLookCommands } from "../../utils/inlineLookCommand";
import type { MermaidThemeName } from "../../utils/inlineThemeCommand";
import { detectMermaidDiagramType, isMarkdownLike } from "./markdown";
import { sanitizeMermaidByType } from "../../utils/mermaidSanitizer";

type MermaidParseErrorLike = {
  message?: string;
  str?: string;
};

const parseMermaidError = (error: unknown) => {
  const err = error as MermaidParseErrorLike;
  const message = err.message || err.str || "Unknown syntax error";
  const lineMatch = message.match(/line\s+(\d+)/i);
  const line = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : 1;
  return { message, line };
};

export const applyInlineMermaidDirectives = (code: string): string => {
  const withDirection = applyInlineDirectionCommand(code).code;
  return applyInlineThemeAndLookCommands(withDirection).code;
};

export const initializeMermaid = (
  theme:
    | MermaidThemeName
    | {
        theme: MermaidThemeName;
        themeVariables?: Record<string, unknown>;
      } = "default",
) => {
  const config = typeof theme === "string" ? { theme } : theme;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      ...config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Mermaid v11 can throw if a diagram type was already registered. This can
    // happen when we re-initialize on theme/look changes; treat as harmless.
    if (message.includes("already registered")) return;
    throw error;
  }
};

export type PreparedMermaid = {
  diagramType: DiagramType;
  sanitizedCode: string;
  inlineCode: string;
};

export const prepareMermaid = (
  code: string,
  diagramType?: DiagramType,
): PreparedMermaid => {
  const detectedType = diagramType ?? detectMermaidDiagramType(code) ?? "auto";
  const sanitizedCode = sanitizeMermaidByType(detectedType, code);
  const inlineCode = applyInlineMermaidDirectives(sanitizedCode);
  return { diagramType: detectedType, sanitizedCode, inlineCode };
};

export const validatePreparedMermaid = async (
  prepared: PreparedMermaid,
  options: { logError?: boolean } = {},
): Promise<
  Pick<MermaidState, "isValid" | "status" | "errorLine" | "errorMessage">
> => {
  try {
    await mermaid.parse(prepared.inlineCode);
    return {
      isValid: true,
      status: "valid",
      errorLine: undefined,
      errorMessage: undefined,
    };
  } catch (error: unknown) {
    if (options.logError !== false) {
      console.error("Mermaid Validation Error:", error);
    }

    const { message, line } = parseMermaidError(error);
    return {
      isValid: false,
      status: "invalid",
      errorMessage: message,
      errorLine: line,
    };
  }
};

export const validateMermaid = async (
  code: string,
  options: { logError?: boolean } = {},
): Promise<Partial<MermaidState>> => {
  if (!code.trim()) {
    return {
      isValid: true,
      status: "empty",
      errorLine: undefined,
      errorMessage: undefined,
    };
  }

  if (isMarkdownLike(code)) {
    return {
      isValid: true,
      status: "valid",
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  }

  try {
    const prepared = prepareMermaid(code);
    const validation = await validatePreparedMermaid(prepared, options);
    if (!validation.isValid) {
      return {
        ...validation,
        status: "invalid",
      };
    }
    return {
      isValid: true,
      status: "valid",
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  } catch (error: unknown) {
    if (options.logError !== false) {
      console.error("Mermaid Validation Error:", error);
    }

    const { message, line } = parseMermaidError(error);
    return {
      isValid: false,
      status: "invalid",
      errorMessage: message,
      errorLine: line,
    };
  }
};

export const validateMermaidDiagramCode = async (
  code: string,
  options: { logError?: boolean } = {},
): Promise<
  Pick<MermaidState, "isValid" | "status" | "errorLine" | "errorMessage">
> => {
  if (!code.trim()) {
    return {
      isValid: true,
      status: "empty",
      errorLine: undefined,
      errorMessage: undefined,
    };
  }

  return validatePreparedMermaid(prepareMermaid(code), options);
};
