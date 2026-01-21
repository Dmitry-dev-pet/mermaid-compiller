import React, { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { EditorTab } from '../types';
import { MermaidMarkdownBlock } from '../services/mermaidService';
import { getDiagramTypeLabel, getDiagramTypeShortLabel } from '../utils/diagramTypeMeta';
import { getMarkdownDiagramTabTooltip } from '../utils/markdownTabs';
import { useFloatingTooltip } from '../hooks/useFloatingTooltip';
import type { DiagramMarker } from '../hooks/core/useHistory';
import { HEADER_CONTROL_BUTTON } from '../utils/uiControlStyles';
import { MODE_BUTTON_DISABLED, MODE_UI, UiMode } from '../utils/uiModes';

interface NotebookTabsProps {
  activeTab: EditorTab;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<{ isValid?: boolean } | null | undefined>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveTabChange: (tab: EditorTab) => void;
  onAppendMarkdownMermaidBlock: () => void;
  diagramMarkers?: DiagramMarker[];
  selectedStepId?: string | null;
  onSelectDiagramStep?: (step: DiagramMarker) => void | Promise<void>;
}

const getTabClassName = (isInvalid: boolean, isActive: boolean) => {
  if (isInvalid) {
    return isActive
      ? 'bg-rose-600 text-white border-rose-600'
      : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700';
  }
  return isActive
    ? 'bg-teal-600 text-white border-teal-600'
    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800';
};

const NotebookTabs: React.FC<NotebookTabsProps> = ({
  activeTab,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveTabChange,
  onAppendMarkdownMermaidBlock,
  diagramMarkers = [],
  selectedStepId = null,
  onSelectDiagramStep,
}) => {
  const { showTooltip, hideTooltip, portal: tooltipPortal } = useFloatingTooltip();
  const isMarkdownMermaidTab = activeTab === 'markdown_mermaid';
  const isMarkdownOverviewTab = activeTab === 'code' || activeTab === 'build_docs';

  const historyMarkers = useMemo(() => {
    const contextId = `block:${markdownMermaidActiveIndex}`;
    return diagramMarkers.filter((marker) => {
      const meta = marker.meta as Record<string, unknown> | undefined;
      const blockIndex = meta && typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
      const metaContextId = meta && typeof meta.contextId === 'string' ? meta.contextId : null;
      return blockIndex === markdownMermaidActiveIndex || metaContextId === contextId;
    });
  }, [diagramMarkers, markdownMermaidActiveIndex]);

  const historyChips = useMemo(() => {
    const inactiveClassByMode: Record<UiMode, string> = {
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

    const resolveUiMode = (type: DiagramMarker['type']): UiMode => {
      if (type === 'fix') return 'fix';
      if (type === 'analyze') return 'analyze';
      if (type === 'build' || type === 'recompile') return 'build';
      if (type === 'chat') return 'chat';
      return 'system';
    };

    return historyMarkers.map((marker, index) => {
      const isSelected = selectedStepId ? marker.stepId === selectedStepId : false;
      const uiMode = resolveUiMode(marker.type);
      const modeStyles = MODE_UI[uiMode];
      const activeClass = modeStyles.button ?? MODE_BUTTON_DISABLED;
      const inactiveClass = inactiveClassByMode[uiMode] ?? MODE_BUTTON_DISABLED;
      const timeLabel = new Date(marker.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const actionLabel =
        marker.type === 'build'
          ? 'Build'
          : marker.type === 'fix'
            ? 'Fix'
            : marker.type === 'recompile'
              ? 'Run'
              : marker.type === 'manual_edit'
                ? 'Edit'
                : marker.type === 'seed'
                  ? 'Seed'
                  : marker.type === 'analyze'
                    ? 'Analyze'
                    : marker.type;
      const tooltip = `#${index + 1}/${historyMarkers.length} • ${timeLabel}\n${actionLabel}`;
      return {
        marker,
        tooltip,
        label: `#${index + 1}`,
        className: `rounded-full ${HEADER_CONTROL_BUTTON} ${isSelected ? activeClass : inactiveClass}`,
      };
    });
  }, [historyMarkers, selectedStepId]);

  const handleHistoryChipClick = useCallback(
    (marker: DiagramMarker) => {
      void Promise.resolve(onSelectDiagramStep?.(marker)).catch(() => {});
    },
    [onSelectDiagramStep]
  );

  return (
    <>
      <div
        className="flex items-center gap-2 min-h-8 border-b px-2 py-1 bg-transparent"
        style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-alt-bg, #ffffff)' }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onActiveTabChange('code')}
            onMouseEnter={(e) => showTooltip(e, 'Notebook')}
            onMouseMove={(e) => showTooltip(e, 'Notebook')}
            onMouseLeave={hideTooltip}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              isMarkdownOverviewTab
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 opacity-60'
            }`}
            title="Notebook"
          >
            Notebook
          </button>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
        </div>

        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          {markdownMermaidBlocks.map((block, index) => {
            const isActive = isMarkdownMermaidTab && index === markdownMermaidActiveIndex;
            const diagnostics = markdownMermaidDiagnostics[index];
            const isInvalid = diagnostics?.isValid === false;
            const diagramLabel = getDiagramTypeLabel(block.diagramType);
            const diagramShortLabel = getDiagramTypeShortLabel(block.diagramType);
            const tooltipText = getMarkdownDiagramTabTooltip({
              diagramLabel,
              index,
              isInvalid,
            });
            const tabClass = getTabClassName(isInvalid, isActive);
            return (
              <button
                key={`md-mermaid-tab-${block.index}`}
                type="button"
                onClick={() => {
                  onMarkdownMermaidActiveIndexChange(index);
                  onActiveTabChange('markdown_mermaid');
                }}
                onMouseEnter={(e) => showTooltip(e, tooltipText)}
                onMouseMove={(e) => showTooltip(e, tooltipText)}
                onMouseLeave={hideTooltip}
                className={`px-2 py-0.5 text-[10px] rounded border shrink-0 ${tabClass}`}
                title={tooltipText}
              >
                {diagramShortLabel}
              </button>
            );
          })}

          {onSelectDiagramStep && historyChips.length > 0 && (
            <>
              <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
              {historyChips.map((chip) => (
                <button
                  key={chip.marker.stepId}
                  type="button"
                  onClick={() => handleHistoryChipClick(chip.marker)}
                  onMouseEnter={(e) => showTooltip(e, chip.tooltip)}
                  onMouseMove={(e) => showTooltip(e, chip.tooltip)}
                  onMouseLeave={hideTooltip}
                  className={`shrink-0 whitespace-nowrap ${chip.className}`}
                  title={chip.tooltip}
                >
                  {chip.label}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onAppendMarkdownMermaidBlock}
            className="px-2 py-0.5 text-[10px] rounded border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
            title="Add empty mermaid block"
          >
            <Plus size={12} /> Block
          </button>
        </div>
      </div>
      {tooltipPortal}
    </>
  );
};

export default NotebookTabs;
