import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Download, Maximize2, Minimize2, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import svgPanZoom from 'svg-pan-zoom';
import MarkdownIt from 'markdown-it';
import { EditorTab, MermaidState, PromptPreviewMode, PromptPreviewTab, PromptPreviewView } from '../types';
import { useDiagramExport } from '../hooks/studio/useDiagramExport';
import { extractInlineThemeCommand, MermaidThemeName } from '../utils/inlineThemeCommand';
import { applyInlineDirectionCommand, extractInlineDirectionCommand, MermaidDirection } from '../utils/inlineDirectionCommand';
import { applyInlineThemeAndLookCommands, extractInlineLookCommand, MermaidLook } from '../utils/inlineLookCommand';
import { isMarkdownLike, MermaidMarkdownBlock } from '../services/mermaidService';
import './markdown-preview.css';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onSetInlineTheme: (theme: MermaidThemeName | null) => void;
  onSetInlineDirection: (direction: MermaidDirection | null) => void;
  onSetInlineLook: (look: MermaidLook | null) => void;
  activeEditorTab: EditorTab;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  promptPreviewView: PromptPreviewView;
  buildDocsEntries: Array<{ path: string; text: string }>;
  buildDocsActivePath: string;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
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
  isFullScreen,
  onToggleFullScreen,
  onSetInlineTheme,
  onSetInlineDirection,
  onSetInlineLook,
  activeEditorTab,
  promptPreviewByMode,
  promptPreviewView,
  buildDocsEntries,
  buildDocsActivePath,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const markdownMountRef = useRef<HTMLDivElement>(null);
  const docsMountRef = useRef<HTMLDivElement>(null);
  const promptMountRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const panZoomRef = useRef<ReturnType<typeof svgPanZoom> | null>(null);

  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [markdownHtml, setMarkdownHtml] = useState<string>('');
  const [isMarkdownMode, setIsMarkdownMode] = useState<boolean>(false);
  const isMarkdownMermaidMode = activeEditorTab === 'markdown_mermaid';
  const activeMarkdownBlock = markdownMermaidBlocks[markdownMermaidActiveIndex];
  const activeMarkdownDiagnostics = markdownMermaidDiagnostics[markdownMermaidActiveIndex];
  const isMarkdownMermaidInvalid = isMarkdownMermaidMode && activeMarkdownDiagnostics?.isValid === false;
  const codeForRender = isMarkdownMermaidMode ? activeMarkdownBlock?.code ?? '' : mermaidState.code;
  const normalizeMermaidBlockCode = useCallback((raw: string) => {
    const withDirection = applyInlineDirectionCommand(raw).code;
    return applyInlineThemeAndLookCommands(withDirection).code;
  }, []);
  const createMarkdownErrorBlock = useCallback((message: string) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-callout markdown-callout-error';
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
  const applyMarkdownCallouts = useCallback((mount: HTMLElement) => {
    const types: Array<{ key: string; title: string }> = [
      { key: 'warning', title: 'Warning' },
      { key: 'note', title: 'Note' },
      { key: 'tip', title: 'Tip' },
      { key: 'info', title: 'Info' },
    ];

    for (const type of types) {
      const blocks = Array.from(
        mount.querySelectorAll(`pre > code.language-${type.key}`)
      );

      for (const block of blocks) {
        const text = (block.textContent ?? '').trim();
        if (!text) continue;
        const pre = block.parentElement;
        if (!pre || !pre.parentElement) continue;
        const wrapper = document.createElement('div');
        wrapper.className = `markdown-callout markdown-callout-${type.key}`;
        const title = document.createElement('div');
        title.className = 'markdown-callout-title';
        title.textContent = type.title;
        const body = document.createElement('div');
        body.className = 'markdown-callout-body';
        body.textContent = text;
        wrapper.appendChild(title);
        wrapper.appendChild(body);
        pre.replaceWith(wrapper);
      }
    }
  }, []);
  const { exportError, exportPng, exportSvg, isExporting } = useDiagramExport({ svgRef, code: codeForRender, theme });
  const markdownRenderer = useMemo(() => new MarkdownIt({ html: false, linkify: true, typographer: false }), []);
  const isPromptMode =
    activeEditorTab === 'prompt_chat' ||
    activeEditorTab === 'prompt_build' ||
    activeEditorTab === 'prompt_analyze' ||
    activeEditorTab === 'prompt_fix';
  const isBuildDocsMode = activeEditorTab === 'build_docs';
  const activePromptPreview =
    activeEditorTab === 'prompt_chat'
      ? promptPreviewByMode.chat
      : activeEditorTab === 'prompt_build'
        ? promptPreviewByMode.build
        : activeEditorTab === 'prompt_analyze'
          ? promptPreviewByMode.analyze
          : activeEditorTab === 'prompt_fix'
            ? promptPreviewByMode.fix
            : null;
  const promptContent = useMemo(() => {
    if (!isPromptMode) return '';
    if (promptPreviewView === 'raw') return activePromptPreview?.rawContent ?? activePromptPreview?.content ?? '';
    return activePromptPreview?.redactedContent ?? activePromptPreview?.content ?? '';
  }, [activePromptPreview?.content, activePromptPreview?.rawContent, activePromptPreview?.redactedContent, isPromptMode, promptPreviewView]);

  const promptHtml = useMemo(() => {
    return promptContent.trim() ? markdownRenderer.render(promptContent) : '';
  }, [markdownRenderer, promptContent]);

  const activeBuildDoc = buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  const buildDocsHtml = useMemo(() => {
    if (!isBuildDocsMode) return '';
    const content = activeBuildDoc?.text ?? '';
    return content.trim() ? markdownRenderer.render(content) : '';
  }, [activeBuildDoc?.text, isBuildDocsMode, markdownRenderer]);


  const selectedInlineTheme = useMemo(() => {
    return extractInlineThemeCommand(codeForRender).theme ?? '';
  }, [codeForRender]);

  const selectedInlineDirection = useMemo(() => {
    return extractInlineDirectionCommand(codeForRender).direction ?? '';
  }, [codeForRender]);

  const selectedInlineLook = useMemo(() => {
    return extractInlineLookCommand(codeForRender).look ?? '';
  }, [codeForRender]);

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
    if (isPromptMode || isBuildDocsMode) return;
    if (isMarkdownMermaidMode) {
      if (isMarkdownMode) setIsMarkdownMode(false);
      if (markdownHtml) setMarkdownHtml('');
      return;
    }
    const isMarkdown = isMarkdownLike(codeForRender);
    setIsMarkdownMode(isMarkdown);
    if (!isMarkdown) {
      setMarkdownHtml('');
      return;
    }

    setRenderError(null);
    setSvgMarkup('');
    bindFunctionsRef.current = null;
    svgRef.current = null;
    panZoomRef.current?.destroy();
    panZoomRef.current = null;
    setZoomPercent(100);

    const html = markdownRenderer.render(codeForRender);
    setMarkdownHtml(html);
  }, [
    codeForRender,
    isBuildDocsMode,
    isMarkdownMermaidMode,
    isMarkdownMode,
    isPromptMode,
    markdownHtml,
    markdownRenderer,
  ]);

  useEffect(() => {
    if (isPromptMode || isBuildDocsMode) return;
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
        const withDirection = applyInlineDirectionCommand(codeForRender).code;
        const { code: inlineCode } = applyInlineThemeAndLookCommands(withDirection);
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
    isPromptMode,
    mermaidState.isValid,
    theme,
  ]);

  useEffect(() => {
    if (isPromptMode || isBuildDocsMode) return;
    if (!isMarkdownMode) return;
    const mount = markdownMountRef.current;
    if (!mount) return;

    mount.innerHTML = markdownHtml;
    applyMarkdownCallouts(mount);

    const mermaidBlocks = Array.from(
      mount.querySelectorAll('pre > code.language-mermaid, pre > code.language-mermaid-example')
    );
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      for (let i = 0; i < mermaidBlocks.length; i += 1) {
        if (isCancelled) return;
        const block = mermaidBlocks[i];
        const code = block.textContent ?? '';
        if (!code.trim()) continue;
        const id = `md-mermaid-${Date.now()}-${i}`;
        const diagnostics = markdownMermaidDiagnostics[i];
        if (diagnostics?.isValid === false) {
          const pre = block.parentElement;
          if (pre && pre.parentElement) {
            const errorBlock = createMarkdownErrorBlock(diagnostics.errorMessage || 'Syntax Error');
            pre.replaceWith(errorBlock);
          }
          continue;
        }
        try {
          const normalized = normalizeMermaidBlockCode(code);
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
              console.error('Failed to bind Mermaid interactions in markdown', e);
            }
          }
        } catch (e) {
          const pre = block.parentElement;
          if (pre && pre.parentElement) {
            const message = e instanceof Error ? e.message : 'Syntax Error';
            const errorBlock = createMarkdownErrorBlock(message);
            pre.replaceWith(errorBlock);
          }
          console.error('Failed to render Mermaid block in markdown', e);
        }
      }
    };

    renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [
    applyMarkdownCallouts,
    createMarkdownErrorBlock,
    isBuildDocsMode,
    isMarkdownMode,
    isPromptMode,
    markdownHtml,
    markdownMermaidDiagnostics,
    normalizeMermaidBlockCode,
    theme,
  ]);

  useEffect(() => {
    if (!isBuildDocsMode) return;
    const mount = docsMountRef.current;
    if (!mount) return;

    mount.innerHTML = buildDocsHtml;
    applyMarkdownCallouts(mount);

    const mermaidBlocks = Array.from(
      mount.querySelectorAll('pre > code.language-mermaid, pre > code.language-mermaid-example')
    );
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      for (let i = 0; i < mermaidBlocks.length; i += 1) {
        if (isCancelled) return;
        const block = mermaidBlocks[i];
        const code = block.textContent ?? '';
        if (!code.trim()) continue;
        const id = `build-docs-${Date.now()}-${i}`;
        try {
          const normalized = normalizeMermaidBlockCode(code);
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
        } catch (e) {
          console.error('Failed to render Mermaid block in build docs preview', e);
        }
      }
    };

    renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [applyMarkdownCallouts, buildDocsHtml, isBuildDocsMode, normalizeMermaidBlockCode, theme]);

  useEffect(() => {
    if (!isPromptMode) return;
    const mount = promptMountRef.current;
    if (!mount) return;

    mount.innerHTML = promptHtml;
    applyMarkdownCallouts(mount);

    const mermaidBlocks = Array.from(
      mount.querySelectorAll('pre > code.language-mermaid, pre > code.language-mermaid-example')
    );
    if (mermaidBlocks.length === 0) return;

    let isCancelled = false;
    const renderBlocks = async () => {
      for (let i = 0; i < mermaidBlocks.length; i += 1) {
        if (isCancelled) return;
        const block = mermaidBlocks[i];
        const code = block.textContent ?? '';
        if (!code.trim()) continue;
        const id = `prompt-mermaid-${Date.now()}-${i}`;
        try {
          const normalized = normalizeMermaidBlockCode(code);
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
              console.error('Failed to bind Mermaid interactions in prompt preview', e);
            }
          }
        } catch (e) {
          console.error('Failed to render Mermaid block in prompt preview', e);
        }
      }
    };

    renderBlocks();
    return () => {
      isCancelled = true;
    };
  }, [applyMarkdownCallouts, isPromptMode, normalizeMermaidBlockCode, promptHtml, theme]);

  useEffect(() => {
    if (isPromptMode || isBuildDocsMode) return;
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
  }, [computeFitViewBoxFromBBox, isBuildDocsMode, isPromptMode, svgMarkup, updateZoomPercent]);

  useEffect(() => {
    if (isPromptMode || isBuildDocsMode) return;
    if (!svgMarkup) return;
    if (!panZoomRef.current) return;
    const rafId = requestAnimationFrame(() => {
      fitToViewport();
    });
    return () => cancelAnimationFrame(rafId);
  }, [fitToViewport, isFullScreen, isBuildDocsMode, isPromptMode, svgMarkup]);

  return (
    <div className="h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between gap-3">
        <div>{isPromptMode ? 'Prompt Preview' : isBuildDocsMode ? 'Build Docs' : 'Preview'}</div>
        {!isPromptMode && !isBuildDocsMode && !isMarkdownMode && (
          <div className="flex items-center gap-1.5 normal-case tracking-normal">
          <select
            className="h-6 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
            value={selectedInlineTheme}
            onChange={(e) => onSetInlineTheme((e.target.value || null) as MermaidThemeName | null)}
            disabled={!codeForRender.trim() || isMarkdownMode}
            title="Diagram theme (inline)"
          >
            <option value="">Theme: (none)</option>
            <option value="default">Theme: default</option>
            <option value="dark">Theme: dark</option>
            <option value="forest">Theme: forest</option>
            <option value="neutral">Theme: neutral</option>
            <option value="base">Theme: base</option>
          </select>

          <select
            className="h-6 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
            value={selectedInlineDirection}
            onChange={(e) => onSetInlineDirection((e.target.value || null) as MermaidDirection | null)}
            disabled={!codeForRender.trim() || isMarkdownMode}
            title="Diagram direction (inline)"
          >
            <option value="">Dir: (none)</option>
            <option value="TB">Dir: TB</option>
            <option value="TD">Dir: TD</option>
            <option value="LR">Dir: LR</option>
            <option value="RL">Dir: RL</option>
            <option value="BT">Dir: BT</option>
          </select>

          <select
            className="h-6 px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium"
            value={selectedInlineLook}
            onChange={(e) => onSetInlineLook((e.target.value || null) as MermaidLook | null)}
            disabled={!codeForRender.trim() || isMarkdownMode}
            title="Diagram look (inline)"
          >
            <option value="">Look: (none)</option>
            <option value="classic">Look: classic</option>
            <option value="handDrawn">Look: handDrawn</option>
          </select>

          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono w-12 text-right">{zoomPercent}%</span>
          {exportError && (
            <span className="text-[10px] text-red-600 dark:text-red-400 max-w-56 truncate" title={exportError}>
              {exportError}
            </span>
          )}

          <button
            type="button"
            onClick={onToggleFullScreen}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            title={isFullScreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            type="button"
            onClick={zoomOut}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            onClick={zoomIn}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            onClick={fitToViewport}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Fit (center & maximize)"
          >
            <Scan size={14} />
          </button>

          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={exportSvg}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-[10px] font-medium"
            title="Export SVG"
          >
            <Download size={12} />
            SVG
          </button>

          <button
            type="button"
            onClick={exportPng}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-[10px] font-medium"
            title="Export PNG"
          >
            <Download size={12} />
            PNG
          </button>
          </div>
        )}
      </div>

      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
      >

        {isPromptMode && (
          <div className="absolute inset-0 overflow-auto text-sm text-slate-700 dark:text-slate-200 leading-6 p-4">
            {promptContent ? (
              <div ref={promptMountRef} className="markdown-body" />
            ) : (
              <div className="text-slate-400 dark:text-slate-500 text-sm">No prompt preview available.</div>
            )}
          </div>
        )}

        {isBuildDocsMode && (
          <div className="absolute inset-0 overflow-auto text-sm text-slate-700 dark:text-slate-200 leading-6 p-4">
            {activeBuildDoc?.text ? (
              <div ref={docsMountRef} className="markdown-body" />
            ) : (
              <div className="text-slate-400 dark:text-slate-500 text-sm">No documentation loaded.</div>
            )}
          </div>
        )}

        {!isPromptMode &&
          !isBuildDocsMode &&
          renderError &&
          mermaidState.status !== 'invalid' &&
          !isMarkdownMode &&
          !isMarkdownMermaidInvalid && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Render failed</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {renderError}
              </p>
            </div>
          </div>
        )}
        {!isPromptMode && !isBuildDocsMode && isMarkdownMermaidInvalid && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {activeMarkdownDiagnostics?.errorMessage || 'Syntax Error'}
              </p>
            </div>
          </div>
        )}
        {!isPromptMode && !isBuildDocsMode && mermaidState.status === 'invalid' && !isMarkdownMode && !isMarkdownMermaidMode && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {mermaidState.errorMessage || 'Syntax Error'}
              </p>
            </div>
          </div>
        )}

        {!isPromptMode && !isBuildDocsMode && !codeForRender.trim() && !isMarkdownMode && (
          <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
        )}

        {!isPromptMode && !isBuildDocsMode && svgMarkup && !isMarkdownMode && <div ref={svgMountRef} className="absolute inset-0" />}
      {!isPromptMode && !isBuildDocsMode && isMarkdownMode && (
        <div
          ref={markdownMountRef}
          className="markdown-body absolute inset-0 overflow-auto p-4 text-sm text-slate-700 dark:text-slate-200 leading-6"
        />
      )}
    </div>
    </div>
  );
};

export default PreviewColumn;
