import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocsMode, EditorTab, MermaidState } from '../types';
import { useDiagramExport } from '../hooks/studio/useDiagramExport';
import { MermaidThemeName } from '../utils/inlineThemeCommand';
import { extractInlineDirectionCommand, MermaidDirection } from '../utils/inlineDirectionCommand';
import { extractInlineLookCommand, MermaidLook } from '../utils/inlineLookCommand';
import {
  extractFlowchartEdgeStyle,
  FlowchartEdgeStyle,
  FlowchartEdgeStyleUpdate,
} from '../utils/flowchartArrowStyle';
import { extractFlowchartLinkStylePreset, FlowchartLinkStylePresetId } from '../utils/flowchartLinkStyle';
import { extractFlowchartCurve, FlowchartCurve } from '../utils/flowchartCurveConfig';
import { extractFrontmatterThemeVariables } from '../utils/mermaidFrontmatterThemeVariables';
import {
  extractMermaidThemePreset,
  getMermaidThemePresetPanelBackground,
  MermaidThemePresetId,
  MERMAID_THEME_PRESETS,
} from '../utils/mermaidThemePreset';
import { extractMermaidSvgBackgroundColor } from '../utils/mermaidSvgBackground';
import {
  detectMermaidDiagramType,
  isMarkdownLike,
  MermaidMarkdownBlock,
} from '../services/mermaidService';
import { initializeMermaid } from '../services/mermaidService';
import { ScrollSyncMeasure, ScrollSyncPayload, useScrollSync } from '../hooks/studio/useScrollSync';
import { useMarkdownMermaidBlockState } from '../hooks/markdown/useMarkdownMermaidBlockState';
import { useMarkdownPreview } from '../hooks/preview/useMarkdownPreview';
import { useMarkdownMermaidOffsets } from '../hooks/preview/useMarkdownMermaidOffsets';
import { useMermaidSvgRender } from '../hooks/preview/useMermaidSvgRender';
import { useSvgPanZoom } from '../hooks/preview/useSvgPanZoom';
import { useMermaidCodeBlockRenderer } from '../hooks/preview/useMermaidCodeBlockRenderer';
import { usePreviewWhiteboard } from '../hooks/preview/usePreviewWhiteboard';
import {
  DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION,
  DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK,
  getInlineDirectionOptions,
} from '../utils/diagramTypeMeta';
import { getSystemPromptModeFromPath, isSystemPromptPath } from '../utils/systemPrompts';
import { augmentMermaidErrorForAutoFix } from '../utils/mermaidAutoFixHints';
import PreviewHeaderControls from './preview/PreviewHeaderControls';
import PreviewBody from './preview/PreviewBody';
import DiagramWhiteboard from './preview/DiagramWhiteboard';
import './markdown-preview.css';
import {
  PROMPTS_VIRTUAL_INTENT_PATH,
  PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH,
  PROMPTS_VIRTUAL_SYSTEM_PATH,
  getPromptsVirtualLabel,
} from '../utils/promptsVirtualPaths';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
  appThemePresetId: MermaidThemePresetId;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  isScrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
  scrollSyncPayload: ScrollSyncPayload | null;
  onScrollSync: (payload: ScrollSyncMeasure) => void;
  onSetThemePreset: (presetId: MermaidThemePresetId | null) => void;
  onSetInlineDirection: (direction: MermaidDirection | null) => void;
  onSetInlineLook: (look: MermaidLook | null) => void;
  onSetFlowchartEdgeStyle: (update: FlowchartEdgeStyleUpdate) => void;
  onSetFlowchartLinkStylePreset: (presetId: FlowchartLinkStylePresetId) => void;
  onSetFlowchartCurve: (curve: FlowchartCurve | null) => void;
  activeEditorTab: EditorTab;
  docsMode: DocsMode;
  buildDocsSystemPrompts: Record<'chat' | 'build' | 'plan' | 'analyze' | 'fix', { raw: string; redacted: string }>;
  systemPromptRawByMode: Record<DocsMode, boolean>;
  buildDocsRequestPreviewText: string;
  buildDocsRequestPreviewRawText: string;
  buildDocsIntentPreviewText: string;
  buildDocsNotebookPlanText: string;
  buildDocsEntries: Array<{ path: string; text: string }>;
  buildDocsActivePath: string;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onAppendMarkdownMermaidBlock: () => void;
  onActiveEditorTabChange: (tab: EditorTab) => void;
  hoveredMarkdownIndex: number | null;
  onHoverMarkdownIndex: (index: number | null) => void;
  historyRevisionId: string | null;
  whiteboardSceneJson: string | null;
  whiteboardBundleJson: string | null;
  onSaveWhiteboardSceneJson: (sceneJson: string | null) => Promise<unknown> | unknown;
}

const PreviewColumn: React.FC<PreviewColumnProps> = ({
  mermaidState,
  theme,
  appThemePresetId,
  isFullScreen,
  onToggleFullScreen,
  isScrollSyncEnabled,
  onToggleScrollSync,
  scrollSyncPayload,
  onScrollSync,
  onSetThemePreset,
  onSetInlineDirection,
  onSetInlineLook,
  onSetFlowchartEdgeStyle,
  onSetFlowchartLinkStylePreset,
  onSetFlowchartCurve,
  activeEditorTab,
  docsMode,
  buildDocsSystemPrompts,
  systemPromptRawByMode,
  buildDocsRequestPreviewText,
  buildDocsRequestPreviewRawText,
  buildDocsIntentPreviewText,
  buildDocsNotebookPlanText,
  buildDocsEntries,
  buildDocsActivePath,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onAppendMarkdownMermaidBlock,
  onActiveEditorTabChange,
  hoveredMarkdownIndex,
  onHoverMarkdownIndex,
  historyRevisionId,
  whiteboardSceneJson,
  whiteboardBundleJson,
  onSaveWhiteboardSceneJson,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const markdownMountRef = useRef<HTMLDivElement>(null);
  const docsMountRef = useRef<HTMLDivElement>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'whiteboard'>('preview');
  const pendingPreviewZoomRef = useRef<number | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const { refreshOffsets, resolveBlockIndex, getOffset } = useMarkdownMermaidOffsets();

  const [isMarkdownMode, setIsMarkdownMode] = useState<boolean>(false);
  const isBuildDocsMode = activeEditorTab === 'build_docs';
  const {
    isMarkdownMermaidMode,
    activeBlock: activeMarkdownBlock,
    activeDiagnostics: activeMarkdownDiagnostics,
    isMarkdownMermaidInvalid,
  } = useMarkdownMermaidBlockState({
    blocks: markdownMermaidBlocks,
    diagnostics: markdownMermaidDiagnostics,
    activeIndex: markdownMermaidActiveIndex,
    activeTab: activeEditorTab,
  });

  const codeForRender = isMarkdownMermaidMode ? activeMarkdownBlock?.code ?? '' : mermaidState.code;
  const activeDiagramType = useMemo(() => {
    if (isMarkdownMermaidMode) {
      return activeMarkdownBlock?.diagramType ?? (codeForRender ? detectMermaidDiagramType(codeForRender) : null);
    }
    return codeForRender ? detectMermaidDiagramType(codeForRender) : null;
  }, [activeMarkdownBlock?.diagramType, codeForRender, isMarkdownMermaidMode]);
  const supportsInlineTheme = Boolean(activeDiagramType);
  const supportsInlineDirection = Boolean(
    activeDiagramType && DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION[activeDiagramType]
  );
  const supportsInlineLook = Boolean(activeDiagramType && DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK[activeDiagramType]);
  const directionOptions = useMemo<MermaidDirection[]>(
    () => getInlineDirectionOptions(activeDiagramType),
    [activeDiagramType]
  );
  const flowchartBlocksCount = useMemo(() => {
    if (!isMarkdownMode) return 0;
    return markdownMermaidBlocks.filter((b) => b.diagramType === 'flowchart').length;
  }, [isMarkdownMode, markdownMermaidBlocks]);


  const selectedFlowchartEdgeStyle = useMemo<FlowchartEdgeStyle | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartEdgeStyle(codeForRender);
    if (!isMarkdownMode) return extractFlowchartEdgeStyle(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((b) => b.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const extracted = flowchartBlocks
      .map((block) => extractFlowchartEdgeStyle(block.code))
      .filter(Boolean) as FlowchartEdgeStyle[];
    if (!extracted.length) return null;

    const pick = <K extends keyof FlowchartEdgeStyle>(key: K): FlowchartEdgeStyle[K] => {
      const values = new Set(extracted.map((value) => value[key]).filter((value) => value !== null));
      if (!values.size) return null;
      if (values.size === 1) return Array.from(values)[0] as FlowchartEdgeStyle[K];
      return null;
    };

    return {
      lineStyle: pick('lineStyle'),
      endCap: pick('endCap'),
      direction: pick('direction'),
      length: pick('length'),
    };
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);
  const selectedFlowchartLinkStylePreset = useMemo<FlowchartLinkStylePresetId | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartLinkStylePreset(codeForRender);
    if (!isMarkdownMode) return extractFlowchartLinkStylePreset(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((b) => b.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const presets = new Set(
      flowchartBlocks
        .map((block) => extractFlowchartLinkStylePreset(block.code))
        .filter((value): value is FlowchartLinkStylePresetId => Boolean(value))
    );
    return presets.size === 1 ? (Array.from(presets)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const selectedFlowchartCurve = useMemo<FlowchartCurve | null>(() => {
    if (isMarkdownMermaidMode) return extractFlowchartCurve(codeForRender);
    if (!isMarkdownMode) return extractFlowchartCurve(codeForRender);

    const flowchartBlocks = markdownMermaidBlocks.filter((b) => b.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return null;
    const curves = new Set(
      flowchartBlocks
        .map((block) => extractFlowchartCurve(block.code))
        .filter((value): value is FlowchartCurve => Boolean(value))
    );
    return curves.size === 1 ? (Array.from(curves)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);

  const isFlowchartCurveMixed = useMemo(() => {
    if (isMarkdownMermaidMode) return false;
    if (!isMarkdownMode) return false;
    const flowchartBlocks = markdownMermaidBlocks.filter((b) => b.diagramType === 'flowchart');
    if (!flowchartBlocks.length) return false;
    const curves = new Set(flowchartBlocks.map((block) => extractFlowchartCurve(block.code) ?? null));
    return curves.size > 1;
  }, [isMarkdownMermaidMode, isMarkdownMode, markdownMermaidBlocks]);
  const hasNotebookTabs = (isMarkdownMode || isMarkdownMermaidMode) && markdownMermaidBlocks.length > 0;
  const canSyncScroll = isScrollSyncEnabled && isMarkdownMode;
  const handleHoverSync = useCallback((index: number) => {
    if (!canSyncScroll) return;
    const container = markdownMountRef.current;
    if (!container) return;
    onScrollSync({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      blockIndex: index,
    });
  }, [canSyncScroll, onScrollSync]);
  const setMarkdownIndexFromPreview = useCallback(
    (index: number) => {
      onMarkdownMermaidActiveIndexChange(index);
      onActiveEditorTabChange('markdown_mermaid');
    },
    [onActiveEditorTabChange, onMarkdownMermaidActiveIndexChange]
  );
  const { handleScrollSync: handleMarkdownScroll } = useScrollSync({
    enabled: canSyncScroll,
    source: 'preview',
    scrollRef: markdownMountRef,
    scrollSyncPayload,
    onScrollSync,
    resolveBlockIndex,
    getBlockOffset: (index) => getOffset(index),
  });
  const { markdownHtml, renderMarkdown, markdownRenderer } = useMarkdownPreview(
    codeForRender,
    isMarkdownMode,
    isMarkdownMermaidMode,
    isBuildDocsMode
  );
  const enrichMermaidError = useCallback((code: string, message: string) => {
    const diagramType = detectMermaidDiagramType(code) ?? 'auto';
    return augmentMermaidErrorForAutoFix(diagramType, message);
  }, []);
  const createMarkdownErrorBlock = useCallback((message: string, index?: number) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-callout markdown-callout-error markdown-mermaid-preview markdown-mermaid-block';
    if (typeof index === 'number') {
      wrapper.dataset.mermaidIndex = String(index);
    }
    const title = document.createElement('div');
    title.className = 'markdown-callout-title';
    title.textContent = 'Mermaid Error';
    const body = document.createElement('div');
    body.className = 'markdown-callout-body whitespace-pre-wrap break-words';
    body.textContent = message;
    wrapper.appendChild(title);
    wrapper.appendChild(body);
    return wrapper;
  }, []);
  const refreshPreviewOffsets = useCallback(() => {
    const container = markdownMountRef.current;
    if (!container) return;
    refreshOffsets(container);
  }, [refreshOffsets]);

  const { svgMarkup, renderError } = useMermaidSvgRender({
    code: codeForRender,
    enabled: !isBuildDocsMode && !isMarkdownMode,
    isMarkdownMermaidInvalid,
    isMarkdownMermaidMode,
    isMermaidValid: mermaidState.isValid,
    enrichError: enrichMermaidError,
    bindFunctionsRef,
  });

  const {
    svgRef,
    zoomPercent,
    setZoomPercent,
    zoomIn,
    zoomOut,
    fitToViewport,
    syncZoomPercent,
  } = useSvgPanZoom({
    svgMarkup,
    svgMountRef,
    enabled: !isBuildDocsMode && !isMarkdownMode && previewMode === 'preview',
    bindFunctionsRef,
  });

  const { exportError, exportPng, exportSvg, isExporting } = useDiagramExport({
    svgRef,
    code: codeForRender,
    theme,
    appThemePresetId,
  });

  const resolveSystemPromptForPath = (path: string) => {
    const mode = getSystemPromptModeFromPath(path);
    if (!mode) return '';
    const useRaw = systemPromptRawByMode[mode] ?? false;
    const prompt = useRaw ? buildDocsSystemPrompts[mode]?.raw : buildDocsSystemPrompts[mode]?.redacted;
    return prompt || buildDocsSystemPrompts[mode]?.raw || 'No system prompt available.';
  };
  const activeBuildDoc = (() => {
    if (buildDocsActivePath === PROMPTS_VIRTUAL_SYSTEM_PATH) {
      const useRaw = systemPromptRawByMode[docsMode] ?? false;
      const preview = useRaw ? buildDocsRequestPreviewRawText : buildDocsRequestPreviewText;
      const fallback = useRaw ? buildDocsRequestPreviewText : buildDocsRequestPreviewRawText;
      const text = preview?.trim() ? preview : (fallback?.trim() ? fallback : 'No preview available yet.');
      return { path: buildDocsActivePath, text };
    }

    if (buildDocsActivePath === PROMPTS_VIRTUAL_INTENT_PATH) {
      const text = buildDocsIntentPreviewText?.trim() ? buildDocsIntentPreviewText : 'Intent is not available yet.';
      return { path: buildDocsActivePath, text };
    }

    if (buildDocsActivePath === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH) {
      const text = buildDocsNotebookPlanText?.trim() ? buildDocsNotebookPlanText : 'Notebook plan is not available yet.';
      return { path: buildDocsActivePath, text };
    }

    if (isSystemPromptPath(buildDocsActivePath)) {
      return { path: buildDocsActivePath, text: resolveSystemPromptForPath(buildDocsActivePath) };
    }

    return buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  })();
  const buildDocsHtml = useMemo(() => {
    if (!isBuildDocsMode) return '';
    const content = activeBuildDoc?.text ?? '';
    return content.trim() ? markdownRenderer.render(content) : '';
  }, [activeBuildDoc?.text, isBuildDocsMode, markdownRenderer]);


  const selectedThemePreset = useMemo<MermaidThemePresetId | null>(() => {
    if (!isMarkdownMode) {
      const vars = extractFrontmatterThemeVariables(codeForRender);
      return extractMermaidThemePreset(codeForRender, { themeVariables: vars });
    }
    if (!markdownMermaidBlocks.length) return null;
    const values = new Set(
      markdownMermaidBlocks.map((block) => {
        const vars = extractFrontmatterThemeVariables(block.code);
        return extractMermaidThemePreset(block.code, { themeVariables: vars });
      })
    );
    return values.size === 1 ? (Array.from(values)[0] ?? null) : null;
  }, [codeForRender, isMarkdownMode, markdownMermaidBlocks]);

  const isThemePresetMixed = useMemo(() => {
    if (!isMarkdownMode) return false;
    if (!markdownMermaidBlocks.length) return false;
    const values = new Set(
      markdownMermaidBlocks.map((block) => {
        const vars = extractFrontmatterThemeVariables(block.code);
        return extractMermaidThemePreset(block.code, { themeVariables: vars });
      })
    );
    return values.size > 1;
  }, [isMarkdownMode, markdownMermaidBlocks]);

  const selectedInlineDirection = useMemo(() => {
    return extractInlineDirectionCommand(codeForRender).direction ?? '';
  }, [codeForRender]);

  const selectedInlineLook = useMemo(() => {
    if (!isMarkdownMode) {
      return extractInlineLookCommand(codeForRender).look ?? '';
    }
    if (!markdownMermaidBlocks.length) return '';
    const looks = markdownMermaidBlocks.map((block) => extractInlineLookCommand(block.code).look ?? '');
    const first = looks[0] ?? '';
    return looks.every((value) => value === first) ? first : '';
  }, [codeForRender, isMarkdownMode, markdownMermaidBlocks]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (isMarkdownMermaidMode) {
      if (isMarkdownMode) setIsMarkdownMode(false);
      return;
    }
    const isMarkdown = isMarkdownLike(codeForRender);
    setIsMarkdownMode(isMarkdown);
  }, [codeForRender, isBuildDocsMode, isMarkdownMermaidMode, isMarkdownMode]);

  useEffect(() => {
    if (isMarkdownMode) return;
    if (hoveredMarkdownIndex !== null) {
      onHoverMarkdownIndex(null);
    }
  }, [hoveredMarkdownIndex, isMarkdownMode, onHoverMarkdownIndex]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (previewMode !== 'preview') return;
    if (!svgMarkup) return;
    const rafId = requestAnimationFrame(() => {
      fitToViewport();
    });
    return () => cancelAnimationFrame(rafId);
  }, [fitToViewport, isFullScreen, isBuildDocsMode, previewMode, svgMarkup]);

  useEffect(() => {
    if (previewMode !== 'preview') return;
    const target = pendingPreviewZoomRef.current;
    if (target === null) return;
    syncZoomPercent(target);
    pendingPreviewZoomRef.current = null;
  }, [previewMode, svgMarkup, syncZoomPercent]);

  const previewBackgroundColor = useMemo(() => {
    if (isBuildDocsMode) return null;

    // Prefer the user-selected preset/background from code (frontmatter), because Mermaid SVG background is often transparent.
    if (!isMarkdownMode) {
      const vars = extractFrontmatterThemeVariables(codeForRender);
      const fromCode = typeof vars?.background === 'string' ? vars.background.trim() : '';
      if (fromCode) return fromCode;
      return getMermaidThemePresetPanelBackground(selectedThemePreset, appThemePresetId);
    } else if (!isThemePresetMixed && selectedThemePreset) {
      return getMermaidThemePresetPanelBackground(selectedThemePreset, appThemePresetId);
    }

    const fromSvg = extractMermaidSvgBackgroundColor(svgMarkup);
    if (fromSvg) return fromSvg;

    return getMermaidThemePresetPanelBackground(null, appThemePresetId);
  }, [appThemePresetId, codeForRender, isBuildDocsMode, isMarkdownMode, isThemePresetMixed, selectedThemePreset, svgMarkup]);

  const requestPreviewZoomSync = useCallback((nextZoomPercent: number) => {
    pendingPreviewZoomRef.current = nextZoomPercent;
  }, []);

  const {
    isNotebookExcalidrawMode,
    setIsNotebookExcalidrawMode,
    notebookExcalidrawScene,
    excalidrawTheme,
    notebookExcalidrawTheme,
    diagramCanvasBackgroundByTheme,
    notebookCanvasBackgroundByTheme,
    whiteboardResetKey,
    isWhiteboardDirty,
    setIsWhiteboardDirty,
    isWhiteboardAutoSync,
    setIsWhiteboardAutoSync,
    whiteboardInitialSceneOverride,
    whiteboardZoomPercent,
    setWhiteboardZoomPercent,
    pinnedMode,
    pinnedCanEd,
    pinnedDirty,
    pinnedEdDisabledReason,
    handleToggleWhiteboard,
    handleToggleNotebookExcalidraw,
    handlePinnedSetMode,
    handleSetExcalidrawTheme,
    handleSetNotebookExcalidrawTheme,
    handleSetDiagramCanvasBackgroundByTheme,
    handleSetNotebookCanvasBackgroundByTheme,
    handleWhiteboardSyncFromCode,
  } = usePreviewWhiteboard({
    theme,
    appThemePresetId,
    previewZoomPercent: zoomPercent,
    onPreviewZoomPercentChange: setZoomPercent,
    onRequestPreviewZoomSync: requestPreviewZoomSync,
    previewMode,
    onPreviewModeChange: setPreviewMode,
    isBuildDocsMode,
    isMarkdownMode,
    activeDiagramType,
    markdownMermaidBlocks,
    mermaidCode: mermaidState.code,
    codeForRender,
    svgMarkup,
    historyRevisionId,
    whiteboardSceneJson,
    whiteboardBundleJson,
    previewBackgroundColor,
    selectedThemePreset,
    isThemePresetMixed,
    onSaveWhiteboardSceneJson,
  });

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (previewMode !== 'preview') return;
    if (isNotebookExcalidrawMode) return;

    // Whiteboard conversion can re-initialize Mermaid with a different theme/look.
    // When returning to preview (esp. markdown/notebook), re-apply the app-level
    // Mermaid preset so SVG rendering colors are consistent without reload.
    const mermaidPreset = MERMAID_THEME_PRESETS.find((p) => p.id === appThemePresetId);
    if (mermaidPreset?.themeVariables) {
      initializeMermaid({ theme: 'base', themeVariables: mermaidPreset.themeVariables as Record<string, unknown> });
      return;
    }
    if (mermaidPreset) {
      initializeMermaid(mermaidPreset.theme);
      return;
    }
    initializeMermaid('default');
  }, [appThemePresetId, isBuildDocsMode, isNotebookExcalidrawMode, previewMode]);

  useMermaidCodeBlockRenderer({
    mountRef: markdownMountRef,
    html: markdownHtml,
    enabled: !isBuildDocsMode && previewMode === 'preview' && isMarkdownMode && !isNotebookExcalidrawMode,
    idPrefix: 'md-mermaid',
    mode: 'interactive',
    renderMarkdown,
    onBlockClick: setMarkdownIndexFromPreview,
    onBlockHover: onHoverMarkdownIndex,
    onBlockHoverSync: handleHoverSync,
    createErrorBlock: createMarkdownErrorBlock,
    enrichError: enrichMermaidError,
    onAfterRender: refreshPreviewOffsets,
  });

  useMermaidCodeBlockRenderer({
    mountRef: docsMountRef,
    html: buildDocsHtml,
    enabled: isBuildDocsMode,
    idPrefix: 'build-docs',
    mode: 'static',
  });

  const previewContainerStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!previewBackgroundColor) return undefined;
    if (previewMode === 'whiteboard') return undefined;
    if (isMarkdownMode && isNotebookExcalidrawMode) return undefined;
    return { backgroundColor: previewBackgroundColor };
  }, [isMarkdownMode, isNotebookExcalidrawMode, previewBackgroundColor, previewMode]);

  const previewHeaderTitle = useMemo(() => {
    if (!isBuildDocsMode) return 'Preview';
    const path = activeBuildDoc?.path || buildDocsActivePath || '';
    const fileLabel = getPromptsVirtualLabel(path) ?? (path.split('/').pop() || path || 'Docs');
    return `Prompts: ${fileLabel}`;
  }, [activeBuildDoc?.path, buildDocsActivePath, isBuildDocsMode]);

  return (
    <div className="h-full flex flex-col bg-transparent" style={previewContainerStyle}>
      <PreviewHeaderControls
        title={previewHeaderTitle}
        isBuildDocsMode={isBuildDocsMode}
        isMarkdownMode={isMarkdownMode}
        showNotebookExcalidrawToggle={false}
        isNotebookExcalidrawMode={isNotebookExcalidrawMode}
        onToggleNotebookExcalidraw={handleToggleNotebookExcalidraw}
        showWhiteboardToggle={false}
        isWhiteboardMode={previewMode === 'whiteboard'}
        isWhiteboardDirty={isWhiteboardDirty}
        isWhiteboardAutoSync={isWhiteboardAutoSync}
        onToggleWhiteboard={handleToggleWhiteboard}
        onWhiteboardSyncFromCode={handleWhiteboardSyncFromCode}
        onToggleWhiteboardAutoSync={() => setIsWhiteboardAutoSync((value) => !value)}
        showExcalidrawThemeControl={false}
        excalidrawTheme={excalidrawTheme}
        onSetExcalidrawTheme={handleSetExcalidrawTheme}
        pinnedMode={pinnedMode}
        pinnedCanEd={pinnedCanEd}
        pinnedDirty={pinnedDirty}
        pinnedEdDisabledReason={pinnedEdDisabledReason}
        onSetPinnedMode={handlePinnedSetMode}
        showThemeControl={supportsInlineTheme || (isMarkdownMode && markdownMermaidBlocks.length > 0)}
        showArrowControl={(activeDiagramType === 'flowchart' && !isMarkdownMode) || (isMarkdownMode && flowchartBlocksCount > 0)}
        showDirectionControl={!isMarkdownMode && supportsInlineDirection}
        showLookControl={supportsInlineLook || (isMarkdownMode && markdownMermaidBlocks.length > 0)}
        directionOptions={directionOptions}
        selectedThemePreset={selectedThemePreset}
        isThemePresetMixed={isThemePresetMixed}
        selectedInlineDirection={selectedInlineDirection}
        selectedInlineLook={selectedInlineLook}
        onSetThemePreset={onSetThemePreset}
        flowchartEdgeStyle={selectedFlowchartEdgeStyle}
        onSetFlowchartEdgeStyle={onSetFlowchartEdgeStyle}
        flowchartLinkStylePreset={selectedFlowchartLinkStylePreset}
        onSetFlowchartLinkStylePreset={onSetFlowchartLinkStylePreset}
        flowchartCurve={selectedFlowchartCurve}
        isFlowchartCurveMixed={isFlowchartCurveMixed}
        onSetFlowchartCurve={onSetFlowchartCurve}
        onSetInlineDirection={onSetInlineDirection}
        onSetInlineLook={onSetInlineLook}
        codeForRender={codeForRender}
        isFullScreen={isFullScreen}
        onToggleFullScreen={onToggleFullScreen}
        showScrollSyncToggle={isMarkdownMode}
        isScrollSyncEnabled={isScrollSyncEnabled}
        onToggleScrollSync={onToggleScrollSync}
        svgMarkup={svgMarkup}
        isExporting={isExporting}
        onExportSvg={exportSvg}
        onExportPng={exportPng}
        zoomPercent={previewMode === 'whiteboard' ? whiteboardZoomPercent : zoomPercent}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitToViewport={fitToViewport}
      />

      <div className="relative flex-1 min-h-0 flex">
        {previewMode === 'whiteboard' ? (
          <DiagramWhiteboard
            key={`${historyRevisionId ?? 'no-rev'}:${hasNotebookTabs ? markdownMermaidActiveIndex : 'single'}`}
            theme={excalidrawTheme}
            backgroundColor={previewBackgroundColor}
            backgroundMode="excalidraw"
            initialCanvasBackgroundByTheme={diagramCanvasBackgroundByTheme}
            onCanvasBackgroundByThemeChange={handleSetDiagramCanvasBackgroundByTheme}
            syncKey={whiteboardResetKey}
            mermaidCode={codeForRender}
            svgMarkup={svgMarkup}
            initialSceneJson={whiteboardInitialSceneOverride !== undefined ? whiteboardInitialSceneOverride : whiteboardSceneJson}
            zoomPercent={whiteboardZoomPercent}
            onZoomPercentChange={setWhiteboardZoomPercent}
            onAutosave={(sceneJson) => onSaveWhiteboardSceneJson(sceneJson)}
            onDirtyChange={setIsWhiteboardDirty}
            onThemeChange={handleSetExcalidrawTheme}
          />
        ) : isMarkdownMode && isNotebookExcalidrawMode ? (
          <DiagramWhiteboard
            key={`notebook-ed:tiles`}
            theme={notebookExcalidrawTheme}
            backgroundColor={null}
            backgroundMode="excalidraw"
            initialCanvasBackgroundByTheme={notebookCanvasBackgroundByTheme}
            onCanvasBackgroundByThemeChange={handleSetNotebookCanvasBackgroundByTheme}
            mermaidCode=""
            svgMarkup=""
            initialSceneJson={null}
            initialDataOverride={notebookExcalidrawScene}
            zoomPercent={100}
            onAutosave={() => {}}
            mode="view"
            zoomMode="auto"
            fitMode="width"
            scrollMode="vertical"
            onThemeChange={handleSetNotebookExcalidrawTheme}
            onNotebookDiagramClick={(index) => {
              setIsNotebookExcalidrawMode(false);
              setMarkdownIndexFromPreview(index);
            }}
          />
        ) : (
          <PreviewBody
            viewportRef={viewportRef}
            svgMountRef={svgMountRef}
            markdownMountRef={markdownMountRef}
            docsMountRef={docsMountRef}
            isBuildDocsMode={isBuildDocsMode}
            isMarkdownMode={isMarkdownMode}
            isMarkdownMermaidMode={isMarkdownMermaidMode}
            isMarkdownMermaidInvalid={isMarkdownMermaidInvalid}
            renderError={renderError}
            mermaidState={mermaidState}
            activeMarkdownErrorMessage={activeMarkdownDiagnostics?.errorMessage ?? null}
            codeForRender={codeForRender}
            svgMarkup={svgMarkup}
            exportError={exportError}
            hasBuildDocs={Boolean(activeBuildDoc?.text)}
            onMarkdownScroll={handleMarkdownScroll}
            onToggleFullScreen={onToggleFullScreen}
            zoomPercent={previewMode === 'whiteboard' ? whiteboardZoomPercent : zoomPercent}
            showZoomControls={!isMarkdownMode && previewMode === 'preview' && Boolean(svgMarkup)}
            onZoomOut={zoomOut}
            onZoomIn={zoomIn}
            onFitToViewport={fitToViewport}
          />
        )}
      </div>
    </div>
  );
};

export default PreviewColumn;
