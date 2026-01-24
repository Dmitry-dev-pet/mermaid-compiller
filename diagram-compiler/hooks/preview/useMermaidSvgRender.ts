import { useEffect, useState, type MutableRefObject } from "react";
import mermaid from "mermaid";
import {
  prepareMermaid,
  validatePreparedMermaid,
} from "../../services/mermaidService";

type UseMermaidSvgRenderArgs = {
  code: string;
  enabled: boolean;
  isMarkdownMermaidInvalid: boolean;
  isMarkdownMermaidMode: boolean;
  isMermaidValid: boolean;
  debounceMs?: number;
  enrichError: (code: string, message: string) => string;
  bindFunctionsRef: MutableRefObject<((element: Element) => void) | null>;
};

export const useMermaidSvgRender = ({
  code,
  enabled,
  isMarkdownMermaidInvalid,
  isMarkdownMermaidMode,
  isMermaidValid,
  debounceMs = 200,
  enrichError,
  bindFunctionsRef,
}: UseMermaidSvgRenderArgs) => {
  const [svgMarkup, setSvgMarkup] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      bindFunctionsRef.current = null;
      setSvgMarkup("");
      setRenderError(null);
      return;
    }

    const trimmed = code.trim();
    if (!trimmed) {
      bindFunctionsRef.current = null;
      setSvgMarkup("");
      setRenderError(null);
      return;
    }

    if (
      (!isMarkdownMermaidMode && !isMermaidValid) ||
      isMarkdownMermaidInvalid
    ) {
      return;
    }

    const renderDiagram = async () => {
      try {
        setRenderError(null);
        const id = `mermaid-${Date.now()}`;
        const prepared = prepareMermaid(code);
        const validation = await validatePreparedMermaid(prepared, {
          logError: false,
        });
        if (validation.isValid === false) {
          setRenderError(
            enrichError(code, validation.errorMessage ?? "Syntax Error"),
          );
          setSvgMarkup("");
          return;
        }
        const { svg, bindFunctions } = await mermaid.render(
          id,
          prepared.inlineCode,
        );
        bindFunctionsRef.current = bindFunctions ?? null;

        if (!svg || !svg.includes("<svg")) {
          throw new Error("Mermaid returned empty SVG");
        }

        setSvgMarkup(svg);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setRenderError(enrichError(code, message));
        setSvgMarkup("");
        console.error("Render failed", error);
      }
    };

    const timer = window.setTimeout(() => {
      void renderDiagram();
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [
    bindFunctionsRef,
    code,
    debounceMs,
    enabled,
    enrichError,
    isMarkdownMermaidInvalid,
    isMarkdownMermaidMode,
    isMermaidValid,
  ]);

  return { svgMarkup, renderError };
};
