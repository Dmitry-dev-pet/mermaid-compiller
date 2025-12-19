import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Maximize2, Minimize2, RotateCcw, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import svgPanZoom from 'svg-pan-zoom';
import { MermaidState } from '../types';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
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

const PreviewColumn: React.FC<PreviewColumnProps> = ({ mermaidState, theme, isFullScreen, onToggleFullScreen }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const panZoomRef = useRef<ReturnType<typeof svgPanZoom> | null>(null);
  const baseZoomRef = useRef<number | null>(null);
  const basePanRef = useRef<{ x: number; y: number } | null>(null);

  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [canReset, setCanReset] = useState(false);

  const updateZoomPercent = useCallback((nextZoom?: number) => {
    const base = baseZoomRef.current;
    const instance = panZoomRef.current;
    const zoom = typeof nextZoom === 'number' ? nextZoom : instance?.getZoom();

    if (!base || !zoom) {
      setZoomPercent(100);
      return;
    }

    setZoomPercent(Math.max(1, Math.round((zoom / base) * 100)));
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
    baseZoomRef.current = instance.getZoom();
    basePanRef.current = instance.getPan();
    setZoomPercent(100);
    setCanReset(true);
  }, []);

  const resetView = useCallback(() => {
    const instance = panZoomRef.current;
    const baseZoom = baseZoomRef.current;
    const basePan = basePanRef.current;
    if (!instance || !baseZoom || !basePan) return;

    instance.zoom(baseZoom);
    instance.pan(basePan);
    updateZoomPercent(baseZoom);
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
    const renderDiagram = async () => {
      if (!mermaidState.isValid || !mermaidState.code.trim()) {
        if (!mermaidState.code.trim()) {
          setSvgMarkup('');
          setRenderError(null);
          bindFunctionsRef.current = null;
          svgRef.current = null;
          panZoomRef.current?.destroy();
          panZoomRef.current = null;
          baseZoomRef.current = null;
          basePanRef.current = null;
          setZoomPercent(100);
          setCanReset(false);
          if (svgMountRef.current) svgMountRef.current.replaceChildren();
        }
        return;
      }
      try {
        setRenderError(null);
        const id = `mermaid-${Date.now()}`;
        const { svg, bindFunctions } = await mermaid.render(id, mermaidState.code);
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
  }, [mermaidState.code, mermaidState.isValid, theme]);

  useEffect(() => {
    if (!svgMarkup) return;
    const mount = svgMountRef.current;
    if (!mount) return;

    // Use the browser's SVG/HTML parser (better for foreignObject-heavy diagrams like C4).
    mount.innerHTML = svgMarkup;
    const svgEl = mount.querySelector('svg');
    if (!svgEl) return;

    panZoomRef.current?.destroy();
    panZoomRef.current = null;
    baseZoomRef.current = null;
    basePanRef.current = null;
    setZoomPercent(100);
    setCanReset(false);

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
          baseZoomRef.current = instance.getZoom();
          basePanRef.current = instance.getPan();
          setZoomPercent(100);
          setCanReset(true);
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
      baseZoomRef.current = null;
      basePanRef.current = null;
    };
  }, [computeFitViewBoxFromBBox, svgMarkup, updateZoomPercent]);

  useEffect(() => {
    if (!svgMarkup) return;
    if (!panZoomRef.current) return;
    const rafId = requestAnimationFrame(() => {
      fitToViewport();
    });
    return () => cancelAnimationFrame(rafId);
  }, [fitToViewport, isFullScreen, svgMarkup]);

  return (
    <div className="h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between gap-3">
        <div>Preview</div>
        <div className="flex items-center gap-1.5 normal-case tracking-normal">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono w-12 text-right">{zoomPercent}%</span>

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
            disabled={!svgMarkup}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            onClick={zoomIn}
            disabled={!svgMarkup}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>

          <button
            type="button"
            onClick={fitToViewport}
            disabled={!svgMarkup}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Fit (center & maximize)"
          >
            <Scan size={14} />
          </button>

          <button
            type="button"
            onClick={resetView}
            disabled={!svgMarkup || !canReset}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
      >

        {renderError && mermaidState.status !== 'invalid' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Render failed</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {renderError}
              </p>
            </div>
          </div>
        )}
        {mermaidState.status === 'invalid' && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
            <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
              <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
              <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
                {mermaidState.errorMessage || 'Syntax Error'}
              </p>
            </div>
          </div>
        )}

        {!mermaidState.code.trim() && (
          <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
        )}

        {svgMarkup && <div ref={svgMountRef} className="absolute inset-0" />}
      </div>
    </div>
  );
};

export default PreviewColumn;
