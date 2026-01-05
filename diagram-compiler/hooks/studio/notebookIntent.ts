import type { TimeStep } from '../../services/history/types';

type NotebookMetaValue = string | null;

export const collectNotebookMetaByBlock = (
  steps: TimeStep[],
  resolveValue: (meta: Record<string, unknown>) => NotebookMetaValue
) => {
  const map = new Map<number, string>();
  steps.forEach((step) => {
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') return;
    const blockIndex = typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
    if (blockIndex === null) return;
    const value = resolveValue(meta);
    if (!value?.trim()) return;
    map.set(blockIndex, value.trim());
  });
  return map;
};

export const resolveNotebookRawIntent = (steps: TimeStep[], blockIndex: number) => {
  for (const step of steps) {
    const meta = step.meta as Record<string, unknown> | undefined;
    if (!meta || meta.mode !== 'notebook') continue;
    if (typeof meta.blockIndex !== 'number' || meta.blockIndex !== blockIndex) continue;
    if (typeof meta.notebookPlanIntent === 'string') return meta.notebookPlanIntent;
  }
  return '';
};
