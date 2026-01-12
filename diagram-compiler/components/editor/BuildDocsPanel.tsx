import React, { useEffect, useRef, useState } from 'react';
import { highlight, languages } from 'prismjs';
import type { DocsEntry } from '../../services/docsContextService';
import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import { useBuildDocsContent } from '../../hooks/editor/useBuildDocsContent';
import { DOCS_MODE_ORDER } from '../../utils/docsModes';

interface BuildDocsPanelProps {
  docsMode: DocsMode;
  onDocsModeChange: (mode: DocsMode) => void;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  intentText?: string;
  analyzeCode?: string;
  fixDetailsText?: string;
  buildDocsEntries: DocsEntry[];
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
  buildDocsSelectionsByMode: Record<DocsMode, Record<string, boolean>>;
  onToggleBuildDocForMode: (mode: DocsMode, path: string, isIncluded: boolean) => void;
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
  docsMode,
  onDocsModeChange,
  promptPreviewByMode,
  intentText,
  analyzeCode,
  fixDetailsText,
  buildDocsEntries,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
  buildDocsSelectionsByMode,
  onToggleBuildDocForMode,
  systemPromptEntry,
  isSystemPromptRaw,
  onSystemPromptRawChange,
  activeBuildDocName,
  activeDocEntry,
}) => {
  const [bottomTab, setBottomTab] = useState<'system' | 'intent'>('system');
  const { intentPreview, topPanelTitle, topPanelText } = useBuildDocsContent({
    docsMode,
    intentText,
    analyzeCode,
    fixDetailsText,
    activeDocEntry,
    activeBuildDocName,
  });
  const rawPromptPreview = promptPreviewByMode[docsMode]?.rawContent || '';
  const bottomPanelTitle = bottomTab === 'system' ? `System prompt (${docsMode})` : `Intent (${docsMode})`;
  const bottomPanelText =
    bottomTab === 'system'
      ? isSystemPromptRaw
        ? rawPromptPreview
        : systemPromptEntry.text
      : intentPreview;
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
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-2 py-1">
        <div className="w-full overflow-auto">
            <table className="min-w-full text-[10px] text-slate-600 dark:text-slate-300">
              <thead>
                <tr className="text-left text-slate-400 dark:text-slate-500">
                  <th className="px-2 py-1 font-medium">File</th>
                  {DOCS_MODE_ORDER.map((mode) => {
                    const tokenCount = promptPreviewByMode[mode]?.tokenCounts?.total;
                    const tokenLabel = formatTokenCount(tokenCount);
                    const isActiveMode = docsMode === mode;
                    return (
                      <th key={mode} className="px-2 py-1 font-medium text-center uppercase tracking-wide">
                        <button
                          type="button"
                          onClick={() => onDocsModeChange(mode)}
                          className={`w-full rounded px-1 py-0.5 ${
                            isActiveMode
                              ? 'bg-indigo-600/20 text-indigo-700 dark:text-indigo-200'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title={`Show ${mode} system prompt/intent`}
                        >
                          {mode}
                          {tokenLabel ? <span className="ml-1 opacity-70 normal-case">{tokenLabel}</span> : null}
                        </button>
                      </th>
                    );
                  })}
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
                      {DOCS_MODE_ORDER.map((mode) => {
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
                No documentation loaded for this type.
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
            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBottomTab('system')}
                  className={`px-2 py-0.5 rounded border text-[10px] ${
                    bottomTab === 'system'
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Show system prompt"
                >
                  System
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('intent')}
                  className={`px-2 py-0.5 rounded border text-[10px] ${
                    bottomTab === 'intent'
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-200'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Show intent"
                >
                  Intent
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span>{bottomPanelTitle}</span>
                {bottomTab === 'system' && (
                  <label className="flex items-center gap-1 text-[10px]">
                    <span className="uppercase tracking-wide opacity-70">Raw</span>
                    <input
                      type="checkbox"
                      checked={isSystemPromptRaw}
                      onChange={(event) => onSystemPromptRawChange(docsMode, event.target.checked)}
                      className="accent-indigo-600"
                    />
                  </label>
                )}
              </div>
            </div>
            {bottomPanelText ? (
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                <code
                  className={
                    bottomTab === 'system'
                      ? 'language-markdown'
                      : docsMode === 'analyze'
                        ? 'language-mermaid'
                        : 'language-markdown'
                  }
                  dangerouslySetInnerHTML={{
                    __html: highlight(
                      bottomPanelText,
                      bottomTab === 'system'
                        ? languages.markdown
                        : docsMode === 'analyze'
                          ? languages.mermaid
                          : languages.markdown,
                      bottomTab === 'system'
                        ? 'markdown'
                        : docsMode === 'analyze'
                          ? 'mermaid'
                          : 'markdown'
                    ),
                  }}
                />
              </pre>
            ) : (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                {bottomTab === 'system'
                  ? (isSystemPromptRaw ? 'Raw prompt is not available yet.' : 'No system prompt available.')
                  : 'Intent is not available for this block yet.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildDocsPanel;
