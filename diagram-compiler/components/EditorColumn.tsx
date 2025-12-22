import React, { useEffect, useRef } from 'react';
import { Bookmark, Check, Copy, PenTool, RefreshCw } from 'lucide-react';
import { DiagramType, DocsMode, EditorTab, MermaidState, PromptPreviewMode, PromptPreviewTab } from '../types';
import { AUTO_FIX_MAX_ATTEMPTS } from '../constants';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import './syntax-dark.css';
import { isMarkdownLike, MermaidMarkdownBlock, replaceMermaidBlockInMarkdown } from '../services/mermaidService';
import type { DocsEntry } from '../services/docsContextService';

const SYSTEM_PROMPT_DOC_PREFIX = 'system-prompts/';

// Define minimal Mermaid grammar
languages.mermaid = {
  'comment': /%%.*/,
  'string': {
    pattern: /(["'])(?:(?!\1)[^\\\r\n]|\\.)*\1/,
    greedy: true
  },
  'keyword': /\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|subgraph|end|participant|actor|class|style|linkStyle)\b/,
  'arrow': /-->|---|-.->|==>|==|-.|--/,
  'operator': /[|:;]+/,
  'variable': /\b[A-Za-z_][A-Za-z0-9_]*\b/
};

const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  architecture: 'Architecture',
  block: 'Block',
  c4: 'C4',
  class: 'Class Diagram',
  er: 'Entity Relationship',
  flowchart: 'Flowchart',
  gantt: 'Gantt',
  gitGraph: 'Git Graph',
  kanban: 'Kanban',
  mindmap: 'Mindmap',
  packet: 'Packet',
  pie: 'Pie',
  quadrantChart: 'Quadrant Chart',
  radar: 'Radar',
  requirementDiagram: 'Requirement Diagram',
  sequence: 'Sequence Diagram',
  sankey: 'Sankey',
  state: 'State Diagram',
  timeline: 'Timeline',
  treemap: 'Treemap',
  userJourney: 'User Journey',
  xychart: 'XY Chart',
  zenuml: 'ZenUML',
};

const formatDiagramTypeLabel = (diagramType: DiagramType | null | undefined) => {
  if (!diagramType) return 'Mermaid';
  return DIAGRAM_TYPE_LABELS[diagramType] ?? 'Mermaid';
};

interface EditorColumnProps {
  mermaidState: MermaidState;
  onChange: (code: string) => void;
  onAnalyze: () => void;
  onFixSyntax: () => void;
  onSnapshot: () => void;
  isAIReady: boolean;
  isProcessing: boolean;
  analyzeLanguage: string;
  onAnalyzeLanguageChange: (lang: string) => void;
  appLanguage: string;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  docsMode: DocsMode;
  onDocsModeChange: (mode: DocsMode) => void;
  activeTab: EditorTab;
  buildDocsEntries: DocsEntry[];
  buildDocsSelection: Record<string, boolean>;
  onToggleBuildDoc: (path: string, isIncluded: boolean) => void;
  buildDocsSelectionsByMode: Record<DocsMode, Record<string, boolean>>;
  onToggleBuildDocForMode: (mode: DocsMode, path: string, isIncluded: boolean) => void;
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
  systemPromptRawByMode: Record<DocsMode, boolean>;
  onSystemPromptRawChange: (mode: DocsMode, isRaw: boolean) => void;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveTabChange: (tab: EditorTab) => void;
}

const EditorColumn: React.FC<EditorColumnProps> = ({
  mermaidState,
  onChange,
  onAnalyze,
  onFixSyntax,
  onSnapshot,
  isAIReady,
  isProcessing,
  analyzeLanguage,
  onAnalyzeLanguageChange,
  appLanguage,
  promptPreviewByMode,
  docsMode,
  onDocsModeChange,
  activeTab,
  buildDocsEntries,
  buildDocsSelection,
  onToggleBuildDoc,
  buildDocsSelectionsByMode,
  onToggleBuildDocForMode,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
  systemPromptRawByMode,
  onSystemPromptRawChange,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveTabChange
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [docsPanel, setDocsPanel] = React.useState<'mode' | 'all'>('mode');
  const formatTokenCount = (value?: number) => {
    if (!value || value <= 0) return '';
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return `${value}`;
  };
  const promptChat = promptPreviewByMode.chat;
  const promptBuild = promptPreviewByMode.build;
  const promptAnalyze = promptPreviewByMode.analyze;
  const promptFix = promptPreviewByMode.fix;
  const isBuildDocsTab = activeTab === 'build_docs';
  const isMarkdownMermaidTab = activeTab === 'markdown_mermaid';
  const activePrompt = docsMode === 'chat'
    ? promptChat
    : docsMode === 'build'
      ? promptBuild
      : docsMode === 'analyze'
        ? promptAnalyze
        : promptFix;
  const isSystemPromptRaw = systemPromptRawByMode[docsMode] ?? false;
  const systemPromptContent = isSystemPromptRaw
    ? activePrompt?.systemPrompt ?? ''
    : activePrompt?.systemPromptRedacted ?? activePrompt?.systemPrompt ?? '';
  const resolvePromptLang = (language?: string) => {
    if (!language) return 'en';
    if (language.toLowerCase().includes('ru') || language.toLowerCase().includes('рус')) return 'ru';
    if (language.toLowerCase().includes('en') || language.toLowerCase().includes('анг')) return 'en';
    return language.toLowerCase() === 'russian' ? 'ru' : 'en';
  };
  const resolveSelectedLanguage = () => {
    if (analyzeLanguage && analyzeLanguage !== 'auto') {
      return resolvePromptLang(analyzeLanguage);
    }
    if (appLanguage && appLanguage !== 'auto') {
      return resolvePromptLang(appLanguage);
    }
    return resolvePromptLang(activePrompt?.language);
  };
  const systemPromptLang = resolveSelectedLanguage();
  const systemPromptPath = `${SYSTEM_PROMPT_DOC_PREFIX}${systemPromptLang}/${docsMode}.md`;
  const systemPromptEntry: DocsEntry = {
    path: systemPromptPath,
    text: systemPromptContent || 'No system prompt available.',
  };
  const activeBuildDoc = buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  const isActiveSystemPrompt = buildDocsActivePath.startsWith(SYSTEM_PROMPT_DOC_PREFIX);
  const activeDocEntry = isActiveSystemPrompt ? systemPromptEntry : activeBuildDoc;
  const activeBuildDocName = activeDocEntry?.path.startsWith(SYSTEM_PROMPT_DOC_PREFIX)
    ? systemPromptEntry.path.split('/').pop() || systemPromptEntry.path
    : activeDocEntry?.path.split('/').pop() || activeDocEntry?.path || 'Docs';
  const activeMarkdownBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
  const activeMarkdownDiagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
  const isMarkdownMermaidInvalid = isMarkdownMermaidTab && activeMarkdownDiagnostics?.isValid === false;

  useEffect(() => {
    if (docsPanel !== 'all') return;
    if (!buildDocsEntries.length) return;
    if (buildDocsActivePath.startsWith(SYSTEM_PROMPT_DOC_PREFIX)) {
      onBuildDocsActivePathChange(buildDocsEntries[0]?.path ?? '');
    }
  }, [buildDocsActivePath, buildDocsEntries, docsPanel, onBuildDocsActivePathChange]);

  useEffect(() => {
    if (!buildDocsEntries.length) {
      onBuildDocsActivePathChange(systemPromptPath);
      return;
    }
    if (buildDocsActivePath.startsWith(SYSTEM_PROMPT_DOC_PREFIX)) {
      if (buildDocsActivePath !== systemPromptPath) {
        onBuildDocsActivePathChange(systemPromptPath);
      }
      return;
    }
    if (buildDocsActivePath && buildDocsEntries.some((entry) => entry.path === buildDocsActivePath)) return;
    onBuildDocsActivePathChange(systemPromptPath);
  }, [buildDocsActivePath, buildDocsEntries, onBuildDocsActivePathChange, systemPromptPath]);

  // Sync scrolling
  const handleScroll = () => {
    if (scrollContainerRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
  };

  const handleCopy = () => {
    const textToCopy = isMarkdownMermaidTab
      ? activeMarkdownBlock?.code || ''
      : isBuildDocsTab
      ? activeDocEntry?.text || ''
      : mermaidState.code;
    if (!textToCopy.trim()) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const editorValue = isMarkdownMermaidTab ? activeMarkdownBlock?.code ?? '' : mermaidState.code;
  const editorLineCount = editorValue.split('\n').length;
  const editorLineNumbers = Array.from({ length: Math.max(editorLineCount, 1) }, (_, i) => i + 1);
  const isMarkdown = isMarkdownLike(mermaidState.code);
  const canFix = isMarkdownMermaidInvalid || (!isMarkdown && mermaidState.status === 'invalid');
  const markdownValidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === true).length;
  const markdownInvalidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === false).length;
  const highlightMarkdownWithActiveBlock = (code: string) => {
    if (!activeMarkdownBlock || !isMarkdown) {
      return highlight(code, languages.markdown, 'markdown');
    }
    const start = activeMarkdownBlock.start;
    const end = activeMarkdownBlock.end;
    if (start < 0 || end <= start || start >= code.length) {
      return highlight(code, languages.markdown, 'markdown');
    }
    const safeStart = Math.max(0, Math.min(start, code.length));
    const safeEnd = Math.max(safeStart, Math.min(end, code.length));
    if (safeEnd <= safeStart) {
      return highlight(code, languages.markdown, 'markdown');
    }
    const before = code.slice(0, safeStart);
    const focus = code.slice(safeStart, safeEnd);
    const after = code.slice(safeEnd);
    const beforeHtml = highlight(before, languages.markdown, 'markdown');
    const focusHtml = highlight(focus, languages.markdown, 'markdown');
    const afterHtml = highlight(after, languages.markdown, 'markdown');
    return `${beforeHtml}<span class="markdown-active-block">${focusHtml}</span>${afterHtml}`;
  };
  const highlightEditorCode = (code: string) => {
    if (isMarkdown) {
      return highlightMarkdownWithActiveBlock(code);
    }
    return highlight(code, languages.mermaid, 'mermaid');
  };
  const isSnapshotInvalid = isMarkdownMermaidTab
    ? activeMarkdownDiagnostics?.isValid === false
    : !mermaidState.isValid;
  const canSnapshot = !!mermaidState.code.trim() && !isProcessing && !isSnapshotInvalid;

  const showEditorTabs = isMarkdown && markdownMermaidBlocks.length > 0 && !isBuildDocsTab;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-r border-slate-200 dark:border-slate-800">
      {/* Toolbar / Actions */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs font-mono w-full">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-slate-500 dark:text-slate-400">Status:</span>
              {isMarkdown && <span className="text-blue-600 dark:text-blue-400 font-bold">📄 Markdown</span>}
              {isMarkdown && markdownMermaidBlocks.length > 0 && (
                <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span>Blocks:</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-green-700" />
                    <span>{markdownValidCount}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-red-700" />
                    <span>{markdownInvalidCount}</span>
                  </span>
                </span>
              )}
              {!isMarkdown && mermaidState.status === 'valid' && (
                <span
                  className="inline-flex h-3 w-3 rounded-full bg-green-500 ring-1 ring-green-700"
                  title="Valid diagram"
                />
              )}
              {!isMarkdown && mermaidState.status === 'invalid' && (
                <span
                  className="inline-flex h-3 w-3 rounded-full bg-red-500 ring-1 ring-red-700"
                  title={`Invalid diagram${mermaidState.errorLine ? ` (Line ${mermaidState.errorLine})` : ''}`}
                />
              )}
              {mermaidState.status === 'empty' && <span className="text-slate-400">Empty</span>}
              {!isMarkdown && mermaidState.status === 'edited' && <span className="text-amber-600 dark:text-amber-400">⚠ Edited</span>}
            </div>
            <div className="flex items-center gap-1.5 font-sans justify-self-end">
              <button 
                onClick={onAnalyze}
                disabled={!isAIReady || !mermaidState.code.trim() || isProcessing}
                className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Explain this diagram in chat"
              >
                <PenTool size={10} /> Analyze
              </button>

              <select
                value={analyzeLanguage}
                onChange={(e) => onAnalyzeLanguageChange(e.target.value)}
                className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 cursor-pointer"
                title="Analyze language"
                disabled={isProcessing}
              >
                <option value="auto">Auto</option>
                <option value="English">EN</option>
                <option value="Russian">RU</option>
              </select>

              <button 
                onClick={onFixSyntax}
                disabled={!isAIReady || isProcessing || !canFix}
                className={`px-2 py-1 text-[10px] font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                  canFix ? 'text-white bg-amber-600 hover:bg-amber-700' : 'text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-500'
                }`}
                title={`Attempt to fix syntax errors (up to ${AUTO_FIX_MAX_ATTEMPTS} tries)`}
              >
                 <RefreshCw size={10} className={isProcessing ? "animate-spin" : ""} /> Fix ({AUTO_FIX_MAX_ATTEMPTS})
              </button>

              <button 
                onClick={onSnapshot}
                disabled={!canSnapshot}
                className={`px-2 py-1 text-[10px] font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                  canSnapshot ? 'text-white bg-slate-700 hover:bg-slate-800' : 'text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-500'
                }`}
                title={isSnapshotInvalid ? 'Snapshot is disabled for invalid diagrams' : 'Save current diagram state to history'}
              >
                <Bookmark size={10} /> Snapshot
              </button>

              <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

              <button 
                onClick={handleCopy}
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 transition-colors" 
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
          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            <span>Source: {mermaidState.source === 'user' ? 'User' : mermaidState.source === 'compiled' ? 'Compiled' : 'User (Override)'}</span>
          </div>
          <div className="flex items-center gap-1 mt-2">
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
            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>
            <button
              type="button"
              onClick={() => onActiveTabChange('build_docs')}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                activeTab === 'build_docs'
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Build docs files"
            >
              Build Docs
            </button>
          </div>
        </div>
        
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden group">
        {isBuildDocsTab ? (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#282c34]">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 px-2 py-2">
              <div className="flex items-center gap-1">
                {(['chat', 'build', 'analyze', 'fix'] as DocsMode[]).map((mode) => {
                  const tokenCount = promptPreviewByMode[mode]?.tokenCounts?.total;
                  const tokenLabel = formatTokenCount(tokenCount);
                  return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDocsPanel('mode');
                      onDocsModeChange(mode);
                    }}
                    className={`px-2 py-0.5 text-[10px] rounded border capitalize ${
                      docsPanel === 'mode' && docsMode === mode
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  onClick={() => setDocsPanel('all')}
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
                  const isSystemPrompt = entry.path.startsWith(SYSTEM_PROMPT_DOC_PREFIX);
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
            <div className="flex-1 overflow-auto">
              <div className="px-4 py-3">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  {activeBuildDocName}
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                  {activeDocEntry?.text || 'No documentation loaded for this type.'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <>
            {showEditorTabs && (
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 px-2 py-1 bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => onActiveTabChange('code')}
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    activeTab === 'code'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Markdown
                </button>
                {markdownMermaidBlocks.map((block, index) => {
                  const isActive = isMarkdownMermaidTab && index === markdownMermaidActiveIndex;
                  const diagnostics = markdownMermaidDiagnostics[index];
                  const isInvalid = diagnostics?.isValid === false;
                  const diagramLabel = formatDiagramTypeLabel(block.diagramType);
                  const tabLabel = `${diagramLabel} ${index + 1}`;
                  return (
                    <button
                      key={`md-mermaid-tab-${block.index}`}
                      type="button"
                      onClick={() => {
                        onMarkdownMermaidActiveIndexChange(index);
                        onActiveTabChange('markdown_mermaid');
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        isInvalid
                          ? isActive
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700'
                          : isActive
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                      title={`${diagramLabel} block ${index + 1}${isInvalid ? ' (invalid)' : ''}`}
                    >
                      {tabLabel}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex-1 relative flex overflow-hidden">
              {isMarkdownMermaidTab ? (
                <>
                  <div 
                    ref={lineNumbersRef}
                    className="w-10 bg-slate-50 dark:bg-[#21252b] border-r border-slate-200 dark:border-[#181a1f] text-right pr-2 pt-4 text-xs font-mono text-slate-400 dark:text-slate-500 select-none overflow-hidden"
                  >
                    {editorLineNumbers.map((n) => (
                      <div
                        key={n}
                        className={`h-5 leading-5 ${
                          isMarkdownMermaidInvalid && n === activeMarkdownDiagnostics?.errorLine
                            ? 'text-red-600 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/20'
                            : ''
                        }`}
                      >
                        {n}
                      </div>
                    ))}
                  </div>

                  <div 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]"
                  >
                    <Editor
                      value={editorValue}
                      onValueChange={(value) => {
                        if (!activeMarkdownBlock) return;
                        const nextMarkdown = replaceMermaidBlockInMarkdown(mermaidState.code, activeMarkdownBlock, value);
                        onChange(nextMarkdown);
                      }}
                      highlight={(code) => highlight(code, languages.mermaid, 'mermaid')}
                      padding={16}
                      textareaClassName="focus:outline-none"
                      style={{
                        fontFamily: '"Fira code", "Fira Mono", monospace',
                        fontSize: 12,
                        backgroundColor: 'transparent',
                        minHeight: '100%',
                        lineHeight: '20px', 
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Line Numbers */}
                  <div 
                    ref={lineNumbersRef}
                    className="w-10 bg-slate-50 dark:bg-[#21252b] border-r border-slate-200 dark:border-[#181a1f] text-right pr-2 pt-4 text-xs font-mono text-slate-400 dark:text-slate-500 select-none overflow-hidden"
                  >
                    {editorLineNumbers.map((n) => (
                      <div
                        key={n}
                        className={`h-5 leading-5 ${
                          !isMarkdownMermaidTab && n === mermaidState.errorLine
                            ? 'text-red-500 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/20'
                            : ''
                        }`}
                      >
                        {n}
                      </div>
                    ))}
                  </div>

                  {/* Text Area / Editor */}
                  <div 
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]"
                  >
                      <Editor
                        value={editorValue}
                        onValueChange={onChange}
                        highlight={highlightEditorCode}
                        padding={16}
                        textareaClassName="focus:outline-none"
                        style={{
                          fontFamily: '"Fira code", "Fira Mono", monospace',
                          fontSize: 12,
                          backgroundColor: 'transparent',
                          minHeight: '100%',
                          lineHeight: '20px', 
                        }}
                      />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditorColumn;
