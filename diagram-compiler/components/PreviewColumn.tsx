import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { DiagramType, DocsMode, EditorTab, MermaidState } from '../types';
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
  applyInlineMermaidDirectives,
  detectMermaidDiagramType,
  isMarkdownLike,
  MermaidMarkdownBlock,
  validateMermaidDiagramCode,
} from '../services/mermaidService';
import { initializeMermaid } from '../services/mermaidService';
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
import { buildNotebookExcalidrawScene } from '../services/excalidraw/notebookRibbonBuilder';
import { augmentMermaidErrorForAutoFix } from '../utils/mermaidAutoFixHints';
import PreviewHeaderControls from './preview/PreviewHeaderControls';
import PreviewBody from './preview/PreviewBody';
import DiagramWhiteboard from './preview/DiagramWhiteboard';
import './markdown-preview.css';
import { parseSvgViewBox } from '../utils/svgViewBox';
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

const FIT_PADDING_RATIO = 0.05;

type ViewBox = { x: number; y: number; width: number; height: number };

const EXCALIDRAW_THEME_STORAGE_KEY = 'mlg.excalidrawThemeByDiagramKey.v1';
const EXCALIDRAW_CANVAS_BG_STORAGE_KEY = 'mlg.excalidrawCanvasBackgroundByDiagramKey.v1';

const readExcalidrawThemeFromSceneJson = (sceneJson: string | null | undefined): 'light' | 'dark' | null => {
  if (!sceneJson) return null;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const appState = record.appState;
    if (!appState || typeof appState !== 'object') return null;
    const theme = (appState as Record<string, unknown>).theme;
    return theme === 'dark' || theme === 'light' ? theme : null;
  } catch {
    return null;
  }
};

const hashString = (s: string): number => {
  // djb2
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) + hash + s.charCodeAt(i);
  }
  return hash >>> 0;
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
  const WHITEBOARD_SUPPORTED_TYPES = useMemo<Set<DiagramType>>(() => new Set(['flowchart', 'sequence', 'class']), []);
  const [previewMode, setPreviewMode] = useState<'preview' | 'whiteboard'>('preview');
  const [whiteboardResetKey, setWhiteboardResetKey] = useState(0);
  const [isWhiteboardDirty, setIsWhiteboardDirty] = useState(false);
  const [whiteboardInitialSceneOverride, setWhiteboardInitialSceneOverride] = useState<string | null | undefined>(undefined);
  const [isWhiteboardAutoSync, setIsWhiteboardAutoSync] = useState(false);
  const [whiteboardZoomPercent, setWhiteboardZoomPercent] = useState(100);
  const [isNotebookExcalidrawMode, setIsNotebookExcalidrawMode] = useState(false);
  const [notebookExcalidrawScene, setNotebookExcalidrawScene] = useState<ExcalidrawInitialDataState | null>(null);
  const [excalidrawThemeByDiagramKey, setExcalidrawThemeByDiagramKey] = useState<Record<string, 'light' | 'dark'>>(() => {
    try {
      const raw = window.localStorage.getItem(EXCALIDRAW_THEME_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const record = parsed as Record<string, unknown>;
      const next: Record<string, 'light' | 'dark'> = {};
      for (const [key, value] of Object.entries(record)) {
        if (value === 'light' || value === 'dark') next[key] = value;
      }
      return next;
    } catch {
      return {};
    }
  });
  const [excalidrawCanvasBackgroundByDiagramKey, setExcalidrawCanvasBackgroundByDiagramKey] = useState<
    Record<string, { light?: string | null; dark?: string | null }>
  >(() => {
    try {
      const raw = window.localStorage.getItem(EXCALIDRAW_CANVAS_BG_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') return {};
      const record = parsed as Record<string, unknown>;
      const next: Record<string, { light?: string | null; dark?: string | null }> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        const light = typeof v.light === 'string' ? v.light : (v.light === null ? null : undefined);
        const dark = typeof v.dark === 'string' ? v.dark : (v.dark === null ? null : undefined);
        if (light === undefined && dark === undefined) continue;
        next[key] = { ...(light !== undefined ? { light } : {}), ...(dark !== undefined ? { dark } : {}) };
      }
      return next;
    } catch {
      return {};
    }
  });
  const lastNotebookExcalidrawSignatureRef = useRef<string>('');
  const inFlightNotebookExcalidrawSignatureRef = useRef<string>('');
  const pendingPreviewZoomRef = useRef<number | null>(null);
  const lastWhiteboardSourceRef = useRef<{ code: string; svg: string } | null>(null);
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
  const diagramThemeKey = useMemo(() => {
    const code = codeForRender.trim();
    if (!code) return null;
    return `diagram:${hashString(code)}`;
  }, [codeForRender]);
  const notebookThemeKey = useMemo(() => {
    const markdown = mermaidState.code.trim();
    if (!markdown) return 'notebook:empty';
    return `notebook:${hashString(markdown)}`;
  }, [mermaidState.code]);
  const excalidrawTheme = useMemo<'light' | 'dark'>(() => {
    const stored = diagramThemeKey ? excalidrawThemeByDiagramKey[diagramThemeKey] : undefined;
    const fromScene = readExcalidrawThemeFromSceneJson(whiteboardSceneJson);
    return stored ?? fromScene ?? theme;
  }, [diagramThemeKey, excalidrawThemeByDiagramKey, theme, whiteboardSceneJson]);
  const notebookExcalidrawTheme = useMemo<'light' | 'dark'>(() => {
    return excalidrawThemeByDiagramKey[notebookThemeKey] ?? theme;
  }, [excalidrawThemeByDiagramKey, notebookThemeKey, theme]);
  const diagramCanvasBackgroundByTheme = useMemo(() => {
    return diagramThemeKey ? (excalidrawCanvasBackgroundByDiagramKey[diagramThemeKey] ?? null) : null;
  }, [diagramThemeKey, excalidrawCanvasBackgroundByDiagramKey]);
  const notebookCanvasBackgroundByTheme = useMemo(() => {
    return excalidrawCanvasBackgroundByDiagramKey[notebookThemeKey] ?? null;
  }, [excalidrawCanvasBackgroundByDiagramKey, notebookThemeKey]);
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

  const updateZoomPercent = useCallback((nextZoom?: number) => {
    const instance = panZoomRef.current;
    const zoom = (() => {
      if (typeof nextZoom === 'number') return nextZoom;
      if (!instance) return undefined;
      try {
        return instance.getZoom();
      } catch {
        return undefined;
      }
    })();

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
    try {
      instance.resize();
      instance.fit();
      instance.center();
      updateZoomPercent(instance.getZoom());
    } catch {
      // Ignore svg-pan-zoom errors (e.g., non-invertible SVG matrix).
    }
  }, [updateZoomPercent]);

  const clampPreviewZoom = useCallback((percent: number) => Math.min(600, Math.max(15, percent)), []);
  const snapPreviewZoom = useCallback((percent: number) => Math.round(percent / 10) * 10, []);

  const applyPreviewZoom = useCallback((nextPercent: number) => {
    const instance = panZoomRef.current;
    if (!instance) return;
    const percent = clampPreviewZoom(snapPreviewZoom(nextPercent));
    const scale = percent / 100;
    try {
      instance.zoom(scale);
      instance.center();
      updateZoomPercent(scale);
    } catch {
      // Ignore zoom errors from svg-pan-zoom.
    }
  }, [clampPreviewZoom, snapPreviewZoom, updateZoomPercent]);

  const safeDestroyPanZoom = useCallback(() => {
    const instance = panZoomRef.current;
    if (!instance) return;
    try {
      instance.destroy();
    } catch {
      // svg-pan-zoom can throw if SVG matrix is not invertible (e.g., detached/0-sized SVG).
    } finally {
      panZoomRef.current = null;
    }
  }, []);

  const zoomIn = useCallback(() => {
    applyPreviewZoom(zoomPercent + 10);
  }, [applyPreviewZoom, zoomPercent]);

  const zoomOut = useCallback(() => {
    applyPreviewZoom(zoomPercent - 10);
  }, [applyPreviewZoom, zoomPercent]);

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
    safeDestroyPanZoom();
    setZoomPercent(100);
  }, [codeForRender, isBuildDocsMode, isMarkdownMermaidMode, isMarkdownMode, safeDestroyPanZoom]);

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
        safeDestroyPanZoom();
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
          setRenderError(enrichMermaidError(codeForRender, validation.errorMessage ?? 'Syntax Error'));
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
        setRenderError(enrichMermaidError(codeForRender, message));
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
    if (previewMode !== 'preview') return;
    if (!isMarkdownMode) return;
    if (isNotebookExcalidrawMode) return;
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
              const errorBlock = createMarkdownErrorBlock(
                enrichMermaidError(code, validation.errorMessage || 'Syntax Error'),
                i
              );
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
              const errorBlock = createMarkdownErrorBlock(enrichMermaidError(code, message), i);
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
    enrichMermaidError,
    isBuildDocsMode,
    isMarkdownMode,
    markdownHtml,
    markdownMermaidDiagnostics,
    handleHoverSync,
    onHoverMarkdownIndex,
    isNotebookExcalidrawMode,
    previewMode,
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
    if (previewMode !== 'preview') {
      safeDestroyPanZoom();
      return;
    }
    if (!svgMarkup) return;
    const mount = svgMountRef.current;
    if (!mount) return;

    // Use the browser's SVG/HTML parser (better for foreignObject-heavy diagrams like C4).
    mount.innerHTML = svgMarkup;
    const svgEl = mount.querySelector('svg');
    if (!svgEl) return;

    safeDestroyPanZoom();
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
    let removeWheelListener: (() => void) | null = null;
    const ensureViewBoxAndInit = () => {
      if (didInit) return;
      attempts += 1;

      const initialViewBox = parseSvgViewBox(svgEl.getAttribute('viewBox'));
      if (!initialViewBox) {
        const vb = computeFitViewBoxFromBBox();
        if (vb) {
          svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
        }
      }

      const viewBoxAfter = parseSvgViewBox(svgEl.getAttribute('viewBox'));
      if (viewBoxAfter) {
        didInit = true;
        const instance = svgPanZoom(svgEl as unknown as SVGSVGElement, {
          panEnabled: true,
          zoomEnabled: true,
          fit: true,
          center: true,
          controlIconsEnabled: false,
          dblClickZoomEnabled: false,
          mouseWheelZoomEnabled: false,
          preventMouseEventsDefault: false,
          minZoom: 0.15,
          maxZoom: 6,
          onZoom: (newZoom) => updateZoomPercent(newZoom),
        });

        panZoomRef.current = instance;

        // Some SVGs (esp. foreignObject-heavy) need one paint before fit/center stabilizes.
        requestAnimationFrame(() => {
          if (!isActive) return;
          try {
            instance.resize();
            instance.fit();
            instance.center();
            updateZoomPercent(instance.getZoom());
          } catch {
            // Ignore svg-pan-zoom errors (e.g., non-invertible SVG matrix during init/teardown).
          }
        });

        const handleWheel = (event: WheelEvent) => {
          const instance = panZoomRef.current;
          if (!instance) return;
          const isZoomGesture = event.ctrlKey || event.metaKey;
          if (!isZoomGesture) {
            event.preventDefault();
            try {
              instance.panBy({ x: -event.deltaX, y: -event.deltaY });
            } catch {
              // Ignore pan errors from svg-pan-zoom.
            }
            return;
          }

          event.preventDefault();
          const rect = svgEl.getBoundingClientRect();
          const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
          const step = 1.1;
          const scale = event.deltaY < 0 ? step : 1 / step;
          try {
            instance.zoomAtPointBy(scale, point);
            updateZoomPercent(instance.getZoom());
          } catch {
            // Ignore zoom errors from svg-pan-zoom.
          }
        };

        svgEl.addEventListener('wheel', handleWheel, { passive: false });
        removeWheelListener = () => svgEl.removeEventListener('wheel', handleWheel);
      }

      if (attempts < 30) rafId = requestAnimationFrame(ensureViewBoxAndInit);
    };

    rafId = requestAnimationFrame(ensureViewBoxAndInit);
    return () => {
      isActive = false;
      cancelAnimationFrame(rafId);
      removeWheelListener?.();
      safeDestroyPanZoom();
    };
  }, [computeFitViewBoxFromBBox, isBuildDocsMode, previewMode, safeDestroyPanZoom, svgMarkup, updateZoomPercent]);

  useEffect(() => {
    if (isBuildDocsMode) return;
    if (previewMode !== 'preview') return;
    if (!svgMarkup) return;
    if (!panZoomRef.current) return;
    const rafId = requestAnimationFrame(() => {
      fitToViewport();
    });
    return () => cancelAnimationFrame(rafId);
  }, [fitToViewport, isFullScreen, isBuildDocsMode, previewMode, svgMarkup]);

  useEffect(() => {
    if (previewMode !== 'preview') return;
    const target = pendingPreviewZoomRef.current;
    if (target === null) return;
    const instance = panZoomRef.current;
    if (!instance) return;
    const nextZoom = target / 100;
    try {
      const currentZoom = instance.getZoom();
      if (Math.abs(currentZoom - nextZoom) > 0.01) {
        instance.zoom(nextZoom);
        updateZoomPercent(nextZoom);
        instance.center();
      }
    } catch {
      // Ignore zoom sync errors from svg-pan-zoom.
    }
    pendingPreviewZoomRef.current = null;
  }, [previewMode, svgMarkup, updateZoomPercent]);

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

  const isWhiteboardSupported = Boolean(activeDiagramType && WHITEBOARD_SUPPORTED_TYPES.has(activeDiagramType));
  const canWhiteboard = Boolean(
    !isBuildDocsMode
    && !isMarkdownMode
    && isWhiteboardSupported
    && svgMarkup.trim().length > 0
    && historyRevisionId
  );

  const canNotebookExcalidraw = Boolean(
    !isBuildDocsMode
    && isMarkdownMode
    && markdownMermaidBlocks.length > 0
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(EXCALIDRAW_THEME_STORAGE_KEY, JSON.stringify(excalidrawThemeByDiagramKey));
    } catch {
      // ignore
    }
  }, [excalidrawThemeByDiagramKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EXCALIDRAW_CANVAS_BG_STORAGE_KEY,
        JSON.stringify(excalidrawCanvasBackgroundByDiagramKey)
      );
    } catch {
      // ignore
    }
  }, [excalidrawCanvasBackgroundByDiagramKey]);

  useEffect(() => {
    if (!diagramThemeKey) return;
    const fromScene = readExcalidrawThemeFromSceneJson(whiteboardSceneJson);
    if (!fromScene) return;
    setExcalidrawThemeByDiagramKey((prev) => {
      if (prev[diagramThemeKey] === fromScene) return prev;
      if (prev[diagramThemeKey]) return prev;
      return { ...prev, [diagramThemeKey]: fromScene };
    });
  }, [diagramThemeKey, whiteboardSceneJson]);

  useEffect(() => {
    if (isNotebookExcalidrawMode && !canNotebookExcalidraw) {
      setIsNotebookExcalidrawMode(false);
    }
  }, [canNotebookExcalidraw, isNotebookExcalidrawMode]);

  useEffect(() => {
    // Whiteboard mode is only for single Mermaid SVG preview.
    if (previewMode === 'whiteboard' && !canWhiteboard) {
      setPreviewMode('preview');
    }
  }, [canWhiteboard, previewMode]);

  useEffect(() => {
    if (!isNotebookExcalidrawMode) {
      setNotebookExcalidrawScene(null);
      lastNotebookExcalidrawSignatureRef.current = '';
      inFlightNotebookExcalidrawSignatureRef.current = '';
      return;
    }
    if (!isMarkdownMode || isBuildDocsMode) return;
    if (!markdownMermaidBlocks.length) {
      setNotebookExcalidrawScene(null);
      return;
    }

    let cancelled = false;
    const markdownHash = hashString(mermaidState.code.trim());
    const blocksHash = hashString(markdownMermaidBlocks.map((b) => b.code.trim()).join('\n---\n'));
    const whiteboardHash = hashString(whiteboardBundleJson?.trim() ?? '');
    const basePresetId = (!isThemePresetMixed && selectedThemePreset) ? selectedThemePreset : appThemePresetId;
    const signature = `${notebookExcalidrawTheme}:${previewBackgroundColor ?? ''}:${String(basePresetId)}:${markdownHash}:${blocksHash}:${whiteboardHash}`;
    if (signature === lastNotebookExcalidrawSignatureRef.current) return;
    if (signature === inFlightNotebookExcalidrawSignatureRef.current) return;
    inFlightNotebookExcalidrawSignatureRef.current = signature;

    const timer = window.setTimeout(() => {
      void (async () => {
        const nextScene = await buildNotebookExcalidrawScene({
          mermaidCode: mermaidState.code,
          markdownBlocks: markdownMermaidBlocks,
          theme: notebookExcalidrawTheme,
          basePresetId,
          previewBackgroundColor,
          whiteboardBundleJson,
          shouldCancel: () => cancelled,
        });
        if (cancelled) return;
        if (!nextScene) {
          setNotebookExcalidrawScene(null);
          return;
        }

        setNotebookExcalidrawScene(nextScene);
        lastNotebookExcalidrawSignatureRef.current = signature;
        inFlightNotebookExcalidrawSignatureRef.current = '';
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (inFlightNotebookExcalidrawSignatureRef.current === signature) {
        inFlightNotebookExcalidrawSignatureRef.current = '';
      }
    };
  }, [
    notebookExcalidrawTheme,
    isBuildDocsMode,
    isMarkdownMode,
    isNotebookExcalidrawMode,
    isThemePresetMixed,
    mermaidState.code,
    markdownMermaidBlocks,
    previewBackgroundColor,
    selectedThemePreset,
    appThemePresetId,
    whiteboardBundleJson,
  ]);

  const handleToggleWhiteboard = useCallback(() => {
    setIsWhiteboardDirty(false);
    setWhiteboardInitialSceneOverride(undefined);
    setPreviewMode((prev) => {
      if (prev === 'whiteboard') {
        pendingPreviewZoomRef.current = whiteboardZoomPercent;
        setZoomPercent(whiteboardZoomPercent);
        return 'preview';
      }
      setWhiteboardZoomPercent(zoomPercent);
      return 'whiteboard';
    });
  }, [whiteboardZoomPercent, zoomPercent]);

  const pinnedMode = useMemo<'mermaid' | 'ed'>(() => {
    if (isBuildDocsMode) return 'mermaid';
    if (isMarkdownMode) return isNotebookExcalidrawMode ? 'ed' : 'mermaid';
    return previewMode === 'whiteboard' ? 'ed' : 'mermaid';
  }, [isBuildDocsMode, isMarkdownMode, isNotebookExcalidrawMode, previewMode]);

  const pinnedCanEd = useMemo(() => {
    if (isBuildDocsMode) return false;
    if (isMarkdownMode) return canNotebookExcalidraw;
    return canWhiteboard;
  }, [canNotebookExcalidraw, canWhiteboard, isBuildDocsMode, isMarkdownMode]);

  const pinnedDirty = useMemo(() => {
    if (isBuildDocsMode) return false;
    if (isMarkdownMode) return false;
    return isWhiteboardDirty;
  }, [isBuildDocsMode, isMarkdownMode, isWhiteboardDirty]);

  const pinnedEdDisabledReason = useMemo(() => {
    if (pinnedCanEd) return null;
    if (isBuildDocsMode) return 'ED is disabled in Prompts';
    if (isMarkdownMode) return 'ED is unavailable in this view';
    return 'ED is unavailable for this diagram';
  }, [isBuildDocsMode, isMarkdownMode, pinnedCanEd]);

  const handlePinnedSetMode = useCallback((next: 'mermaid' | 'ed') => {
    if (next === pinnedMode) return;
    if (next === 'ed' && !pinnedCanEd) return;
    if (isBuildDocsMode) return;
    if (isMarkdownMode) {
      setIsNotebookExcalidrawMode(next === 'ed');
      return;
    }
    handleToggleWhiteboard();
  }, [handleToggleWhiteboard, isBuildDocsMode, isMarkdownMode, pinnedCanEd, pinnedMode]);

  const handleToggleNotebookExcalidraw = useCallback(() => {
    setIsNotebookExcalidrawMode((value) => !value);
  }, []);

  const handleSetExcalidrawTheme = useCallback((nextTheme: 'light' | 'dark') => {
    const key = diagramThemeKey;
    if (!key) return;
    setExcalidrawThemeByDiagramKey((prev) => (prev[key] === nextTheme ? prev : { ...prev, [key]: nextTheme }));
  }, [diagramThemeKey]);

  const handleSetNotebookExcalidrawTheme = useCallback((nextTheme: 'light' | 'dark') => {
    const key = notebookThemeKey;
    setExcalidrawThemeByDiagramKey((prev) => (prev[key] === nextTheme ? prev : { ...prev, [key]: nextTheme }));
  }, [notebookThemeKey]);

  const handleSetDiagramCanvasBackgroundByTheme = useCallback((next: { light: string | null; dark: string | null }) => {
    if (!diagramThemeKey) return;
    const key = diagramThemeKey;
    setExcalidrawCanvasBackgroundByDiagramKey((prev) => {
      const current = prev[key] ?? {};
      if (current.light === next.light && current.dark === next.dark) return prev;
      return { ...prev, [key]: { light: next.light, dark: next.dark } };
    });
  }, [diagramThemeKey]);

  const handleSetNotebookCanvasBackgroundByTheme = useCallback((next: { light: string | null; dark: string | null }) => {
    const key = notebookThemeKey;
    setExcalidrawCanvasBackgroundByDiagramKey((prev) => {
      const current = prev[key] ?? {};
      if (current.light === next.light && current.dark === next.dark) return prev;
      return { ...prev, [key]: { light: next.light, dark: next.dark } };
    });
  }, [notebookThemeKey]);

  const handleWhiteboardSyncFromCode = useCallback(() => {
    if (!canWhiteboard) return;
    const ok = window.confirm('Sync from Mermaid code?\n\nThis will overwrite the current whiteboard scene.');
    if (!ok) return;
    setIsWhiteboardDirty(false);
    setWhiteboardInitialSceneOverride(null);
    void Promise.resolve(onSaveWhiteboardSceneJson(null)).catch(() => {});
    setWhiteboardResetKey((v) => v + 1);
  }, [canWhiteboard, onSaveWhiteboardSceneJson]);

  useEffect(() => {
    const snapshot = { code: codeForRender, svg: svgMarkup };
    const prev = lastWhiteboardSourceRef.current;
    lastWhiteboardSourceRef.current = snapshot;

    if (!canWhiteboard || previewMode !== 'whiteboard') return;
    if (!prev) return;
    if (prev.code === snapshot.code && prev.svg === snapshot.svg) return;
    if (!snapshot.svg.trim()) return;

    // Auto-sync has two modes:
    // - Explicit: user enables "Auto" in the header.
    // - Implicit: keep ED preview synced while the user hasn't edited the board.
    if (!isWhiteboardAutoSync && isWhiteboardDirty) return;

    setIsWhiteboardDirty(false);
    setWhiteboardInitialSceneOverride(null);
    void Promise.resolve(onSaveWhiteboardSceneJson(null)).catch(() => {});
    setWhiteboardResetKey((v) => v + 1);
  }, [canWhiteboard, codeForRender, isWhiteboardAutoSync, isWhiteboardDirty, onSaveWhiteboardSceneJson, previewMode, svgMarkup]);

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
