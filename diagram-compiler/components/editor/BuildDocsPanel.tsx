import React, { useEffect, useRef, useState } from 'react';
import { highlight, languages } from 'prismjs';
import type { DocsEntry } from '../../services/docsContextService';
import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import { MODE_UI } from '../../utils/uiModes';
import { isSystemPromptPath } from '../../utils/systemPrompts';
import { useBuildDocsContent } from '../../hooks/editor/useBuildDocsContent';

interface BuildDocsPanelProps {
  docsPanel: 'mode' | 'all';
  onDocsPanelChange: (panel: 'mode' | 'all') => void;
  docsMode: DocsMode;
  onDocsModeChange: (mode: DocsMode) => void;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  intentText?: string;
  analyzeCode?: string;
  fixDetailsText?: string;
  buildDocsEntries: DocsEntry[];
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
  buildDocsSelection: Record<string, boolean>;
  buildDocsSelectionsByMode: Record<DocsMode, Record<string, boolean>>;
  onToggleBuildDocForMode: (mode: DocsMode, path: string, isIncluded: boolean) => void;
  onToggleBuildDoc: (path: string, isIncluded: boolean) => void;
  systemPromptEntry: DocsEntry;
  isSystemPromptRaw: boolean;
  onSystemPromptRawChange: (mode: DocsMode, isRaw: boolean) => void;
  activeBuildDocName: string;
  activeDocEntry?: DocsEntry;
}

const formatTokenCount = (value?: number) => {
  if (!value || value <= 0) return '';
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${value}`;
};

const BuildDocsPanel: React.FC<BuildDocsPanelProps> = ({
  docsPanel,
  onDocsPanelChange,
  docsMode,
  onDocsModeChange,
  promptPreviewByMode,
  intentText,
  analyzeCode,
  fixDetailsText,
  buildDocsEntries,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
  buildDocsSelection,
  buildDocsSelectionsByMode,
  onToggleBuildDocForMode,
  onToggleBuildDoc,
  systemPromptEntry,
  isSystemPromptRaw,
  onSystemPromptRawChange,
  activeBuildDocName,
  activeDocEntry,
}) => {
  const modeButtonStyles: Record<DocsMode, { active: string; inactive: string }> = {
    chat: {
      active: MODE_UI.chat.button ?? '',
      inactive: MODE_UI.chat.buttonInactive ?? '',
    },
    build: {
      active: MODE_UI.build.button ?? '',
      inactive: MODE_UI.build.buttonInactive ?? '',
    },
    analyze: {
      active: MODE_UI.analyze.button ?? '',
      inactive: MODE_UI.analyze.buttonInactive ?? '',
    },
    fix: {
      active: MODE_UI.fix.button ?? '',
      inactive: MODE_UI.fix.buttonInactive ?? '',
    },
  };
  const { intentPreview, topPanelTitle, topPanelText } = useBuildDocsContent({
    docsMode,
    promptPreviewByMode,
    intentText,
    analyzeCode,
    fixDetailsText,
    activeDocEntry,
    isSystemPromptRaw,
    activeBuildDocName,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const dragRef = useRef<{ startY: number; startRatio: number } | null>(null);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const delta = event.clientY - dragRef.current.startY;
      const next = (dragRef.current.startRatio * rect.height + delta) / rect.height;
      const clamped = Math.min(0.8, Math.max(0.2, next));
      setSplitRatio(clamped);
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleDragStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    dragRef.current = { startY: event.clientY, startRatio: splitRatio };
  };
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-[#282c34]">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-2 py-2">
        <div className="flex items-center gap-1">
          {(['chat', 'build', 'analyze', 'fix'] as DocsMode[]).map((mode) => {
            const tokenCount = promptPreviewByMode[mode]?.tokenCounts?.total;
            const tokenLabel = formatTokenCount(tokenCount);
            const styles = modeButtonStyles[mode];
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  onDocsPanelChange('mode');
                  onDocsModeChange(mode);
                }}
                className={`px-2 py-0.5 text-[10px] rounded border capitalize ${
                  docsPanel === 'mode' && docsMode === mode ? styles.active : styles.inactive
                }`}
                title={`Docs selection for ${mode}`}
              >
                {mode}
                {tokenLabel ? ` · ${tokenLabel}` : ''}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onDocsPanelChange('all')}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              docsPanel === 'all'
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Global docs selection"
          >
            All docs
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-2 py-1">
        {docsPanel === 'all' ? (
          <div className="w-full overflow-auto">
            <table className="min-w-full text-[10px] text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="text-left text-slate-400 dark:text-slate-500">
                  <th className="px-2 py-1 font-medium">File</th>
                  {(['chat', 'build', 'analyze', 'fix'] as DocsMode[]).map((mode) => (
                    <th key={mode} className="px-2 py-1 font-medium text-center uppercase tracking-wide">
                      {mode}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildDocsEntries.map((entry) => {
                  const fileName = entry.path.split('/').pop() || entry.path;
                  const isActive = entry.path === buildDocsActivePath;
                  return (
                    <tr key={entry.path} className={isActive ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}>
                      <td className="px-2 py-1">
                        <button
                          type="button"
                          onClick={() => onBuildDocsActivePathChange(entry.path)}
                          className="truncate max-w-[220px] text-left hover:underline"
                          title={entry.path}
                        >
                          {fileName}
                        </button>
                      </td>
                      {(['chat', 'build', 'analyze', 'fix'] as DocsMode[]).map((mode) => {
                        const selection = buildDocsSelectionsByMode[mode] ?? {};
                        const isChecked = selection[entry.path] !== false;
                        return (
                          <td key={`${entry.path}-${mode}`} className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => onToggleBuildDocForMode(mode, entry.path, event.target.checked)}
                              className="accent-indigo-600"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          [systemPromptEntry, ...buildDocsEntries].map((entry) => {
            const isActive = entry.path === buildDocsActivePath;
            const isSystemPrompt = isSystemPromptPath(entry.path);
            const fileName = entry.path.split('/').pop() || entry.path;
            const isIncluded = buildDocsSelection[entry.path] !== false;
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => onBuildDocsActivePathChange(entry.path)}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                title={entry.path}
              >
                {!isSystemPrompt && (
                  <input
                    type="checkbox"
                    checked={isIncluded}
                    onChange={(event) => onToggleBuildDoc(entry.path, event.target.checked)}
                    onClick={(event) => event.stopPropagation()}
                    className="accent-indigo-600"
                  />
                )}
                <span className="truncate max-w-[140px]">{fileName}</span>
                {isSystemPrompt && (
                  <>
                    <span className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-300">Raw</span>
                    <input
                      type="checkbox"
                      checked={isSystemPromptRaw}
                      onChange={(event) => onSystemPromptRawChange(docsMode, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                      className="accent-indigo-600"
                    />
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
      <div ref={containerRef} className="flex-1 min-h-0 flex flex-col">
        <div style={{ flexBasis: `${splitRatio * 100}%` }} className="min-h-0 overflow-auto">
          <div className="px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{topPanelTitle}</div>
            {topPanelText ? (
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                <code
                  className="language-markdown"
                  dangerouslySetInnerHTML={{
                    __html: highlight(topPanelText, languages.markdown, 'markdown'),
                  }}
                />
              </pre>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                {isSystemPromptRaw ? 'Raw prompt is not available yet.' : 'No documentation loaded for this type.'}
              </div>
            )}
          </div>
        </div>
        <div
          className="h-2 cursor-row-resize bg-slate-200 dark:bg-slate-700 hover:bg-blue-400 transition-colors"
          onMouseDown={handleDragStart}
          title="Resize panels"
        />
        <div style={{ flexBasis: `${(1 - splitRatio) * 100}%` }} className="min-h-0 overflow-auto">
          <div className="px-4 py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              Intent ({docsMode}){isSystemPromptRaw ? ' · Raw' : ''}
            </div>
            {intentPreview ? (
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                <code
                  className={docsMode === 'analyze' ? 'language-mermaid' : 'language-markdown'}
                  dangerouslySetInnerHTML={{
                    __html: highlight(
                      intentPreview,
                      docsMode === 'analyze' ? languages.mermaid : languages.markdown,
                      docsMode === 'analyze' ? 'mermaid' : 'markdown'
                    ),
                  }}
                />
              </pre>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                Intent is not available yet. Use Chat to define it.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildDocsPanel;
