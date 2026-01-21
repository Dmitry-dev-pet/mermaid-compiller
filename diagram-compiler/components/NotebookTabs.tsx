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
import { buildHistoryChipModels, HISTORY_CHIP_INACTIVE_CLASS_BY_MODE } from '../utils/historyChipUtils';

interface NotebookTabsProps {
  activeTab: EditorTab;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<{ isValid?: boolean } | null | undefined>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveTabChange: (tab: EditorTab) => void;
  onAppendMarkdownMermaidBlock: () => void;
  onBuildDocsScopeChange?: (scope: 'notebook' | 'diagram') => void;
  buildDocsScope?: 'notebook' | 'diagram';
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
  onBuildDocsScopeChange,
  buildDocsScope,
  diagramMarkers = [],
  selectedStepId = null,
  onSelectDiagramStep,
}) => {
  const { showTooltip, hideTooltip, portal: tooltipPortal } = useFloatingTooltip();
  const resolvedScope = activeTab === 'build_docs' ? (buildDocsScope ?? 'notebook') : null;
  const isNotebookSelected = activeTab === 'code' || resolvedScope === 'notebook';
  const isDiagramSelected = activeTab === 'markdown_mermaid' || resolvedScope === 'diagram';

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
    const chipModels = buildHistoryChipModels(historyMarkers, selectedStepId);
    return chipModels.map((chip) => {
      const modeStyles = MODE_UI[chip.uiMode as UiMode];
      const activeClass = modeStyles.button ?? MODE_BUTTON_DISABLED;
      const inactiveClass = HISTORY_CHIP_INACTIVE_CLASS_BY_MODE[chip.uiMode as UiMode] ?? MODE_BUTTON_DISABLED;
      return {
        marker: chip.marker,
        tooltip: chip.tooltip,
        label: chip.label,
        className: `rounded-full ${HEADER_CONTROL_BUTTON} ${chip.isSelected ? activeClass : inactiveClass}`,
      };
    });
  }, [historyMarkers, selectedStepId]);

  const handleHistoryChipClick = useCallback(
    (marker: DiagramMarker) => {
      if (activeTab === 'build_docs') {
        onBuildDocsScopeChange?.('diagram');
      }
      void Promise.resolve(onSelectDiagramStep?.(marker)).catch(() => {});
    },
    [activeTab, onBuildDocsScopeChange, onSelectDiagramStep]
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
            onClick={() => {
              onBuildDocsScopeChange?.('notebook');
              if (activeTab !== 'build_docs') onActiveTabChange('code');
            }}
            onMouseEnter={(e) => showTooltip(e, 'Notebook')}
            onMouseMove={(e) => showTooltip(e, 'Notebook')}
            onMouseLeave={hideTooltip}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              isNotebookSelected
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
            const isActive = isDiagramSelected && index === markdownMermaidActiveIndex;
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
                  onBuildDocsScopeChange?.('diagram');
                  onMarkdownMermaidActiveIndexChange(index);
                  if (activeTab !== 'build_docs') {
                    onActiveTabChange('markdown_mermaid');
                  }
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

          <button
            type="button"
            onClick={onAppendMarkdownMermaidBlock}
            className="px-2 py-0.5 text-[10px] rounded border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 shrink-0"
            title="Add empty mermaid block"
          >
            <Plus size={12} /> Block
          </button>

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
                  className={`whitespace-nowrap ${chip.className}`}
                  title={chip.tooltip}
                >
                  {chip.label}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      {tooltipPortal}
    </>
  );
};

export default NotebookTabs;
