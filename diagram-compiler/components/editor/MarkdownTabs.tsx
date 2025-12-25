import React from 'react';
import { Plus } from 'lucide-react';
import { EditorTab } from '../../types';
import { MermaidMarkdownBlock } from '../../services/mermaidService';
import { getDiagramTypeLabel, getDiagramTypeShortLabel } from '../../utils/diagramTypeMeta';

interface MarkdownTabsProps {
  activeTab: EditorTab;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<{ isValid?: boolean } | null | undefined>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveTabChange: (tab: EditorTab) => void;
  onAppendMarkdownMermaidBlock: () => void;
  onShowTooltip: (event: React.MouseEvent<HTMLElement>, text: string) => void;
  onHideTooltip: () => void;
}

const MarkdownTabs: React.FC<MarkdownTabsProps> = ({
  activeTab,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveTabChange,
  onAppendMarkdownMermaidBlock,
  onShowTooltip,
  onHideTooltip,
}) => {
  const isMarkdownMermaidTab = activeTab === 'markdown_mermaid';

  const validCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === true).length;
  const invalidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === false).length;

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 px-2 py-1 bg-white dark:bg-slate-900">
      <button
        type="button"
        onClick={() => onActiveTabChange('code')}
        onMouseEnter={(e) => onShowTooltip(e, 'Markdown (notebook)')}
        onMouseMove={(e) => onShowTooltip(e, 'Markdown (notebook)')}
        onMouseLeave={onHideTooltip}
        className={`px-2 py-0.5 text-[10px] rounded border ${
          activeTab === 'code'
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
        title="Markdown (notebook)"
      >
        MD
      </button>
      {activeTab === 'code' && (validCount > 0 || invalidCount > 0) && (
        <span className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-emerald-700" />
            <span>{validCount}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 ring-1 ring-rose-700" />
            <span>{invalidCount}</span>
          </span>
        </span>
      )}
      <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
      {markdownMermaidBlocks.map((block, index) => {
        const isActive = isMarkdownMermaidTab && index === markdownMermaidActiveIndex;
        const diagnostics = markdownMermaidDiagnostics[index];
        const isInvalid = diagnostics?.isValid === false;
        const diagramLabel = getDiagramTypeLabel(block.diagramType);
        const diagramShortLabel = getDiagramTypeShortLabel(block.diagramType);
        const tooltipText = `${diagramLabel} #${index + 1}${isInvalid ? ' (invalid)' : ''}`;
        return (
          <button
            key={`md-mermaid-tab-${block.index}`}
            type="button"
            onClick={() => {
              onMarkdownMermaidActiveIndexChange(index);
              onActiveTabChange('markdown_mermaid');
            }}
            onMouseEnter={(e) => onShowTooltip(e, tooltipText)}
            onMouseMove={(e) => onShowTooltip(e, tooltipText)}
            onMouseLeave={onHideTooltip}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              isInvalid
                ? isActive
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700'
                : isActive
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title={tooltipText}
          >
            {diagramShortLabel}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAppendMarkdownMermaidBlock}
        className="ml-auto px-2 py-0.5 text-[10px] rounded border bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
        title="Add empty mermaid block"
      >
        <Plus size={12} /> Block
      </button>
    </div>
  );
};

export default MarkdownTabs;
