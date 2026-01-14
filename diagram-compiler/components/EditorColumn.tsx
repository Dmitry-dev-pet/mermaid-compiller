import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { DocsMode, EditorTab, MermaidState, PromptPreviewMode, PromptPreviewTab } from '../types';
import { highlight, languages } from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import './syntax-dark.css';
import { isMarkdownLike, MermaidMarkdownBlock, replaceMermaidBlockInMarkdown } from '../services/mermaidService';
import type { DocsEntry } from '../services/docsContextService';
import { ScrollSyncPayload, ScrollSyncMeasure, useScrollSync } from '../hooks/studio/useScrollSync';
import { computeMarkdownBlockScrollTops, resolveActiveMarkdownBlockIndex } from '../utils/markdownBlocks';
import { EDITOR_LINE_HEIGHT, EDITOR_PADDING } from '../utils/uiTokens';
import { useFloatingTooltip } from '../hooks/useFloatingTooltip';
import { useBuildDocsState } from '../hooks/editor/useBuildDocsState';
import { useEditorTabs } from '../hooks/editor/useEditorTabs';
import { useMarkdownMermaidBlockState } from '../hooks/markdown/useMarkdownMermaidBlockState';
import { transformMarkdownMermaid } from '../utils/markdownMermaid';
import BuildDocsPanel from './editor/BuildDocsPanel';
import CodeEditorPanel from './editor/CodeEditorPanel';
import EditorHeader from './editor/EditorHeader';
import MarkdownTabs from './editor/MarkdownTabs';
import type { DiagramMarker } from '../hooks/core/useHistory';
import { DIAGRAM_TYPE_LABELS } from '../utils/diagramTypeMeta';
import { MODE_UI, MODE_BUTTON_DISABLED, UiMode } from '../utils/uiModes';
import { HEADER_CONTROL_BUTTON } from '../utils/uiControlStyles';
import { Circle, Hammer, Layers, MessageSquare, RotateCw, Search, Settings, Sparkles, SquarePen, Wrench } from 'lucide-react';

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

interface EditorColumnProps {
  mermaidState: MermaidState;
  onChange: (code: string) => void;
  onAnalyze: () => void;
  onFixSyntax: () => void;
  onSnapshot: () => void;
  isAIReady: boolean;
  isProcessing: boolean;
  activeOperationKind?: 'chat' | 'build' | 'analyze' | 'fix' | 'compile' | null;
  isReadOnly: boolean;
  analyzeLanguage: string;
  onAnalyzeLanguageChange: (lang: string) => void;
  appLanguage: string;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  intentText?: string;
  docsMode: DocsMode;
  onDocsModeChange: (mode: DocsMode) => void;
  activeTab: EditorTab;
  buildDocsEntries: DocsEntry[];
  buildDocsSelectionsByMode: Record<DocsMode, Record<string, boolean>>;
  onToggleBuildDocForMode: (mode: DocsMode, path: string, isIncluded: boolean) => void;
  onResetBuildDocsSelections?: () => void;
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
  systemPromptRawByMode: Record<DocsMode, boolean>;
  onSystemPromptRawChange: (mode: DocsMode, isRaw: boolean) => void;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveTabChange: (tab: EditorTab) => void;
  onAppendMarkdownMermaidBlock: () => void;
  isScrollSyncEnabled: boolean;
  scrollSyncPayload: ScrollSyncPayload | null;
  onScrollSync: (payload: ScrollSyncMeasure) => void;
  hoveredMarkdownIndex: number | null;
  diagramMarkers?: DiagramMarker[];
  selectedStepId?: string | null;
  onSelectDiagramStep?: (step: DiagramMarker) => void | Promise<void>;
}

const EditorColumn: React.FC<EditorColumnProps> = ({
  mermaidState,
  onChange,
  onAnalyze,
  onFixSyntax,
  onSnapshot,
  isAIReady,
  isProcessing,
  activeOperationKind = null,
  isReadOnly,
  analyzeLanguage,
  onAnalyzeLanguageChange,
  appLanguage,
  promptPreviewByMode,
  intentText,
  docsMode,
  onDocsModeChange,
  activeTab,
  buildDocsEntries,
  buildDocsSelectionsByMode,
  onToggleBuildDocForMode,
  onResetBuildDocsSelections,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
  systemPromptRawByMode,
  onSystemPromptRawChange,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveTabChange,
  onAppendMarkdownMermaidBlock,
  isScrollSyncEnabled,
  scrollSyncPayload,
  onScrollSync,
  hoveredMarkdownIndex,
  diagramMarkers = [],
  selectedStepId = null,
  onSelectDiagramStep,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const editorValueRef = useRef<string>('');
  const [copied, setCopied] = React.useState(false);
  const { showTooltip: showTabTooltip, hideTooltip: hideTabTooltip, portal: tooltipPortal } = useFloatingTooltip();
  const isBuildDocsTab = activeTab === 'build_docs';
  const {
    systemPromptEntry,
    isSystemPromptRaw,
    activeDocEntry,
    activeBuildDocName,
  } = useBuildDocsState({
    docsMode,
    analyzeLanguage,
    appLanguage,
    promptPreviewByMode,
    systemPromptRawByMode,
    buildDocsEntries,
    buildDocsActivePath,
    onBuildDocsActivePathChange,
  });
  const {
    isMarkdownMermaidMode,
    activeBlock: activeMarkdownBlock,
    activeDiagnostics: activeMarkdownDiagnostics,
    isMarkdownMermaidInvalid,
    hoveredBlock: hoveredMarkdownBlock,
  } = useMarkdownMermaidBlockState({
    blocks: markdownMermaidBlocks,
    diagnostics: markdownMermaidDiagnostics,
    activeIndex: markdownMermaidActiveIndex,
    activeTab,
    hoveredIndex: hoveredMarkdownIndex,
  });

  const markerIconByType = useMemo(() => {
    return {
      seed: Sparkles,
      manual_edit: SquarePen,
      chat: MessageSquare,
      build: Hammer,
      fix: Wrench,
      analyze: Search,
      recompile: RotateCw,
      system: Settings,
    } satisfies Record<DiagramMarker['type'], React.ComponentType<{ className?: string }>>;
  }, []);

  const markersUi = useMemo(() => {
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

    const extractNotebookTitle = (rawIntent: string) => {
      const lines = rawIntent.split(/\r?\n/).map((line) => line.trim());
      const titleIndex = lines.findIndex((line) => /^##\s+(Название|Title)\b/i.test(line));
      if (titleIndex === -1) return '';
      for (let i = titleIndex + 1; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line) continue;
        if (/^##\s+/.test(line)) break;
        return line.replace(/^[-*]\s+/, '');
      }
      return '';
    };

    const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    const asBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);
    const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

    return diagramMarkers.map((m, markerIndex) => {
      const isSelected = m.stepId === selectedStepId;
      const meta = (m.meta ?? {}) as Record<string, unknown>;
      const metaMode = asString(meta.mode) ?? '';
      const isNotebook = metaMode === 'notebook';
      const diagramTypeRaw = typeof meta.diagramType === 'string' ? meta.diagramType : '';
      const diagramType = diagramTypeRaw ? DIAGRAM_TYPE_LABELS[diagramTypeRaw] ?? diagramTypeRaw : '';
      const blockIndex = typeof meta.blockIndex === 'number' ? meta.blockIndex : null;
      const totalBlocks = typeof meta.totalBlocks === 'number' ? meta.totalBlocks : null;
      const blockLabel =
        blockIndex !== null
          ? totalBlocks && totalBlocks > 0
            ? `block ${blockIndex + 1}/${totalBlocks}`
            : `block ${blockIndex + 1}`
          : '';
      const notebookTitle = isNotebook ? extractNotebookTitle(asString(meta.notebookPlanIntent) ?? '') : '';
      const actionLabel =
        m.type === 'build'
          ? isNotebook
            ? 'Build notebook'
            : 'Build'
          : m.type === 'fix'
            ? 'Fix'
            : m.type === 'recompile'
              ? 'Run'
              : m.type === 'manual_edit'
                ? 'Edit'
                : m.type === 'seed'
                  ? 'Seed'
                  : m.type === 'analyze'
                    ? 'Analyze'
                    : m.type;

      const targetLabel =
        m.type === 'build'
          ? [blockLabel, diagramType, notebookTitle].filter(Boolean).join(' • ') || 'Diagram'
          : '';

      const detailParts = [
        isNotebook && m.type === 'build' ? 'notebook' : '',
        !isNotebook && m.type === 'build' ? diagramType : '',
        !isMarkdownMermaidMode && blockLabel ? blockLabel : '',
      ].filter(Boolean);
      const detail = detailParts.join(' · ');
      const uiMode: UiMode =
        m.type === 'fix'
          ? 'fix'
          : m.type === 'analyze'
            ? 'analyze'
            : m.type === 'build' || m.type === 'recompile'
              ? 'build'
              : m.type === 'chat'
                ? 'chat'
                : 'system';
      const modeStyles = MODE_UI[uiMode];
      const activeClass = modeStyles.button ?? MODE_BUTTON_DISABLED;
      const inactiveClass = inactiveClassByMode[uiMode] ?? MODE_BUTTON_DISABLED;
      const Icon =
        m.type === 'build'
          ? (isNotebook ? Layers : Hammer)
          : markerIconByType[m.type] ?? Circle;

      const timeLabel = new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const markerLabel = `#${markerIndex + 1}/${diagramMarkers.length}`;
      const tooltipNotes: string[] = [];
      if (m.type === 'build') {
        const attempts = asNumber(meta.attempts) ?? asNumber(meta.buildAttempts);
        const autoFix = asNumber(meta.autoFixAttempts);
        const isValid = asBoolean(meta.isValid);
        const success = asBoolean(meta.success);
        const error = asString(meta.error);
        if (attempts !== null) tooltipNotes.push(`attempts: ${attempts}`);
        if (autoFix !== null) tooltipNotes.push(`auto-fix: ${autoFix}`);
        if (isValid !== null) tooltipNotes.push(`valid: ${isValid ? 'ok' : 'error'}`);
        if (success !== null) tooltipNotes.push(`success: ${success ? 'yes' : 'no'}`);
        if (error) tooltipNotes.push(`error: ${error}`);
      }
      const tooltipLines = [
        `${markerLabel} • ${timeLabel}`,
        [actionLabel, targetLabel].filter(Boolean).join(' • '),
        detail ? `details: ${detail}` : '',
        tooltipNotes.length ? tooltipNotes.join(' • ') : '',
        `step ${m.stepIndex + 1}`,
      ].filter(Boolean);
      const tooltip = tooltipLines.join('\n');

      return { ...m, markerIndex, isSelected, label: targetLabel || actionLabel, detail, activeClass, inactiveClass, Icon, tooltip };
    });
  }, [diagramMarkers, isMarkdownMermaidMode, markerIconByType, selectedStepId]);

  const historySummary = useMemo(() => {
    if (markersUi.length === 0) return '';
    const selectedIndex = markersUi.findIndex((m) => m.isSelected);
    if (selectedIndex >= 0) return `#${selectedIndex + 1}/${markersUi.length}`;
    return `#${markersUi.length}`;
  }, [markersUi]);

  const markdownBlockScrollTops = useMemo(() => {
    if (!isMarkdownLike(mermaidState.code)) return [];
    return computeMarkdownBlockScrollTops(
      mermaidState.code ?? '',
      markdownMermaidBlocks,
      EDITOR_LINE_HEIGHT,
      EDITOR_PADDING
    );
  }, [markdownMermaidBlocks, mermaidState.code]);

  const resolveMarkdownBlockIndexForScroll = useCallback(
    (scrollTop: number) => resolveActiveMarkdownBlockIndex(markdownBlockScrollTops, scrollTop),
    [markdownBlockScrollTops]
  );

  const handleCopy = () => {
    const textToCopy = isMarkdownMermaidMode
      ? activeMarkdownBlock?.code || ''
      : isBuildDocsTab
      ? activeDocEntry?.text || ''
      : mermaidState.code;
    if (!textToCopy.trim()) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const editorValue = isMarkdownMermaidMode ? activeMarkdownBlock?.code ?? '' : mermaidState.code;
  useEffect(() => {
    editorValueRef.current = editorValue;
  }, [editorValue]);
  const editorLineCount = editorValue.split('\n').length;
  const editorLineNumbers = Array.from({ length: Math.max(editorLineCount, 1) }, (_, i) => i + 1);
  const markdownValidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === true).length;
  const markdownInvalidCount = markdownMermaidDiagnostics.filter((diag) => diag?.isValid === false).length;
  const hasMarkdownBlocks = markdownMermaidBlocks.length > 0;
  const isMarkdown = isMarkdownLike(mermaidState.code) || hasMarkdownBlocks;
  const canFix = !isReadOnly && (isMarkdown
    ? markdownInvalidCount > 0
    : mermaidState.status === 'invalid');
  const analyzeCode = markdownMermaidBlocks.length > 0
    ? activeMarkdownBlock?.code ?? ''
    : mermaidState.code;
  const isAnalyzeValid = markdownMermaidBlocks.length > 0
    ? activeMarkdownDiagnostics?.isValid !== false
    : mermaidState.isValid;
  const fixErrorMessage = markdownMermaidBlocks.length > 0
    ? activeMarkdownDiagnostics?.errorMessage ?? ''
    : mermaidState.errorMessage ?? '';
  const fixDetailsText = analyzeCode.trim()
    ? `Code:\n\`\`\`mermaid\n${analyzeCode}\n\`\`\`\n\nError:\n${fixErrorMessage || 'No error details.'}`
    : '';
  const canAnalyze = isAIReady
    && !isProcessing
    && !isReadOnly
    && !!analyzeCode.trim()
    && isAnalyzeValid;
  const highlightMarkdownWithMermaid = (code: string) => {
    return transformMarkdownMermaid(code, {
      markdown: (segment) => highlight(segment, languages.markdown, 'markdown'),
      mermaid: (segment) => highlight(segment, languages.mermaid, 'mermaid'),
    });
  };
  const highlightMarkdownWithActiveBlock = (code: string) => {
    if (!hoveredMarkdownBlock || !isMarkdown) {
      return highlightMarkdownWithMermaid(code);
    }
    const start = hoveredMarkdownBlock.start;
    const end = hoveredMarkdownBlock.end;
    if (start < 0 || end <= start || start >= code.length) {
      return highlightMarkdownWithMermaid(code);
    }
    const safeStart = Math.max(0, Math.min(start, code.length));
    const safeEnd = Math.max(safeStart, Math.min(end, code.length));
    if (safeEnd <= safeStart) {
      return highlightMarkdownWithMermaid(code);
    }
    const before = code.slice(0, safeStart);
    const focus = code.slice(safeStart, safeEnd);
    const after = code.slice(safeEnd);
    const beforeHtml = highlightMarkdownWithMermaid(before);
    const focusHtml = highlightMarkdownWithMermaid(focus);
    const afterHtml = highlightMarkdownWithMermaid(after);
    return `${beforeHtml}<span class="markdown-active-block">${focusHtml}</span>${afterHtml}`;
  };
  const highlightEditorCode = (code: string) => {
    if (isMarkdown) {
      return highlightMarkdownWithActiveBlock(code);
    }
    return highlight(code, languages.mermaid, 'mermaid');
  };
  const highlightMarkdownMermaidCode = (code: string) => {
    return highlight(code, languages.mermaid, 'mermaid');
  };
  const isSnapshotInvalid = isMarkdownMermaidMode
    ? activeMarkdownDiagnostics?.isValid === false
    : !mermaidState.isValid;
  const canSnapshot = !isReadOnly && !!mermaidState.code.trim() && !isProcessing && !isSnapshotInvalid;
  const editorErrorLine = isMarkdownMermaidMode
    ? isMarkdownMermaidInvalid
      ? activeMarkdownDiagnostics?.errorLine ?? null
      : null
    : mermaidState.errorLine ?? null;
  const editorHighlight = isMarkdownMermaidMode ? highlightMarkdownMermaidCode : highlightEditorCode;

  const { handleActiveTabChange } = useEditorTabs({
    activeTab,
    onActiveTabChange,
    onChange,
    mermaidCode: mermaidState.code,
    editorValueRef,
  });

  const showEditorTabs = isMarkdown && markdownMermaidBlocks.length > 0;
  const canSyncScroll = isScrollSyncEnabled && isMarkdown && !isMarkdownMermaidMode && !isBuildDocsTab;
  const { handleScrollSync } = useScrollSync({
    enabled: canSyncScroll,
    source: 'editor',
    scrollRef: scrollContainerRef,
    scrollSyncPayload,
    onScrollSync,
    resolveBlockIndex: resolveMarkdownBlockIndexForScroll,
    getBlockOffset: (index) => markdownBlockScrollTops[index],
    blockBypassCooldown: true,
  });

  const handleScroll = () => {
    if (scrollContainerRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
    handleScrollSync();
  };

  return (
    <div
      className="flex flex-col h-full bg-transparent border-l border-r"
      style={{ backgroundColor: 'var(--panel-alt-bg, #ffffff)', borderColor: 'var(--panel-border, #e5e7eb)' }}
    >
        <EditorHeader
          mermaidState={mermaidState}
          isMarkdown={isMarkdown}
          showMarkdownStats={hasMarkdownBlocks}
          markdownValidCount={markdownValidCount}
          markdownInvalidCount={markdownInvalidCount}
          isProcessing={isProcessing}
          activeOperationKind={activeOperationKind}
          isAIReady={isAIReady}
          isReadOnly={isReadOnly}
          canAnalyze={canAnalyze}
          analyzeLanguage={analyzeLanguage}
          onAnalyzeLanguageChange={onAnalyzeLanguageChange}
          onAnalyze={onAnalyze}
        onFixSyntax={onFixSyntax}
        canFix={canFix}
        onSnapshot={onSnapshot}
        canSnapshot={canSnapshot}
        onCopy={handleCopy}
        copied={copied}
        activeTab={activeTab}
          onActiveTabChange={handleActiveTabChange}
        isMarkdownMermaidTab={isMarkdownMermaidMode}
        isBuildDocsTab={isBuildDocsTab}
      />

      {/* Editor Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden group">
        {showEditorTabs && (
          <MarkdownTabs
            activeTab={activeTab}
            markdownMermaidBlocks={markdownMermaidBlocks}
            markdownMermaidDiagnostics={markdownMermaidDiagnostics}
            markdownMermaidActiveIndex={markdownMermaidActiveIndex}
            onMarkdownMermaidActiveIndexChange={onMarkdownMermaidActiveIndexChange}
            onActiveTabChange={handleActiveTabChange}
            onAppendMarkdownMermaidBlock={onAppendMarkdownMermaidBlock}
            onShowTooltip={showTabTooltip}
            onHideTooltip={hideTabTooltip}
          />
        )}
        {!isBuildDocsTab && diagramMarkers.length > 0 && (
          <div
            className="border-b bg-transparent px-4 py-2"
            style={{ borderColor: 'var(--panel-border, #e5e7eb)', backgroundColor: 'var(--panel-bg, #f3f4f6)' }}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold text-[var(--control-muted-text)]">
                {activeTab === 'markdown_mermaid' ? 'Markdown history' : 'Diagram history'}
              </div>
              {!!historySummary && (
                <div className="text-[10px] font-medium text-[var(--control-muted-text)]">{historySummary}</div>
              )}
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {markersUi.map((m) => (
                <button
                  key={m.stepId}
                  type="button"
                  onClick={() => onSelectDiagramStep?.(m)}
                  onMouseEnter={(e) => showTabTooltip(e, m.tooltip)}
                  onMouseMove={(e) => showTabTooltip(e, m.tooltip)}
                  onMouseLeave={hideTabTooltip}
                  className={`shrink-0 whitespace-nowrap ${HEADER_CONTROL_BUTTON} rounded-full ${
                    m.isSelected ? m.activeClass : m.inactiveClass
                  }`}
                  title={m.tooltip}
                >
                  <m.Icon className="h-3 w-3 opacity-80" />
                  <span className="tabular-nums font-semibold">#{m.markerIndex + 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {tooltipPortal}
        {isBuildDocsTab ? (
          <BuildDocsPanel
            docsMode={docsMode}
            onDocsModeChange={onDocsModeChange}
            promptPreviewByMode={promptPreviewByMode}
            intentText={intentText}
            analyzeCode={analyzeCode}
            fixDetailsText={fixDetailsText}
            buildDocsEntries={buildDocsEntries}
            buildDocsActivePath={buildDocsActivePath}
            onBuildDocsActivePathChange={onBuildDocsActivePathChange}
            buildDocsSelectionsByMode={buildDocsSelectionsByMode}
            onToggleBuildDocForMode={onToggleBuildDocForMode}
            onResetBuildDocsSelections={onResetBuildDocsSelections}
            systemPromptEntry={systemPromptEntry}
            isSystemPromptRaw={isSystemPromptRaw}
            onSystemPromptRawChange={onSystemPromptRawChange}
            activeBuildDocName={activeBuildDocName}
            activeDocEntry={activeDocEntry}
          />
        ) : (
          <CodeEditorPanel
            lineNumbersRef={lineNumbersRef}
            scrollContainerRef={scrollContainerRef}
            lineNumbers={editorLineNumbers}
            errorLine={editorErrorLine}
            onScroll={handleScroll}
            editorValue={editorValue}
            onValueChange={(value) => {
              if (isReadOnly) return;
              editorValueRef.current = value;
              if (isMarkdownMermaidMode) {
                if (!activeMarkdownBlock) return;
                const nextMarkdown = replaceMermaidBlockInMarkdown(mermaidState.code, activeMarkdownBlock, value);
                onChange(nextMarkdown);
                return;
              }
              onChange(value);
            }}
            highlight={editorHighlight}
            isReadOnly={isReadOnly}
          />
        )}
      </div>
    </div>
  );
};

export default EditorColumn;
