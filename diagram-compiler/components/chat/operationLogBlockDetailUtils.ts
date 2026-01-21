import type { OperationEvent } from '../../types';
import { getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';
import { normalizeDiagramType } from '../../utils/diagramTypes';

export const parseBlockDetail = (detail: string) => {
  const match = detail.match(/^(\d+\/\d+)\s*-\s*(.+)$/);
  if (!match) return null;
  return {
    label: match[1],
    rest: match[2],
  };
};

export const resolveNotebookTypes = (events: OperationEvent[]) => {
  const blockTypes = new Map<number, string>();
  for (const event of events) {
    if (typeof event.blockIndex !== 'number') continue;
    if (!event.detail) continue;
    if (event.title !== 'Block' && event.title !== 'Block attempt' && event.title !== 'Block validation') {
      continue;
    }
    if (blockTypes.has(event.blockIndex)) continue;
    const parsed = parseBlockDetail(event.detail);
    if (!parsed) continue;
    const [rawType] = parsed.rest.split(' - ');
    const normalized = normalizeDiagramType(rawType?.trim() ?? '') ?? rawType?.trim() ?? '';
    if (!normalized) continue;
    blockTypes.set(event.blockIndex, normalized);
  }
  const counts = new Map<string, number>();
  for (const type of blockTypes.values()) {
    const label = getDiagramTypeShortLabel(type as never);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([label, count]) => (count > 1 ? `${label}×${count}` : label));
};

