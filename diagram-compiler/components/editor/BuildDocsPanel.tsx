import React, { useMemo, useRef } from 'react';
import { highlight, languages } from 'prismjs';
import type { DocsEntry } from '../../services/docsContextService';
import type { DocsMode, PromptTokenCounts } from '../../types';
import { DOCS_MODE_ORDER } from '../../utils/docsModes';
import { Button } from '../ui/Button';
import { Sparkles } from 'lucide-react';
import { isSystemPromptPath } from '../../utils/systemPrompts';
import {
  PROMPTS_VIRTUAL_ENTRIES,
  PROMPTS_VIRTUAL_INTENT_PATH,
  PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH,
  PROMPTS_VIRTUAL_SYSTEM_PATH,
  getPromptsVirtualLabel,
} from '../../utils/promptsVirtualPaths';
import { MERMAID_VERSION } from '../../constants';

interface BuildDocsPanelProps {
  docsMode: DocsMode;
  onDocsModeChange: (mode: DocsMode) => void;
  tokenCountsByMode?: Partial<Record<DocsMode, PromptTokenCounts | undefined>>;
  intentText?: string;
  intentPreviewText?: string;
  requestPreviewText?: string;
  requestPreviewRawText?: string;
  notebookPlanText?: string;
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
}

const BuildDocsPanel: React.FC<BuildDocsPanelProps> = ({
  docsMode,
  onDocsModeChange,
  tokenCountsByMode,
  intentText,
  intentPreviewText,
  requestPreviewText,
  requestPreviewRawText,
  notebookPlanText,
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
}) => {
  const formatCompactCount = (value?: number) => {
    if (!value || value <= 0) return '';
    if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}m`;
    if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    return `${value}`;
  };

  const tokensLabelByMode = useMemo(() => {
    const result: Partial<Record<DocsMode, string>> = {};
    for (const mode of DOCS_MODE_ORDER) {
      const total = tokenCountsByMode?.[mode]?.total ?? 0;
      const label = formatCompactCount(total);
      result[mode] = label;
    }
    return result;
  }, [tokenCountsByMode]);

  const virtualEntries = useMemo<DocsEntry[]>(() => PROMPTS_VIRTUAL_ENTRIES.map((entry) => ({ path: entry.path, text: '' })), []);

  const fileEntries = useMemo(() => [...virtualEntries, ...buildDocsEntries], [buildDocsEntries, virtualEntries]);

  const resolveEntryName = (path: string) => {
    const virtualLabel = getPromptsVirtualLabel(path);
    if (virtualLabel) return virtualLabel;
    return path.split('/').pop() || path;
  };

  const resolvedIntentPreviewText = useMemo(() => {
    const previewIntent = intentPreviewText?.trim() ?? '';
    const analyzePreview = analyzeCode?.trim() ?? '';
    const fixPreview = fixDetailsText?.trim() ?? '';
    if (docsMode === 'analyze') return analyzePreview;
    if (docsMode === 'fix') return fixPreview;
    return previewIntent || (intentText ?? '').trim();
  }, [analyzeCode, docsMode, fixDetailsText, intentPreviewText, intentText]);

  const activeDocEntry = useMemo<DocsEntry>(() => {
    if (buildDocsActivePath === PROMPTS_VIRTUAL_SYSTEM_PATH) {
      const previewText = isSystemPromptRaw ? (requestPreviewRawText ?? '') : (requestPreviewText ?? '');
      const text = previewText.trim() ? previewText : (systemPromptEntry.text || 'No system prompt available.');
      return { path: PROMPTS_VIRTUAL_SYSTEM_PATH, text };
    }
    if (buildDocsActivePath === PROMPTS_VIRTUAL_INTENT_PATH) {
      return { path: PROMPTS_VIRTUAL_INTENT_PATH, text: resolvedIntentPreviewText };
    }
    if (buildDocsActivePath === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH) {
      const text = (notebookPlanText ?? '').trim();
      return { path: PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH, text };
    }
    if (isSystemPromptPath(buildDocsActivePath)) {
      return { path: buildDocsActivePath, text: systemPromptEntry.text || 'No system prompt available.' };
    }
    return buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0] ?? { path: 'docs/empty', text: '' };
  }, [
    buildDocsActivePath,
    buildDocsEntries,
    isSystemPromptRaw,
    notebookPlanText,
    requestPreviewRawText,
    requestPreviewText,
    resolvedIntentPreviewText,
    systemPromptEntry.text,
  ]);

  const activeBuildDocName = resolveEntryName(buildDocsActivePath || activeDocEntry?.path || 'Docs');
  const isSystemView = activeDocEntry.path === PROMPTS_VIRTUAL_SYSTEM_PATH || isSystemPromptPath(activeDocEntry.path);
  const isIntentView = activeDocEntry.path === PROMPTS_VIRTUAL_INTENT_PATH;
  const isNotebookPlanView = activeDocEntry.path === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH;
  const codeLanguage =
    isSystemView
      ? 'markdown'
      : isIntentView && docsMode === 'analyze'
        ? 'mermaid'
        : 'markdown';
  const prismLanguage =
    codeLanguage === 'mermaid'
      ? languages.mermaid
      : languages.markdown;
  const contentRef = useRef<HTMLDivElement>(null);
  const matrixActivePath = useMemo(() => {
    if (isSystemPromptPath(buildDocsActivePath)) return PROMPTS_VIRTUAL_SYSTEM_PATH;
    if (fileEntries.some((entry) => entry.path === buildDocsActivePath)) return buildDocsActivePath;
    if (fileEntries.some((entry) => entry.path === activeDocEntry.path)) return activeDocEntry.path;
    return PROMPTS_VIRTUAL_SYSTEM_PATH;
  }, [activeDocEntry.path, buildDocsActivePath, fileEntries]);

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-transparent" style={{ backgroundColor: 'var(--panel-alt-bg, #ffffff)' }}>
      <div
        className="border-b px-2 py-2 bg-transparent"
        style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-bg, #f3f4f6)' }}
      >
        {!!onResetBuildDocsSelections && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[10px] font-semibold text-[var(--control-muted-text)]">
              <span>Docs</span>{' '}
              <span className="font-mono text-[9px] opacity-70">{MERMAID_VERSION}</span>
            </div>
            <Button
              type="button"
              onClick={onResetBuildDocsSelections}
              title="Reset docs selection to minimal defaults (affects all modes)"
            >
              <Sparkles className="h-3 w-3" />
              Default
            </Button>
          </div>
        )}
        <div className="w-full overflow-auto rounded-md border border-[var(--panel-border)] bg-[var(--menu-bg)]">
            <table className="min-w-full text-[10px] text-[var(--control-text)]">
              <thead>
                <tr className="text-left text-[var(--control-muted-text)]">
                  <th className="px-2 py-1 font-medium">File</th>
                  {DOCS_MODE_ORDER.map((mode) => {
                    const isActiveMode = docsMode === mode;
                    return (
                      <th key={mode} className="px-2 py-1 font-medium text-center uppercase tracking-wide">
                        <Button
                          type="button"
                          onClick={() => onDocsModeChange(mode)}
                          variant="ghost"
                          className={`w-full rounded px-1 py-1 text-[10px] ${
                            isActiveMode
                              ? 'bg-indigo-600/20 text-indigo-700 dark:text-indigo-200'
                              : 'hover:bg-[var(--menu-bg-hover)]'
                          }`}
                          title={`Show ${mode} system prompt/intent`}
                        >
                          <div className="flex flex-col items-center leading-tight">
                            <div>{mode}</div>
                          </div>
                        </Button>
                      </th>
                    );
                  })}
                </tr>
                <tr className="text-left text-[var(--control-muted-text)]">
                  <th className="px-2 pb-2">
                    <div className="text-[9px] font-medium uppercase tracking-wide">∑ tok</div>
                  </th>
                  {DOCS_MODE_ORDER.map((mode) => {
                    const label = tokensLabelByMode[mode] ?? '';
                    return (
                      <th key={`${mode}-tokens`} className="px-2 pb-2 text-center">
                        <span className="text-[10px] font-mono tabular-nums opacity-80">{label || '—'}</span>
                      </th>
                    );
                  })}
                </tr>
                <tr aria-hidden>
                  <th colSpan={DOCS_MODE_ORDER.length + 1} className="px-2 py-0">
                    <div className="h-px bg-[var(--panel-border)] opacity-60" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {fileEntries.map((entry) => {
                  const isVirtual =
                    entry.path === PROMPTS_VIRTUAL_SYSTEM_PATH
                    || entry.path === PROMPTS_VIRTUAL_INTENT_PATH
                    || entry.path === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH;
                  const fileName = entry.path.split('/').pop() || entry.path;
                  const isActive = entry.path === matrixActivePath;
                  return (
                    <tr key={entry.path} className={isActive ? 'bg-[var(--menu-bg-hover)]' : ''}>
                      <td className="px-2 py-1">
                        <Button
                          type="button"
                          onClick={() => onBuildDocsActivePathChange(entry.path)}
                          variant="ghost"
                          className="h-auto px-0 py-0 text-left truncate max-w-[220px] hover:underline"
                          title={entry.path}
                        >
                          {isVirtual ? resolveEntryName(entry.path) : fileName}
                        </Button>
                      </td>
                      {DOCS_MODE_ORDER.map((mode) => {
                        const isCross = isActive && docsMode === mode;
                        const cellClass = 'px-2 py-1 text-center';
                        if (isVirtual) {
                          return (
                            <td
                              key={`${entry.path}-${mode}`}
                              className={`${cellClass} text-[9px] ${isCross ? '' : 'opacity-50'}`}
                              title={isCross ? 'Active file + mode' : undefined}
                            >
                              {isCross ? (
                                <span
                                  className="inline-flex h-3 w-3 rounded-full border border-slate-400 dark:border-slate-500"
                                  aria-hidden
                                />
                              ) : (
                                '—'
                              )}
                            </td>
                          );
                        }
                        const selection = buildDocsSelectionsByMode[mode] ?? {};
                        const isChecked = selection[entry.path] !== false;
                        return (
                          <td key={`${entry.path}-${mode}`} className={cellClass} title={isCross ? 'Active file + mode' : undefined}>
                            <span className="relative inline-flex items-center justify-center">
                              {isCross && (
                                <span
                                  className="pointer-events-none absolute -inset-1 rounded-full border border-slate-400 dark:border-slate-500"
                                  aria-hidden
                                />
                              )}
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => onToggleBuildDocForMode(mode, entry.path, event.target.checked)}
                                className="accent-indigo-600"
                              />
                            </span>
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
      <div ref={contentRef} className="flex-1 min-h-0 overflow-auto">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--control-muted-text)] mb-2">
            <div className="truncate">{activeBuildDocName}</div>
            {isSystemView && (
              <label className="flex items-center gap-1 text-[10px] shrink-0">
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
          {activeDocEntry.text ? (
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--control-text)]">
              <code
                className={`language-${codeLanguage}`}
                dangerouslySetInnerHTML={{
                  __html: highlight(activeDocEntry.text, prismLanguage, codeLanguage),
                }}
              />
            </pre>
          ) : (
            <div className="text-[11px] text-[var(--control-muted-text)] italic">
              {isIntentView
                ? 'Intent is not available yet.'
                : isNotebookPlanView
                  ? 'Notebook plan is not available yet.'
                  : 'No documentation loaded for this type.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuildDocsPanel;
