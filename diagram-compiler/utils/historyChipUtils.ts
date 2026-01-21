import type { DiagramMarker } from '../hooks/core/useHistory';
import type { UiMode } from './uiModes';

export type HistoryChipModel = {
  marker: DiagramMarker;
  uiMode: UiMode;
  label: string;
  tooltip: string;
  isSelected: boolean;
};

export const HISTORY_CHIP_INACTIVE_CLASS_BY_MODE: Record<UiMode, string> = {
  chat:
    'text-indigo-600 dark:text-indigo-200 border-indigo-200/70 dark:border-indigo-700/70 hover:border-indigo-300 dark:hover:border-indigo-600',
  build:
    'text-emerald-600 dark:text-emerald-200 border-emerald-200/70 dark:border-emerald-700/70 hover:border-emerald-300 dark:hover:border-emerald-600',
  analyze:
    'text-sky-600 dark:text-sky-200 border-sky-200/70 dark:border-sky-700/70 hover:border-sky-300 dark:hover:border-sky-600',
  fix:
    'text-amber-600 dark:text-amber-200 border-amber-200/70 dark:border-amber-700/70 hover:border-amber-300 dark:hover:border-amber-600',
  plan:
    'text-violet-600 dark:text-violet-200 border-violet-200/70 dark:border-violet-700/70 hover:border-violet-300 dark:hover:border-violet-600',
  system: 'text-[var(--control-muted-text)] border-[var(--panel-border)]',
};

export const resolveHistoryChipUiMode = (type: DiagramMarker['type']): UiMode => {
  if (type === 'fix') return 'fix';
  if (type === 'analyze') return 'analyze';
  if (type === 'build' || type === 'recompile') return 'build';
  if (type === 'chat') return 'chat';
  return 'system';
};

export const resolveHistoryChipActionLabel = (type: DiagramMarker['type']): string => {
  if (type === 'build') return 'Build';
  if (type === 'fix') return 'Fix';
  if (type === 'recompile') return 'Run';
  if (type === 'manual_edit') return 'Edit';
  if (type === 'seed') return 'Seed';
  if (type === 'analyze') return 'Analyze';
  return type;
};

export const buildHistoryChipModels = (
  markers: DiagramMarker[],
  selectedStepId: string | null | undefined
): HistoryChipModel[] => {
  return markers.map((marker, index) => {
    const uiMode = resolveHistoryChipUiMode(marker.type);
    const isSelected = selectedStepId ? marker.stepId === selectedStepId : false;
    const timeLabel = new Date(marker.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const actionLabel = resolveHistoryChipActionLabel(marker.type);
    const label = `#${index + 1}`;
    const tooltip = `${label}/${markers.length} • ${timeLabel}\n${actionLabel}`;

    return {
      marker,
      uiMode,
      label,
      tooltip,
      isSelected,
    };
  });
};

