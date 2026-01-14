import type { DiagramType } from '../../types';
import { getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';

export const buildSelectionLine = (args: {
  diagramType: DiagramType | null | undefined;
  allowedDiagramTypes?: DiagramType[] | null;
}): string => {
  const diagramType = args.diagramType ?? null;
  if (diagramType && diagramType !== 'auto') {
    return `selection: ${getDiagramTypeShortLabel(diagramType)}`;
  }
  const allowed = (args.allowedDiagramTypes ?? []).filter((t): t is DiagramType => Boolean(t) && t !== 'auto');
  if (allowed.length) {
    return `selection: ${allowed.map((t) => getDiagramTypeShortLabel(t)).join('/')}`;
  }
  return '';
};

