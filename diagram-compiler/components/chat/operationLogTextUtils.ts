import { getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';
import { DIAGRAM_TYPES, normalizeDiagramType } from '../../utils/diagramTypes';

const DIAGRAM_TYPE_SET = new Set<string>([...DIAGRAM_TYPES, 'auto']);

export const resolveDiagramTypeShortLabelFromText = (text: string) => {
  const match = text.match(/(?:—|-)\s*([a-zA-Z]+)\s*-\s*/);
  const raw = match?.[1]?.trim();
  const normalized = normalizeDiagramType(raw ?? '') ?? raw ?? '';
  if (!normalized) return null;
  if (!DIAGRAM_TYPE_SET.has(normalized)) return null;
  return getDiagramTypeShortLabel(normalized as never);
};

export const stripDiagramTypeFromText = (text: string) => {
  const match = text.match(/(?:—|-)\s*([a-zA-Z]+)\s*-\s*/);
  const raw = match?.[1]?.trim();
  const normalized = normalizeDiagramType(raw ?? '') ?? raw ?? '';
  if (!normalized || !DIAGRAM_TYPE_SET.has(normalized)) return text;

  const emDashPattern = new RegExp(`—\\s*${raw}\\s*-\\s*`, 'i');
  if (emDashPattern.test(text)) {
    return text.replace(emDashPattern, '— ');
  }

  const dashPattern = new RegExp(`-\\s*${raw}\\s*-\\s*`, 'i');
  return text.replace(dashPattern, '- ');
};

export const stripInnerBlockLabelFromContextText = (text: string) => {
  if (!text.includes('Контекст') && !text.toLowerCase().includes('context')) return text;

  const withBoth = text.replace(/—\s*\d+\/\d+\s*-\s*[a-zA-Z]+\s*-\s*/g, '— ');
  return withBoth.replace(/—\s*\d+\/\d+\s*-\s*/g, '— ');
};

