import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BuildDocsSystemPrompts, DocsMode, EditorTab, MermaidState, SystemPromptRawByMode } from '../types';
import { useDiagramExport } from '../hooks/studio/useDiagramExport';
import type { MermaidDirection } from '../utils/inlineDirectionCommand';
import type { MermaidLook } from '../utils/inlineLookCommand';
import type { FlowchartEdgeStyleUpdate } from '../utils/flowchartArrowStyle';
import type { FlowchartLinkStylePresetId } from '../utils/flowchartLinkStyle';
import type { FlowchartCurve } from '../utils/flowchartCurveConfig';
import { extractFrontmatterThemeVariables } from '../utils/mermaidFrontmatterThemeVariables';
import {
  getMermaidThemePresetPanelBackground,
  MERMAID_THEME_PRESETS,
} from '../utils/mermaidThemePreset';
import type { MermaidThemePresetId } from '../utils/mermaidThemePreset';
import { extractMermaidSvgBackgroundColor } from '../utils/mermaidSvgBackground';
import { detectMermaidDiagramType, isMarkdownLike } from '../services/mermaidService';
import type { MermaidMarkdownBlock } from '../services/mermaidService';
import { initializeMermaid } from '../services/mermaidService';
import type { ScrollSyncMeasure, ScrollSyncPayload } from '../hooks/studio/useScrollSync';
import { useMarkdownMermaidBlockState } from '../hooks/markdown/useMarkdownMermaidBlockState';
import { useMarkdownPreview } from '../hooks/preview/useMarkdownPreview';
import { usePreviewScrollSync } from '../hooks/preview/usePreviewScrollSync';
import { useMarkdownPreviewMeta } from '../hooks/preview/useMarkdownPreviewMeta';
import { useMermaidSvgRender } from '../hooks/preview/useMermaidSvgRender';
import { useSvgPanZoom } from '../hooks/preview/useSvgPanZoom';
import { useMermaidCodeBlockRenderer } from '../hooks/preview/useMermaidCodeBlockRenderer';
import { usePreviewWhiteboard } from '../hooks/preview/usePreviewWhiteboard';
import { useBuildDocsPreview } from '../hooks/preview/useBuildDocsPreview';
import { augmentMermaidErrorForAutoFix } from '../utils/mermaidAutoFixHints';
import PreviewHeaderControls from './preview/PreviewHeaderControls';
import PreviewSurface from './preview/PreviewSurface';
import { usePreviewContentMode } from '../hooks/preview/usePreviewContentMode';
import { usePreviewHeaderModel } from '../hooks/preview/usePreviewHeaderModel';
import './markdown-preview.css';

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
  buildDocsSystemPrompts: BuildDocsSystemPrompts;
  systemPromptRawByMode: SystemPromptRawByMode;
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
  const isMarkdownMode = useMemo(() => {
    if (isBuildDocsMode) return false;
    if (isMarkdownMermaidMode) return false;
    return isMarkdownLike(codeForRender);
  }, [codeForRender, isBuildDocsMode, isMarkdownMermaidMode]);
  const {
    activeDiagramType,
    supportsInlineTheme,
    supportsInlineDirection,
    supportsInlineLook,
    directionOptions,
    flowchartBlocksCount,
    selectedFlowchartEdgeStyle,
    selectedFlowchartLinkStylePreset,
    selectedFlowchartCurve,
    isFlowchartCurveMixed,
    selectedThemePreset,
    isThemePresetMixed,
    selectedInlineDirection,
    selectedInlineLook,
  } = useMarkdownPreviewMeta({
    codeForRender,
    isMarkdownMode,
    isMarkdownMermaidMode,
    markdownMermaidBlocks,
    activeMarkdownBlock: activeMarkdownBlock ?? null,
  });

  const hasNotebookTabs = (isMarkdownMode || isMarkdownMermaidMode) && markdownMermaidBlocks.length > 0;
  const setMarkdownIndexFromPreview = useCallback(
    (index: number) => {
      onMarkdownMermaidActiveIndexChange(index);
      onActiveEditorTabChange('markdown_mermaid');
    },
    [onActiveEditorTabChange, onMarkdownMermaidActiveIndexChange]
  );
  const { handleHoverSync, handleMarkdownScroll, refreshPreviewOffsets } = usePreviewScrollSync({
    isScrollSyncEnabled,
    isMarkdownMode,
    markdownMountRef,
    scrollSyncPayload,
    onScrollSync,
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

  const { activeBuildDoc, buildDocsHtml } = useBuildDocsPreview({
    isBuildDocsMode,
    buildDocsActivePath,
    buildDocsEntries,
    buildDocsSystemPrompts,
    systemPromptRawByMode,
    docsMode,
    buildDocsRequestPreviewText,
    buildDocsRequestPreviewRawText,
    buildDocsIntentPreviewText,
    buildDocsNotebookPlanText,
    markdownRenderer,
  });


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
    preferredDiagramExcalidrawTheme,
    preferredNotebookExcalidrawTheme,
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

  const contentModeModel = usePreviewContentMode({
    isBuildDocsMode,
    previewMode,
    isNotebookExcalidrawMode,
    isMarkdownMode,
    svgMarkup,
    codeForRender,
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

  const isEdMode = previewMode === 'whiteboard' || isNotebookExcalidrawMode;
  const activeEdTheme = isNotebookExcalidrawMode ? notebookExcalidrawTheme : excalidrawTheme;
  const handleSetActiveEdTheme = isNotebookExcalidrawMode
    ? handleSetNotebookExcalidrawTheme
    : handleSetExcalidrawTheme;
  const diagramBackgroundMode = excalidrawTheme === preferredDiagramExcalidrawTheme ? 'mermaid' : 'excalidraw';
  const notebookBackgroundMode =
    notebookExcalidrawTheme === preferredNotebookExcalidrawTheme ? 'mermaid' : 'excalidraw';

  const previewHeaderModel = usePreviewHeaderModel({
    pinned: {
      pinnedMode,
      pinnedCanEd,
      pinnedDirty,
      pinnedEdDisabledReason,
      onSetPinnedMode: handlePinnedSetMode,
    },
    tools: {
      isBuildDocsMode,
      isMarkdownMode,
      svgMarkup,
      isExporting,
      onExportSvg: exportSvg,
      onExportPng: exportPng,
      canNotebookExcalidrawToggle: false,
      isNotebookExcalidrawMode,
      onToggleNotebookExcalidraw: handleToggleNotebookExcalidraw,
      showWhiteboardToggle: false,
      isWhiteboardMode: previewMode === 'whiteboard',
      isWhiteboardDirty,
      isWhiteboardAutoSync,
      onToggleWhiteboard: handleToggleWhiteboard,
      onWhiteboardSyncFromCode: handleWhiteboardSyncFromCode,
      onToggleWhiteboardAutoSync: () => setIsWhiteboardAutoSync((value) => !value),
      showExcalidrawThemeControl: isEdMode,
      excalidrawTheme: activeEdTheme,
      onSetExcalidrawTheme: handleSetActiveEdTheme,
      isFullScreen,
      onToggleFullScreen,
    },
    style: {
      isBuildDocsMode,
      isMarkdownMode,
      showThemeControl: supportsInlineTheme || (isMarkdownMode && markdownMermaidBlocks.length > 0),
      showArrowControl:
        (activeDiagramType === 'flowchart' && !isMarkdownMode) || (isMarkdownMode && flowchartBlocksCount > 0),
      showDirectionControl: !isMarkdownMode && supportsInlineDirection,
      showLookControl: supportsInlineLook || (isMarkdownMode && markdownMermaidBlocks.length > 0),
      directionOptions,
      selectedThemePreset,
      isThemePresetMixed,
      selectedInlineDirection,
      selectedInlineLook,
      flowchartEdgeStyle: selectedFlowchartEdgeStyle,
      flowchartLinkStylePreset: selectedFlowchartLinkStylePreset,
      flowchartCurve: selectedFlowchartCurve,
      isFlowchartCurveMixed,
      onSetThemePreset,
      onSetInlineDirection,
      onSetInlineLook,
      onSetFlowchartEdgeStyle,
      onSetFlowchartLinkStylePreset,
      onSetFlowchartCurve,
      codeForRender,
    },
    scrollSync: {
      isBuildDocsMode,
      showScrollSyncToggle: contentModeModel.canScrollSync,
      isScrollSyncEnabled,
      onToggleScrollSync,
    },
  });

  return (
    <div className="h-full flex flex-col bg-transparent" style={previewContainerStyle}>
      <PreviewHeaderControls model={previewHeaderModel} />

      <div className="relative flex-1 min-h-0 flex">
        <PreviewSurface
          mode={contentModeModel.mode}
          svgProps={{
            viewportRef,
            svgMountRef,
            svgMarkup,
            exportError,
            renderError,
            mermaidState,
            isMarkdownMermaidInvalid,
            isMarkdownMermaidMode,
            activeMarkdownErrorMessage: activeMarkdownDiagnostics?.errorMessage ?? null,
            codeForRender,
            onToggleFullScreen,
            showZoomControls: contentModeModel.showZoomControls,
            zoomPercent,
            onZoomOut: zoomOut,
            onZoomIn: zoomIn,
            onFitToViewport: fitToViewport,
          }}
          markdownProps={{
            viewportRef,
            markdownMountRef,
            onMarkdownScroll: handleMarkdownScroll,
          }}
          buildDocsProps={{
            viewportRef,
            docsMountRef,
            hasBuildDocs: Boolean(activeBuildDoc?.text),
          }}
          whiteboardProps={{
            surfaceKey: `${historyRevisionId ?? 'no-rev'}:${hasNotebookTabs ? markdownMermaidActiveIndex : 'single'}`,
            theme: excalidrawTheme,
            backgroundColor: previewBackgroundColor,
            backgroundMode: diagramBackgroundMode,
            initialCanvasBackgroundByTheme: diagramCanvasBackgroundByTheme,
            onCanvasBackgroundByThemeChange: handleSetDiagramCanvasBackgroundByTheme,
            syncKey: whiteboardResetKey,
            mermaidCode: codeForRender,
            svgMarkup,
            initialSceneJson: whiteboardInitialSceneOverride !== undefined ? whiteboardInitialSceneOverride : whiteboardSceneJson,
            zoomPercent: whiteboardZoomPercent,
            onZoomPercentChange: setWhiteboardZoomPercent,
            onAutosave: (sceneJson) => onSaveWhiteboardSceneJson(sceneJson),
            onDirtyChange: setIsWhiteboardDirty,
            onThemeChange: handleSetExcalidrawTheme,
          }}
          notebookTilesProps={{
            surfaceKey: 'notebook-ed:tiles',
            theme: notebookExcalidrawTheme,
            backgroundColor: notebookBackgroundMode === 'mermaid' ? previewBackgroundColor : null,
            backgroundMode: notebookBackgroundMode,
            initialCanvasBackgroundByTheme: notebookCanvasBackgroundByTheme,
            onCanvasBackgroundByThemeChange: handleSetNotebookCanvasBackgroundByTheme,
            mermaidCode: '',
            svgMarkup: '',
            initialSceneJson: null,
            initialDataOverride: notebookExcalidrawScene,
            zoomPercent: 100,
            onAutosave: () => {},
            mode: 'view',
            zoomMode: 'auto',
            fitMode: 'width',
            scrollMode: 'vertical',
            onThemeChange: handleSetNotebookExcalidrawTheme,
            onNotebookDiagramClick: (index) => {
              setIsNotebookExcalidrawMode(false);
              setMarkdownIndexFromPreview(index);
            },
          }}
          emptyProps={{
            viewportRef,
          }}
        />
      </div>
    </div>
  );
};

export default PreviewColumn;
