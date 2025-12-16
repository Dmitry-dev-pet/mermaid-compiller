import mermaid from 'mermaid';
import { MermaidState } from '../types';

export const initializeMermaid = (theme: 'default' | 'dark' = 'default') => {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: 'loose',
  });
};

export const validateMermaid = async (code: string): Promise<Partial<MermaidState>> => {
  if (!code.trim()) {
    return {
      isValid: true,
      status: 'empty',
      errorLine: undefined,
      errorMessage: undefined,
    };
  }

  try {
    // parse throws an error if invalid
    await mermaid.parse(code);
    return {
      isValid: true,
      status: 'valid',
      errorLine: undefined,
      errorMessage: undefined,
      lastValidCode: code,
    };
  } catch (error: unknown) {
    console.error("Mermaid Validation Error:", error);
    
    let line = 1;
    // Cast to any to access custom properties from Mermaid parser error if standard Error doesn't suffice
    const errAny = error as any;
    const msg = errAny.message || errAny.str || "Unknown syntax error";
    const lineMatch = msg.match(/line\s+(\d+)/i);
    if (lineMatch && lineMatch[1]) {
      line = parseInt(lineMatch[1], 10);
    }

    return {
      isValid: false,
      status: 'invalid',
      errorMessage: msg,
      errorLine: line,
    };
  }
};

/**
 * Extracts raw Mermaid code from a potential Markdown block returned by LLM.
 */
export const extractMermaidCode = (rawText: string): string => {
  const mermaidMatch = rawText.match(/```mermaid\n([\s\S]*?)```/);
  if (mermaidMatch && mermaidMatch[1]) return mermaidMatch[1].trim();

  const codeMatch = rawText.match(/```\n([\s\S]*?)```/);
  if (codeMatch && codeMatch[1]) return codeMatch[1].trim();

  const keywords = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'mindmap'];
  const firstWord = rawText.trim().split(/\s+/)[0];
  
  if (keywords.some(k => rawText.trim().startsWith(k)) || keywords.includes(firstWord)) {
    return rawText.trim();
  }

  return "";
};
