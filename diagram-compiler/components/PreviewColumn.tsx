import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import { EditorTab, MermaidState } from '../types';
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
import { extractMermaidThemePreset, getMermaidThemePresetPanelBackground, MermaidThemePresetId } from '../utils/mermaidThemePreset';
import { extractMermaidSvgBackgroundColor } from '../utils/mermaidSvgBackground';
import {
  applyInlineMermaidDirectives,
  detectMermaidDiagramType,
  isMarkdownLike,
  MermaidMarkdownBlock,
  validateMermaidDiagramCode,
} from '../services/mermaidService';
import { ScrollSyncMeasure, ScrollSyncPayload, useScrollSync } from '../hooks/studio/useScrollSync';
import { useMarkdownMermaidBlockState } from '../hooks/markdown/useMarkdownMermaidBlockState';
import { useMarkdownPreview } from '../hooks/preview/useMarkdownPreview';
import { useMarkdownMermaidOffsets } from '../hooks/preview/useMarkdownMermaidOffsets';
import { MERMAID_CODE_BLOCK_SELECTOR } from '../utils/markdownMermaid';
import {
  DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION,
  DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK,
  getInlineDirectionOptions,
} from '../utils/diagramTypeMeta';
import { getSystemPromptModeFromPath, isSystemPromptPath } from '../utils/systemPrompts';
import PreviewHeaderControls from './preview/PreviewHeaderControls';
import PreviewBody from './preview/PreviewBody';
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
  buildDocsSystemPrompts: Record<'chat' | 'build' | 'plan' | 'analyze' | 'fix', { raw: string; redacted: string }>;
  systemPromptRawByMode: Record<'chat' | 'build' | 'analyze' | 'fix', boolean>;
  buildDocsEntries: Array<{ path: string; text: string }>;
  buildDocsActivePath: string;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveEditorTabChange: (tab: EditorTab) => void;
  hoveredMarkdownIndex: number | null;
  onHoverMarkdownIndex: (index: number | null) => void;
}

type ViewBox = { x: number; y: number; width: number; height: number };

const FIT_PADDING_RATIO = 0.05;

const parseViewBoxAttr = (value: string | null): ViewBox | null => {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((p) => Number(p));
  if (parts.length !== 4) return null;
  const [x, y, width, height] = parts;
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (!(width > 0 && height > 0)) return null;
  return { x, y, width, height };
};

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
  buildDocsSystemPrompts,
  systemPromptRawByMode,
  buildDocsEntries,
  buildDocsActivePath,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveEditorTabChange,
  hoveredMarkdownIndex,
  onHoverMarkdownIndex,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const markdownMountRef = useRef<HTMLDivElement>(null);
  const docsMountRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const panZoomRef = useRef<ReturnType<typeof svgPanZoom> | null>(null);
  const { refreshOffsets, resolveBlockIndex, getOffset } = useMarkdownMermaidOffsets();

  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
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
  const markdownNavEnabled =
    (isMarkdownMode || isMarkdownMermaidMode) && markdownMermaidBlocks.length > 1;
  const markdownNavLabel = markdownNavEnabled
    ? `${markdownMermaidActiveIndex + 1}/${markdownMermaidBlocks.length}`
    : '';
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
    body.className = 'markdown-callout-body';
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
  const activeBuildDoc =
    isSystemPromptPath(buildDocsActivePath)
      ? { path: buildDocsActivePath, text: resolveSystemPromptForPath(buildDocsActivePath) }
      : buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
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

  const updateZoomPercent = useCallback((nextZoom?: number) => {
    const instance = panZoomRef.current;
    const zoom = typeof nextZoom === 'number' ? nextZoom : instance?.getZoom();

    if (!zoom) {
      setZoomPercent(100);
      return;
    }

    setZoomPercent(Math.max(1, Math.round(zoom * 100)));
  }, []);

  const computeFitViewBoxFromBBox = useCallback((): ViewBox | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    try {
      const bbox = svg.getBBox();
      if (!(bbox.width > 0 && bbox.height > 0)) return null;
      const pad = Math.max(bbox.width, bbox.height) * FIT_PADDING_RATIO;
      return { x: bbox.x - pad, y: bbox.y - pad, width: bbox.width + pad * 2, height: bbox.height + pad * 2 };
    } catch {
      return null;
    }
  }, []);

  const fitToViewport = useCallback(() => {
    const instance = panZoomRef.current;
    if (!instance) return;
    instance.resize();
    instance.fit();
    instance.center();
    updateZoomPercent(instance.getZoom());
  }, [updateZoomPercent]);

  const zoomIn = useCallback(() => {
    const instance = panZoomRef.current;
    if (!instance) return;
    instance.zoomIn();
    updateZoomPercent();
  }, [updateZoomPercent]);

  const zoomOut = useCallback(() => {
    const instance = panZoomRef.current;
    if (!instance) return;
    instance.zoomOut();
    updateZoomPercent();
  }, [updateZoomPercent]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (isMarkdownMermaidMode) {
      if (isMarkdownMode) setIsMarkdownMode(false);
      return;
    }
    const isMarkdown = isMarkdownLike(codeForRender);
    setIsMarkdownMode(isMarkdown);
    if (!isMarkdown) return;

    setRenderError(null);
    setSvgMarkup('');
    bindFunctionsRef.current = null;
    svgRef.current = null;
    panZoomRef.current?.destroy();
    panZoomRef.current = null;
    setZoomPercent(100);
  }, [codeForRender, isBuildDocsMode, isMarkdownMermaidMode, isMarkdownMode]);

  useEffect(() => {
    if (isMarkdownMode) return;
    if (hoveredMarkdownIndex !== null) {
      onHoverMarkdownIndex(null);
    }
  }, [hoveredMarkdownIndex, isMarkdownMode, onHoverMarkdownIndex]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    const renderDiagram = async () => {
      if (isMarkdownMode) return;
      const trimmed = codeForRender.trim();
      if (!trimmed) {
        setSvgMarkup('');
        setRenderError(null);
        bindFunctionsRef.current = null;
        svgRef.current = null;
        panZoomRef.current?.destroy();
        panZoomRef.current = null;
        setZoomPercent(100);
        if (svgMountRef.current) svgMountRef.current.replaceChildren();
        return;
      }
      if ((!isMarkdownMermaidMode && !mermaidState.isValid) || isMarkdownMermaidInvalid) {
        return;
      }
      try {
        setRenderError(null);
        const id = `mermaid-${Date.now()}`;
        const validation = await validateMermaidDiagramCode(codeForRender, { logError: false });
        if (validation.isValid === false) {
          setRenderError(validation.errorMessage ?? 'Syntax Error');
          setSvgMarkup('');
          return;
        }
        const inlineCode = applyInlineMermaidDirectives(codeForRender);
        const { svg, bindFunctions } = await mermaid.render(id, inlineCode);
        bindFunctionsRef.current = bindFunctions ?? null;

        if (!svg || !svg.includes('<svg')) {
          throw new Error('Mermaid returned empty SVG');
        }

        setSvgMarkup(svg);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setRenderError(message);
        setSvgMarkup('');
        console.error('Render failed', error);
      }
    };

    const timer = setTimeout(renderDiagram, 200);
    return () => clearTimeout(timer);
  }, [
    codeForRender,
    isBuildDocsMode,
    isMarkdownMermaidInvalid,
    isMarkdownMermaidMode,
    isMarkdownMode,
    mermaidState.isValid,
    theme,
  ]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (!isMarkdownMode) return;
    const mount = markdownMountRef.current;
    if (!mount) return;
    renderMarkdown(mount);

    const mermaidBlocks = Array.from(mount.querySelectorAll(MERMAID_CODE_BLOCK_SELECTOR)) as HTMLElement[];
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      try {
        for (let i = 0; i < mermaidBlocks.length; i += 1) {
          if (isCancelled) return;
          const block = mermaidBlocks[i];
          const code = block.textContent ?? '';
          if (!code.trim()) continue;
          const id = `md-mermaid-${Date.now()}-${i}`;
          const validation = await validateMermaidDiagramCode(code, { logError: false });
          if (validation.isValid === false) {
            const pre = block.parentElement;
            if (pre && pre.parentElement) {
              const errorBlock = createMarkdownErrorBlock(validation.errorMessage || 'Syntax Error', i);
              pre.replaceWith(errorBlock);
            }
            continue;
          }
          try {
            const normalized = applyInlineMermaidDirectives(code);
            const { svg, bindFunctions } = await mermaid.render(id, normalized);
            if (isCancelled || !svg) continue;
            const wrapper = document.createElement('div');
            wrapper.className = 'markdown-mermaid-preview markdown-mermaid-block';
            wrapper.setAttribute('role', 'button');
            wrapper.setAttribute('tabindex', '0');
            wrapper.dataset.mermaidIndex = String(i);
            wrapper.innerHTML = svg;
            const pre = block.parentElement;
            if (pre && pre.parentElement) {
              pre.replaceWith(wrapper);
              wrapper.addEventListener('click', () => {
                setMarkdownIndexFromPreview(i);
              });
              wrapper.addEventListener('mouseenter', () => {
                onHoverMarkdownIndex(i);
                handleHoverSync(i);
              });
              wrapper.addEventListener('mouseleave', () => {
                onHoverMarkdownIndex(null);
              });
              try {
                bindFunctions?.(wrapper);
              } catch (e) {
                console.error('Failed to bind Mermaid interactions in markdown', e);
              }
            }
          } catch (e) {
            const pre = block.parentElement;
            if (pre && pre.parentElement) {
              const message = e instanceof Error ? e.message : 'Syntax Error';
              const errorBlock = createMarkdownErrorBlock(message, i);
              pre.replaceWith(errorBlock);
            }
          }
        }
        if (!isCancelled) {
          requestAnimationFrame(() => refreshPreviewOffsets());
        }
      } catch {
        // Swallow render errors to avoid crashing the app.
      }
    };

    void renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [
    createMarkdownErrorBlock,
    isBuildDocsMode,
    isMarkdownMode,
    markdownHtml,
    markdownMermaidDiagnostics,
    handleHoverSync,
    onHoverMarkdownIndex,
    renderMarkdown,
    setMarkdownIndexFromPreview,
    refreshPreviewOffsets,
    theme,
  ]);

  useEffect(() => {
    if (!isBuildDocsMode) return;
    const mount = docsMountRef.current;
    if (!mount) return;

    mount.innerHTML = buildDocsHtml;

    const mermaidBlocks = Array.from(mount.querySelectorAll(MERMAID_CODE_BLOCK_SELECTOR)) as HTMLElement[];
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      try {
        for (let i = 0; i < mermaidBlocks.length; i += 1) {
          if (isCancelled) return;
          const block = mermaidBlocks[i];
          const code = block.textContent ?? '';
          if (!code.trim()) continue;
          const id = `build-docs-${Date.now()}-${i}`;
          const validation = await validateMermaidDiagramCode(code, { logError: false });
          if (validation.isValid === false) {
            continue;
          }
          try {
            const normalized = applyInlineMermaidDirectives(code);
            const { svg, bindFunctions } = await mermaid.render(id, normalized);
            if (isCancelled || !svg) continue;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = svg;
            const pre = block.parentElement;
            if (pre && pre.parentElement) {
              pre.replaceWith(wrapper);
              try {
                bindFunctions?.(wrapper);
              } catch (e) {
                console.error('Failed to bind Mermaid interactions in build docs preview', e);
              }
            }
          } catch {
            // Swallow render errors in build docs preview.
          }
        }
      } catch {
        // Swallow render errors to avoid crashing the app.
      }
    };

    void renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [buildDocsHtml, isBuildDocsMode, theme]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (!svgMarkup) return;
    const mount = svgMountRef.current;
    if (!mount) return;

    // Use the browser's SVG/HTML parser (better for foreignObject-heavy diagrams like C4).
    mount.innerHTML = svgMarkup;
    const svgEl = mount.querySelector('svg');
    if (!svgEl) return;

    panZoomRef.current?.destroy();
    panZoomRef.current = null;
    setZoomPercent(100);

    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    (svgEl as unknown as SVGSVGElement).style.display = 'block';
    (svgEl as unknown as SVGSVGElement).style.maxWidth = 'none';
    (svgEl as unknown as SVGSVGElement).style.maxHeight = 'none';

    svgRef.current = svgEl as unknown as SVGSVGElement;

    // Bind interactions (if any) after SVG is mounted.
    try {
      bindFunctionsRef.current?.(mount);
    } catch (e) {
      console.error('Failed to bind Mermaid interactions', e);
    }

    let rafId = 0;
    let didInit = false;
    let attempts = 0;
    let isActive = true;
    const ensureViewBoxAndInit = () => {
      if (didInit) return;
      attempts += 1;

      const initialViewBox = parseViewBoxAttr(svgEl.getAttribute('viewBox'));
      if (!initialViewBox) {
        const vb = computeFitViewBoxFromBBox();
        if (vb) {
          svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
        }
      }

      const viewBoxAfter = parseViewBoxAttr(svgEl.getAttribute('viewBox'));
      if (viewBoxAfter) {
        didInit = true;
        const instance = svgPanZoom(svgEl as unknown as SVGSVGElement, {
          panEnabled: true,
          zoomEnabled: true,
          fit: true,
          center: true,
          controlIconsEnabled: false,
          dblClickZoomEnabled: false,
          mouseWheelZoomEnabled: true,
          preventMouseEventsDefault: false,
          minZoom: 0.15,
          maxZoom: 6,
          onZoom: (newZoom) => updateZoomPercent(newZoom),
        });

        panZoomRef.current = instance;

        // Some SVGs (esp. foreignObject-heavy) need one paint before fit/center stabilizes.
        requestAnimationFrame(() => {
          if (!isActive) return;
          instance.resize();
          instance.fit();
          instance.center();
          updateZoomPercent(instance.getZoom());
        });

        return;
      }

      if (attempts < 30) rafId = requestAnimationFrame(ensureViewBoxAndInit);
    };

    rafId = requestAnimationFrame(ensureViewBoxAndInit);
    return () => {
      isActive = false;
      cancelAnimationFrame(rafId);
      panZoomRef.current?.destroy();
      panZoomRef.current = null;
    };
  }, [computeFitViewBoxFromBBox, isBuildDocsMode, svgMarkup, updateZoomPercent]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (!svgMarkup) return;
    if (!panZoomRef.current) return;
    const rafId = requestAnimationFrame(() => {
      fitToViewport();
    });
    return () => cancelAnimationFrame(rafId);
  }, [fitToViewport, isFullScreen, isBuildDocsMode, svgMarkup]);

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

  return (
    <div className="h-full flex flex-col bg-transparent" style={previewBackgroundColor ? { backgroundColor: previewBackgroundColor } : undefined}>
      <PreviewHeaderControls
        title={isBuildDocsMode ? 'Build Docs' : 'Preview'}
        isBuildDocsMode={isBuildDocsMode}
        isMarkdownMode={isMarkdownMode}
        markdownNavEnabled={markdownNavEnabled}
        markdownNavLabel={markdownNavLabel}
        markdownPrevDisabled={markdownMermaidActiveIndex <= 0}
        markdownNextDisabled={markdownMermaidActiveIndex >= markdownMermaidBlocks.length - 1}
        onMarkdownPrev={() => setMarkdownIndexFromPreview(Math.max(0, markdownMermaidActiveIndex - 1))}
        onMarkdownNext={() =>
          setMarkdownIndexFromPreview(
            Math.min(markdownMermaidBlocks.length - 1, markdownMermaidActiveIndex + 1)
          )
        }
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
        zoomPercent={zoomPercent}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitToViewport={fitToViewport}
      />

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
      />
    </div>
  );
};

export default PreviewColumn;
