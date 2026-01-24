import { normalizeDiagramType } from '../../utils/diagramTypes';

export const extractMermaidCode = (rawText: string): string => {
  const mermaidMatch = rawText.match(/```mermaid\n([\s\S]*?)```/);
  if (mermaidMatch && mermaidMatch[1]) return mermaidMatch[1].trim();

  const codeMatch = rawText.match(/```\n([\s\S]*?)```/);
  if (codeMatch && codeMatch[1]) return codeMatch[1].trim();

  const keywords = [
    'graph',
    'flowchart',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'erDiagram',
    'gantt',
    'pie',
    'mindmap',
    'C4Context',
    'C4Container',
    'C4Component',
    'C4Dynamic',
    'C4Deployment',
  ];
  const firstWord = rawText.trim().split(/\s+/)[0];

  if (keywords.some((keyword) => rawText.trim().startsWith(keyword)) || keywords.includes(firstWord)) {
    return rawText.trim();
  }

  return '';
};

type MermaidJsonResponse = {
  status: 'ok' | 'empty' | 'error';
  diagramType: string | null;
  mermaid: string | null;
  reason: string | null;
};

const tryParseJsonObject = (rawText: string): Record<string, unknown> | null => {
  if (!rawText.trim()) return null;
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? rawText).trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(jsonSlice);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
};

export const parseMermaidJsonResponse = (rawText: string): MermaidJsonResponse | null => {
  const parsed = tryParseJsonObject(rawText);
  if (!parsed) return null;
  const status = typeof parsed.status === 'string' ? parsed.status.trim().toLowerCase() : '';
  if (!['ok', 'empty', 'error'].includes(status)) return null;
  const diagramTypeRaw =
    typeof parsed.diagram_type === 'string'
      ? parsed.diagram_type
      : typeof parsed.diagramType === 'string'
        ? parsed.diagramType
        : null;
  const mermaidRaw = typeof parsed.mermaid === 'string' ? parsed.mermaid : null;
  const reasonRaw = typeof parsed.reason === 'string' ? parsed.reason : null;
  return {
    status: status as MermaidJsonResponse['status'],
    diagramType: normalizeDiagramType(diagramTypeRaw),
    mermaid: mermaidRaw?.trim() || null,
    reason: reasonRaw?.trim() || null,
  };
};
