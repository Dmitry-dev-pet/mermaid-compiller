import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { DocsMode, EditorTab, MermaidState, PromptPreviewMode, PromptPreviewTab } from '../types';
import { highlight, languages } from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import './syntax-dark.css';
import { isMarkdownLike, MermaidMarkdownBlock, replaceMermaidBlockInMarkdown } from '../services/mermaidService';
import type { DocsEntry } from '../services/docsContextService';
import type { DiagramMarker } from '../hooks/core/useHistory';
import { ScrollSyncPayload, ScrollSyncMeasure, useScrollSync } from '../hooks/studio/useScrollSync';
import { computeMarkdownBlockScrollTops, resolveActiveMarkdownBlockIndex } from '../utils/markdownBlocks';
import { EDITOR_LINE_HEIGHT, EDITOR_PADDING } from '../utils/uiTokens';
import { useBuildDocsState } from '../hooks/editor/useBuildDocsState';
import { useEditorTabs } from '../hooks/editor/useEditorTabs';
import { useMarkdownMermaidBlockState } from '../hooks/markdown/useMarkdownMermaidBlockState';
import { transformMarkdownMermaid } from '../utils/markdownMermaid';
import BuildDocsPanel from './editor/BuildDocsPanel';
import CodeEditorPanel from './editor/CodeEditorPanel';
import EditorHeader from './editor/EditorHeader';

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
  notebookPlanText?: string;
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
  notebookPlanText,
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
  isScrollSyncEnabled,
  scrollSyncPayload,
  onScrollSync,
  hoveredMarkdownIndex,
  diagramMarkers,
  selectedStepId,
  onSelectDiagramStep,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const editorValueRef = useRef<string>('');
  const [copied, setCopied] = React.useState(false);
  const isBuildDocsTab = activeTab === 'build_docs';
  const {
    systemPromptEntry,
    isSystemPromptRaw,
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
        diagramMarkers={diagramMarkers}
        selectedStepId={selectedStepId}
        onSelectDiagramStep={onSelectDiagramStep}
      />

      {/* Editor Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden group">
        {isBuildDocsTab ? (
          <BuildDocsPanel
            docsMode={docsMode}
            onDocsModeChange={onDocsModeChange}
            tokenCountsByMode={{
              chat: promptPreviewByMode.chat?.tokenCounts,
              build: promptPreviewByMode.build?.tokenCounts,
              plan: promptPreviewByMode.plan?.tokenCounts,
              analyze: promptPreviewByMode.analyze?.tokenCounts,
              fix: promptPreviewByMode.fix?.tokenCounts,
            }}
            intentText={intentText}
            intentPreviewText={promptPreviewByMode[docsMode]?.intentText ?? ''}
            requestPreviewText={promptPreviewByMode[docsMode]?.content ?? ''}
            requestPreviewRawText={promptPreviewByMode[docsMode]?.rawContent ?? ''}
            notebookPlanText={notebookPlanText}
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
