import { getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';
import { isDiagramType, normalizeDiagramType } from '../../utils/diagramTypes';
const TYPE_MATCH_RE = /(?:^|—|-)\s*([a-zA-Z]+)\s*-\s*/;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const resolveDiagramTypeShortLabelFromText = (text: string) => {
  const match = text.match(TYPE_MATCH_RE);
  const raw = match?.[1]?.trim();
  const normalized = normalizeDiagramType(raw ?? '') ?? raw ?? '';
  if (!normalized) return null;
  if (!isDiagramType(normalized)) return null;
  return getDiagramTypeShortLabel(normalized);
};

export const stripDiagramTypeFromText = (text: string, diagramType?: string | null) => {
  const raw = diagramType ?? text.match(TYPE_MATCH_RE)?.[1]?.trim() ?? '';
  const normalized = normalizeDiagramType(raw) ?? raw;
  if (!normalized || !isDiagramType(normalized)) return text;

  const escaped = escapeRegExp(raw);
  const startPattern = new RegExp(`^\\s*${escaped}\\s*-\\s*`, 'i');
  if (startPattern.test(text)) {
    return text.replace(startPattern, '');
  }

  const emDashPattern = new RegExp(`—\\s*${escaped}\\s*-\\s*`, 'i');
  if (emDashPattern.test(text)) {
    return text.replace(emDashPattern, '— ');
  }

  const dashPattern = new RegExp(`-\\s*${escaped}\\s*-\\s*`, 'i');
  return text.replace(dashPattern, '- ');
};

export const stripInnerBlockLabelFromContextText = (text: string) => {
  if (!text.includes('Контекст') && !text.toLowerCase().includes('context')) return text;

  const withBoth = text.replace(/—\s*\d+\/\d+\s*-\s*[a-zA-Z]+\s*-\s*/g, '— ');
  return withBoth.replace(/—\s*\d+\/\d+\s*-\s*/g, '— ');
};
