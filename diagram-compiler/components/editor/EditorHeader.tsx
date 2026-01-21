import React from 'react';
import { Bookmark, Check, Copy, FileCode2, Loader2, PenTool, RefreshCw } from 'lucide-react';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';
import { EditorTab, MermaidState } from '../../types';
import type { DiagramMarker } from '../../hooks/core/useHistory';
import { HEADER_CONTROL_ICON_BUTTON, HEADER_CONTROL_SELECT } from '../../utils/uiControlStyles';
import { MODE_BUTTON_DISABLED, MODE_UI } from '../../utils/uiModes';

interface EditorHeaderProps {
  mermaidState: MermaidState;
  isMarkdown: boolean;
  isProcessing: boolean;
  activeOperationKind?: 'chat' | 'build' | 'analyze' | 'fix' | 'compile' | null;
  isAIReady: boolean;
  isReadOnly: boolean;
  canAnalyze: boolean;
  analyzeLanguage: string;
  onAnalyzeLanguageChange: (lang: string) => void;
  onAnalyze: () => void;
  onFixSyntax: () => void;
  canFix: boolean;
  onSnapshot: () => void;
  canSnapshot: boolean;
  onCopy: () => void;
  copied: boolean;
  activeTab: EditorTab;
  onActiveTabChange: (tab: EditorTab) => void;
  isMarkdownMermaidTab: boolean;
  isBuildDocsTab: boolean;
  diagramMarkers?: DiagramMarker[];
  selectedStepId?: string | null;
  onSelectDiagramStep?: (step: DiagramMarker) => void | Promise<void>;
}

  const EditorHeader: React.FC<EditorHeaderProps> = ({
  mermaidState,
  isMarkdown,
  isProcessing,
  activeOperationKind = null,
  isAIReady,
  isReadOnly,
  canAnalyze,
  analyzeLanguage,
  onAnalyzeLanguageChange,
  onAnalyze,
  onFixSyntax,
  canFix,
  onSnapshot,
  canSnapshot,
  onCopy,
  copied,
  activeTab,
  onActiveTabChange,
  isMarkdownMermaidTab,
  isBuildDocsTab,
  diagramMarkers = [],
  selectedStepId = null,
  onSelectDiagramStep,
}) => {
  const actionButtonBase =
    'h-7 px-2 text-[10px] font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1 shrink-0 whitespace-nowrap normal-case tracking-normal';
  const isAnalyzing = isProcessing && activeOperationKind === 'analyze';
  const isFixing = isProcessing && activeOperationKind === 'fix';

  const editorTitle = isBuildDocsTab ? 'Prompts' : 'Editor';
  const historyChips = React.useMemo(() => {
    if (!onSelectDiagramStep) return [];
    if (isBuildDocsTab) return [];
    if (!diagramMarkers.length) return [];

    const inactiveClassByMode: Record<'chat' | 'build' | 'analyze' | 'fix' | 'plan' | 'system', string> = {
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

    const resolveUiMode = (type: DiagramMarker['type']): keyof typeof inactiveClassByMode => {
      if (type === 'fix') return 'fix';
      if (type === 'analyze') return 'analyze';
      if (type === 'build' || type === 'recompile') return 'build';
      if (type === 'chat') return 'chat';
      return 'system';
    };

    return diagramMarkers.map((marker, index) => {
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
      const tooltip = `#${index + 1}/${diagramMarkers.length} • ${timeLabel}\n${actionLabel}`;
      return {
        marker,
        tooltip,
        label: `#${index + 1}`,
        className: `shrink-0 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium ${
          isSelected ? activeClass : inactiveClass
        }`,
      };
    });
  }, [diagramMarkers, isBuildDocsTab, onSelectDiagramStep, selectedStepId]);

  return (
    <div
      className="h-24 px-4 py-2 border-b bg-transparent text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex flex-col gap-2"
      style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-alt-bg, #ffffff)' }}
    >
      <div className="flex items-center justify-between gap-3 min-w-0 normal-case tracking-normal">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0 truncate font-semibold text-[var(--control-text)] inline-flex items-center gap-2">
            <FileCode2 size={14} className="text-slate-400 dark:text-slate-500" />
            {editorTitle}
          </div>

          <div className="flex items-center gap-2 min-w-0 text-xs font-mono">
            {!isMarkdown && mermaidState.status === 'invalid' && (
              <span
                className="inline-flex h-3 w-3 rounded-full bg-red-500 ring-1 ring-red-700"
                title={`Invalid diagram${mermaidState.errorLine ? ` (Line ${mermaidState.errorLine})` : ''}`}
              />
            )}
            {mermaidState.status === 'empty' && <span className="text-slate-400">Empty</span>}
            {!isMarkdown && mermaidState.status === 'edited' && (
              <span className="text-amber-600 dark:text-amber-400">⚠ Edited</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 font-sans shrink-0">
          <button
            onClick={onAnalyze}
            disabled={!canAnalyze}
            className={`${actionButtonBase} ${canAnalyze ? MODE_UI.analyze.button : MODE_BUTTON_DISABLED}`}
            title="Explain this diagram in chat"
          >
            {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <PenTool size={10} />} Analyze
          </button>

          <select
            value={analyzeLanguage}
            onChange={(e) => onAnalyzeLanguageChange(e.target.value)}
            className={HEADER_CONTROL_SELECT}
            title="Analyze language"
            disabled={isProcessing || isReadOnly}
          >
            <option value="auto">Auto</option>
            <option value="English">EN</option>
            <option value="Russian">RU</option>
          </select>

          <button
            onClick={onFixSyntax}
            disabled={!isAIReady || isProcessing || !canFix}
            className={`${actionButtonBase} ${canFix ? MODE_UI.fix.button : MODE_BUTTON_DISABLED}`}
            title={`Attempt to fix syntax errors (up to ${AUTO_FIX_MAX_ATTEMPTS} tries)`}
          >
            <RefreshCw size={10} className={isFixing ? 'animate-spin' : ''} /> Fix ({AUTO_FIX_MAX_ATTEMPTS})
          </button>

          <button
            onClick={onSnapshot}
            disabled={!canSnapshot}
            className={`${actionButtonBase} ${
              canSnapshot
                ? 'text-white bg-slate-700 hover:bg-slate-800 border border-slate-700'
                : 'text-slate-400 bg-slate-200 dark:bg-slate-800 dark:text-slate-500 border border-slate-300/60 dark:border-slate-500/60'
            }`}
            title="Save current diagram state to history"
          >
            <Bookmark size={10} /> Snapshot
          </button>

          <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            onClick={onCopy}
            className={HEADER_CONTROL_ICON_BUTTON}
            title={
              isMarkdownMermaidTab
                ? 'Copy mermaid block'
                : isBuildDocsTab
                ? 'Copy docs'
                : 'Copy code'
            }
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 normal-case tracking-normal">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => onActiveTabChange('code')}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              activeTab === 'code' || activeTab === 'markdown_mermaid'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Code
          </button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
          <button
            type="button"
            onClick={() => onActiveTabChange('build_docs')}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              activeTab === 'build_docs'
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Prompt context"
          >
            Prompts
          </button>

          {!!historyChips.length && (
            <>
              <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />
              <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
                {historyChips.map((chip) => (
                  <button
                    key={chip.marker.stepId}
                    type="button"
                    onClick={() => void Promise.resolve(onSelectDiagramStep?.(chip.marker)).catch(() => {})}
                    className={chip.className}
                    title={chip.tooltip}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="text-[10px] text-[var(--control-muted-text)]">
          <span>
            Source:{' '}
            {mermaidState.source === 'user'
              ? 'User'
              : mermaidState.source === 'compiled'
              ? 'Compiled'
              : 'User (Override)'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default EditorHeader;
