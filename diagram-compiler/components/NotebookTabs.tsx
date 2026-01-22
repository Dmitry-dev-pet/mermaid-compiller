import React, { useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { EditorTab } from '../types';
import { MermaidMarkdownBlock } from '../services/mermaidService';
import { getDiagramTypeLabel, getDiagramTypeShortLabel } from '../utils/diagramTypeMeta';
import { getMarkdownDiagramTabTooltip } from '../utils/markdownTabs';
import { useFloatingTooltip } from '../hooks/useFloatingTooltip';
import type { DiagramMarker } from '../hooks/core/useHistory';
import { HEADER_CONTROL_BUTTON } from '../utils/uiControlStyles';
import { Button } from './ui/Button';
import { Tab, TabList } from './ui/Tabs';
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
      <div className="flex items-center gap-2 min-h-8 px-2 py-1 bg-transparent">
        <div className="flex items-center gap-2 shrink-0">
          <Tab
            isActive={isNotebookSelected}
            onClick={() => {
              onBuildDocsScopeChange?.('notebook');
              if (activeTab !== 'build_docs') onActiveTabChange('code');
            }}
            onMouseEnter={(e) => showTooltip(e, 'Notebook')}
            onMouseMove={(e) => showTooltip(e, 'Notebook')}
            onMouseLeave={hideTooltip}
            className={!isNotebookSelected ? 'opacity-60' : ''}
            title="Notebook"
          >
            Notebook
          </Tab>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
        </div>

        <TabList className="min-w-0 flex-1 overflow-x-auto">
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
              <Tab
                key={`md-mermaid-tab-${block.index}`}
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
                isActive={isActive}
                className={`shrink-0 ${tabClass}`}
                title={tooltipText}
              >
                {diagramShortLabel}
              </Tab>
            );
          })}

          <Tab
            onClick={onAppendMarkdownMermaidBlock}
            isActive={false}
            className="shrink-0"
            title="Add empty mermaid block"
          >
            <Plus size={12} /> Block
          </Tab>

          {onSelectDiagramStep && historyChips.length > 0 && (
            <>
              <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
              {historyChips.map((chip) => (
                <Button
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
                </Button>
              ))}
            </>
          )}
        </TabList>
      </div>
      {tooltipPortal}
    </>
  );
};

export default NotebookTabs;
