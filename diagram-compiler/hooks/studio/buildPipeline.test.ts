import { beforeEach, describe, expect, it, vi } from "vitest";
import { runBuildPipeline } from "./buildPipeline";
import { generateDiagram, fixDiagram } from "../../services/llmService";
import {
  detectMermaidDiagramType,
  extractMermaidCode,
  parseMermaidJsonResponse,
  prepareMermaid,
  validatePreparedMermaid,
} from "../../services/mermaidService";
import { sanitizeMermaidByType } from "../../utils/mermaidSanitizer";
import { runLLMRequest } from "../../services/llmRequestRunner";

vi.mock("../../services/llmService", () => ({
  generateDiagram: vi.fn(),
  fixDiagram: vi.fn(),
}));

vi.mock("../../services/mermaidService", () => ({
  detectMermaidDiagramType: vi.fn(),
  extractMermaidCode: vi.fn(),
  parseMermaidJsonResponse: vi.fn(),
  prepareMermaid: vi.fn((code: string, diagramType?: string) => ({
    diagramType: diagramType ?? "auto",
    sanitizedCode: code,
    inlineCode: code,
  })),
  validatePreparedMermaid: vi.fn(),
}));

vi.mock("../../utils/mermaidSanitizer", () => ({
  sanitizeMermaidByType: vi.fn((_type: string, code: string) => code),
  formatMermaidErrorLine: vi.fn((message: string) => message),
}));

vi.mock("../../utils/mermaidAutoFixHints", () => ({
  augmentMermaidErrorForAutoFix: vi.fn(
    (_type: string, message: string) => message,
  ),
}));

vi.mock("../../services/llmRequestRunner", () => ({
  runLLMRequest: vi.fn(async (args: { run: () => Promise<string> }) =>
    args.run(),
  ),
}));

const baseOptions = {
  aiConfig: { selectedModelId: "test" } as any,
  diagramType: "flowchart" as const,
  llmMessages: [],
  docs: "docs",
  language: "en",
  maxAttempts: 1,
  autoFixMaxAttempts: 1,
};

describe("runBuildPipeline", () => {
  beforeEach(() => {
    vi.mocked(generateDiagram).mockReset();
    vi.mocked(fixDiagram).mockReset();
    vi.mocked(parseMermaidJsonResponse).mockReset();
    vi.mocked(detectMermaidDiagramType).mockReset();
    vi.mocked(extractMermaidCode).mockReset();
    vi.mocked(prepareMermaid).mockClear();
    vi.mocked(validatePreparedMermaid).mockReset();
    vi.mocked(sanitizeMermaidByType).mockClear();
    vi.mocked(runLLMRequest).mockClear();
  });

  it("returns parsed json mermaid code", async () => {
    vi.mocked(generateDiagram).mockResolvedValue("raw");
    vi.mocked(parseMermaidJsonResponse).mockReturnValue({
      status: "ok",
      diagramType: "flowchart",
      mermaid: "flowchart TD\nA-->B",
      reason: null,
    });
    vi.mocked(validatePreparedMermaid).mockResolvedValue({
      isValid: true,
      status: "valid",
    });

    const onAttempt = vi.fn();
    const result = await runBuildPipeline({
      ...baseOptions,
      callbacks: { onAttempt },
    });

    expect(result.status).toBe("ok");
    expect(result.code).toBe("flowchart TD\nA-->B");
    expect(result.usedFallback).toBe(false);
    expect(onAttempt).toHaveBeenCalledWith(1, 1);
    expect(runLLMRequest).toHaveBeenCalled();
  });

  it("uses fallback when json response mismatches type", async () => {
    vi.mocked(generateDiagram).mockResolvedValue("raw");
    vi.mocked(parseMermaidJsonResponse).mockReturnValue({
      status: "ok",
      diagramType: "sequence",
      mermaid: "sequenceDiagram\nA->>B: Hi",
      reason: null,
    });
    vi.mocked(validatePreparedMermaid).mockResolvedValue({
      isValid: true,
      status: "valid",
    });

    const onTypeMismatch = vi.fn();
    const result = await runBuildPipeline({
      ...baseOptions,
      callbacks: { onTypeMismatch },
    });

    expect(onTypeMismatch).toHaveBeenCalledWith(1, "flowchart", "sequence");
    expect(result.usedFallback).toBe(true);
    expect(result.code).toContain("flowchart TD");
  });

  it("auto-fixes invalid code and reports validation errors", async () => {
    vi.mocked(generateDiagram).mockResolvedValue("bad code");
    vi.mocked(parseMermaidJsonResponse).mockReturnValue(null);
    vi.mocked(extractMermaidCode).mockImplementation((raw) =>
      raw.includes("```mermaid") ? "flowchart TD\nA-->B" : raw,
    );
    vi.mocked(detectMermaidDiagramType).mockReturnValue("flowchart");
    vi.mocked(validatePreparedMermaid)
      .mockResolvedValueOnce({
        isValid: false,
        status: "invalid",
        errorMessage: "line 1",
      })
      .mockResolvedValueOnce({
        isValid: false,
        status: "invalid",
        errorMessage: "line 9",
      });
    vi.mocked(fixDiagram).mockResolvedValue(
      "```mermaid\nflowchart TD\nA-->B\n```",
    );

    const onAutoFixAttempt = vi.fn();
    const onValidationError = vi.fn();
    const result = await runBuildPipeline({
      ...baseOptions,
      callbacks: { onAutoFixAttempt, onValidationError },
    });

    expect(result.code).toBe("flowchart TD\nA-->B");
    expect(result.autoFixAttempts).toBe(1);
    expect(onAutoFixAttempt).toHaveBeenCalled();
    expect(onValidationError).toHaveBeenCalledWith("line 9");
  });
});
