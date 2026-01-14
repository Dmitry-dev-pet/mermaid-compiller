import React, { useEffect, useRef, useState } from 'react';
import { highlight, languages } from 'prismjs';
import type { DocsEntry } from '../../services/docsContextService';
import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import { useBuildDocsContent } from '../../hooks/editor/useBuildDocsContent';
import { DOCS_MODE_ORDER } from '../../utils/docsModes';
import { HEADER_CONTROL_BUTTON } from '../../utils/uiControlStyles';
import { Sparkles } from 'lucide-react';

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
  onResetBuildDocsSelections?: () => void;
  systemPromptEntry: DocsEntry;
  isSystemPromptRaw: boolean;
  onSystemPromptRawChange: (mode: DocsMode, isRaw: boolean) => void;
  activeBuildDocName: string;
  activeDocEntry?: DocsEntry;
}

const formatCompactCount = (value?: number) => {
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
  onResetBuildDocsSelections,
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
  const docsSizesByMode = React.useMemo(() => {
    const sizes: Record<DocsMode, { totalChars: number; totalDocs: number }> = {
      chat: { totalChars: 0, totalDocs: 0 },
      build: { totalChars: 0, totalDocs: 0 },
      plan: { totalChars: 0, totalDocs: 0 },
      analyze: { totalChars: 0, totalDocs: 0 },
      fix: { totalChars: 0, totalDocs: 0 },
    };

    for (const mode of DOCS_MODE_ORDER) {
      const selection = buildDocsSelectionsByMode[mode] ?? {};
      let totalChars = 0;
      let totalDocs = 0;
      for (const entry of buildDocsEntries) {
        if (selection[entry.path] === false) continue;
        totalDocs += 1;
        totalChars += entry.text?.length ?? 0;
      }
      sizes[mode] = { totalChars, totalDocs };
    }
    return sizes;
  }, [buildDocsEntries, buildDocsSelectionsByMode]);
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
    <div className="flex-1 min-h-0 flex flex-col bg-transparent" style={{ backgroundColor: 'var(--panel-alt-bg, #ffffff)' }}>
      <div
        className="border-b px-2 py-2 bg-transparent"
        style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-bg, #f3f4f6)' }}
      >
        {!!onResetBuildDocsSelections && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold text-[var(--control-muted-text)]">Docs</div>
            <button
              type="button"
              className={HEADER_CONTROL_BUTTON}
              onClick={onResetBuildDocsSelections}
              title="Reset docs selection to minimal defaults (affects all modes)"
            >
              <Sparkles className="h-3 w-3" />
              Default
            </button>
          </div>
        )}
        <div className="w-full overflow-auto rounded-md border border-[var(--panel-border)] bg-[var(--menu-bg)]">
            <table className="min-w-full text-[10px] text-[var(--control-text)]">
              <thead>
                <tr className="text-left text-[var(--control-muted-text)]">
                  <th className="px-2 py-1 font-medium">File</th>
                  {DOCS_MODE_ORDER.map((mode) => {
                    const isActiveMode = docsMode === mode;
                    const docsSize = docsSizesByMode[mode]?.totalChars ?? 0;
                    const docsLabel = formatCompactCount(docsSize);
                    const docsCount = docsSizesByMode[mode]?.totalDocs ?? 0;
                    return (
                      <th key={mode} className="px-2 py-1 font-medium text-center uppercase tracking-wide">
                        <button
                          type="button"
                          onClick={() => onDocsModeChange(mode)}
                          className={`w-full rounded px-1 py-1 ${
                            isActiveMode
                              ? 'bg-indigo-600/20 text-indigo-700 dark:text-indigo-200'
                              : 'hover:bg-[var(--menu-bg-hover)]'
                          }`}
                          title={`Show ${mode} system prompt/intent`}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <div>{mode}</div>
                            <div className="text-[9px] normal-case opacity-70">
                              {docsCount ? `${docsCount} • ` : ''}
                              {docsLabel || '0'}
                            </div>
                          </div>
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
                    <tr key={entry.path} className={isActive ? 'bg-[var(--menu-bg-hover)]' : ''}>
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
            <div className="text-[11px] text-[var(--control-muted-text)] mb-2">{topPanelTitle}</div>
            {topPanelText ? (
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--control-text)]">
                <code
                  className="language-markdown"
                  dangerouslySetInnerHTML={{
                    __html: highlight(topPanelText, languages.markdown, 'markdown'),
                  }}
                />
              </pre>
            ) : (
              <div className="text-[11px] text-[var(--control-muted-text)] italic">
                No documentation loaded for this type.
              </div>
            )}
          </div>
        </div>
        <div
          className="h-2 cursor-row-resize hover:bg-blue-400 transition-colors"
          style={{ backgroundColor: 'var(--panel-border, #e5e7eb)' }}
          onMouseDown={handleDragStart}
          title="Resize panels"
        />
        <div style={{ flexBasis: `${(1 - splitRatio) * 100}%` }} className="min-h-0 overflow-auto">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--control-muted-text)] mb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setBottomTab('system')}
                  className={`${HEADER_CONTROL_BUTTON} ${
                    bottomTab === 'system'
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-200'
                      : ''
                  }`}
                  title="Show system prompt"
                >
                  System
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('intent')}
                  className={`${HEADER_CONTROL_BUTTON} ${
                    bottomTab === 'intent'
                      ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-700 dark:text-indigo-200'
                      : ''
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
              <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--control-text)]">
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
              <div className="text-[11px] text-[var(--control-muted-text)] italic">
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
