import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import svgPanZoom from 'svg-pan-zoom';
import MarkdownIt from 'markdown-it';
import { EditorTab, MermaidState } from '../types';
import { useDiagramExport } from '../hooks/studio/useDiagramExport';
import { extractInlineThemeCommand, MermaidThemeName } from '../utils/inlineThemeCommand';
import { applyInlineDirectionCommand, extractInlineDirectionCommand, MermaidDirection } from '../utils/inlineDirectionCommand';
import { applyInlineThemeAndLookCommands, extractInlineLookCommand, MermaidLook } from '../utils/inlineLookCommand';
import { detectMermaidDiagramType, isMarkdownLike, MermaidMarkdownBlock } from '../services/mermaidService';
import PreviewHeaderControls from './preview/PreviewHeaderControls';
import PreviewBody from './preview/PreviewBody';
import './markdown-preview.css';

const SYSTEM_PROMPT_DOC_PREFIX = 'system-prompts/';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onSetInlineTheme: (theme: MermaidThemeName | null) => void;
  onSetInlineDirection: (direction: MermaidDirection | null) => void;
  onSetInlineLook: (look: MermaidLook | null) => void;
  activeEditorTab: EditorTab;
  buildDocsSystemPrompts: Record<'chat' | 'build' | 'analyze' | 'fix', { raw: string; redacted: string }>;
  systemPromptRawByMode: Record<'chat' | 'build' | 'analyze' | 'fix', boolean>;
  buildDocsEntries: Array<{ path: string; text: string }>;
  buildDocsActivePath: string;
  markdownMermaidBlocks: MermaidMarkdownBlock[];
  markdownMermaidDiagnostics: Array<Pick<MermaidState, 'isValid' | 'errorMessage' | 'errorLine' | 'status'>>;
  markdownMermaidActiveIndex: number;
  onMarkdownMermaidActiveIndexChange: (index: number) => void;
  onActiveEditorTabChange: (tab: EditorTab) => void;
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
  buildDocsSystemPrompts,
  systemPromptRawByMode,
  buildDocsEntries,
  buildDocsActivePath,
  markdownMermaidBlocks,
  markdownMermaidDiagnostics,
  markdownMermaidActiveIndex,
  onMarkdownMermaidActiveIndexChange,
  onActiveEditorTabChange,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const markdownMountRef = useRef<HTMLDivElement>(null);
  const docsMountRef = useRef<HTMLDivElement>(null);
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
  const activeDiagramType = useMemo(() => {
    if (isMarkdownMermaidMode) {
      return activeMarkdownBlock?.diagramType ?? (codeForRender ? detectMermaidDiagramType(codeForRender) : null);
    }
    return codeForRender ? detectMermaidDiagramType(codeForRender) : null;
  }, [activeMarkdownBlock?.diagramType, codeForRender, isMarkdownMermaidMode]);
  const supportsInlineTheme = Boolean(activeDiagramType);
  const supportsInlineDirection =
    activeDiagramType === 'flowchart' ||
    activeDiagramType === 'class' ||
    activeDiagramType === 'state' ||
    activeDiagramType === 'er' ||
    activeDiagramType === 'requirementDiagram';
  const supportsInlineLook = activeDiagramType === 'flowchart' || activeDiagramType === 'state';
  const directionOptions = useMemo<MermaidDirection[]>(() => {
    if (!supportsInlineDirection) return [];
    if (activeDiagramType === 'flowchart') {
      return ['TB', 'TD', 'LR', 'RL', 'BT'];
    }
    return ['TB', 'LR', 'RL', 'BT'];
  }, [activeDiagramType, supportsInlineDirection]);
  const markdownNavEnabled =
    (isMarkdownMode || isMarkdownMermaidMode) && markdownMermaidBlocks.length > 1;
  const markdownNavLabel = markdownNavEnabled
    ? `${markdownMermaidActiveIndex + 1}/${markdownMermaidBlocks.length}`
    : '';
  const setMarkdownIndexFromPreview = useCallback(
    (index: number) => {
      onMarkdownMermaidActiveIndexChange(index);
      onActiveEditorTabChange('markdown_mermaid');
    },
    [onActiveEditorTabChange, onMarkdownMermaidActiveIndexChange]
  );
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
  const isBuildDocsMode = activeEditorTab === 'build_docs';

  const resolveSystemPromptForPath = (path: string) => {
    if (!path.startsWith(SYSTEM_PROMPT_DOC_PREFIX)) return '';
    const fileName = path.replace(SYSTEM_PROMPT_DOC_PREFIX, '');
    const mode = fileName.split('/').pop()?.replace(/\.md$/, '') ?? '';
    if (mode === 'chat' || mode === 'build' || mode === 'analyze' || mode === 'fix') {
      const useRaw = systemPromptRawByMode[mode] ?? false;
      const prompt = useRaw ? buildDocsSystemPrompts[mode]?.raw : buildDocsSystemPrompts[mode]?.redacted;
      return prompt || buildDocsSystemPrompts[mode]?.raw || 'No system prompt available.';
    }
    return 'No system prompt available.';
  };
  const activeBuildDoc =
    buildDocsActivePath.startsWith(SYSTEM_PROMPT_DOC_PREFIX)
      ? { path: buildDocsActivePath, text: resolveSystemPromptForPath(buildDocsActivePath) }
      : buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  const buildDocsHtml = useMemo(() => {
    if (!isBuildDocsMode) return '';
    const content = activeBuildDoc?.text ?? '';
    return content.trim() ? markdownRenderer.render(content) : '';
  }, [activeBuildDoc?.text, isBuildDocsMode, markdownRenderer]);


  const selectedInlineTheme = useMemo(() => {
    if (!isMarkdownMode) {
      return extractInlineThemeCommand(codeForRender).theme ?? '';
    }
    if (!markdownMermaidBlocks.length) return '';
    const themes = markdownMermaidBlocks.map((block) => extractInlineThemeCommand(block.code).theme ?? '');
    const first = themes[0] ?? '';
    return themes.every((value) => value === first) ? first : '';
  }, [codeForRender, isMarkdownMode, markdownMermaidBlocks]);

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
    markdownHtml,
    markdownRenderer,
  ]);

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
    mermaidState.isValid,
    theme,
  ]);

  useEffect(() => {
    if (isBuildDocsMode) return;
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

  return (
    <div className="h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
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
        showDirectionControl={!isMarkdownMode && supportsInlineDirection}
        showLookControl={supportsInlineLook || (isMarkdownMode && markdownMermaidBlocks.length > 0)}
        directionOptions={directionOptions}
        selectedInlineTheme={selectedInlineTheme}
        selectedInlineDirection={selectedInlineDirection}
        selectedInlineLook={selectedInlineLook}
        onSetInlineTheme={onSetInlineTheme}
        onSetInlineDirection={onSetInlineDirection}
        onSetInlineLook={onSetInlineLook}
        codeForRender={codeForRender}
        isFullScreen={isFullScreen}
        onToggleFullScreen={onToggleFullScreen}
        svgMarkup={svgMarkup}
        isExporting={isExporting}
        onExportSvg={exportSvg}
        onExportPng={exportPng}
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
        zoomPercent={zoomPercent}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
        onFitToViewport={fitToViewport}
        hasBuildDocs={Boolean(activeBuildDoc?.text)}
      />
    </div>
  );
};

export default PreviewColumn;
