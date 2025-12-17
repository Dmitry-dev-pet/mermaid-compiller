import React, { useCallback, useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { RotateCcw, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { MermaidState } from '../types';

interface PreviewColumnProps {
  mermaidState: MermaidState;
  theme: 'light' | 'dark';
}

type ViewBox = { x: number; y: number; width: number; height: number };

const MIN_SCALE = 0.15;
const MAX_SCALE = 6;
const FIT_PADDING_RATIO = 0.05;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const PreviewColumn: React.FC<PreviewColumnProps> = ({ mermaidState, theme }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgMountRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [fitViewBox, setFitViewBox] = useState<ViewBox | null>(null);
  const [currentViewBox, setCurrentViewBox] = useState<ViewBox | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const fitViewBoxRef = useRef<ViewBox | null>(null);
  const currentViewBoxRef = useRef<ViewBox | null>(null);
  const panStartRef = useRef<{ startViewBox: ViewBox; startPoint: { x: number; y: number } } | null>(null);

  useEffect(() => {
    fitViewBoxRef.current = fitViewBox;
  }, [fitViewBox]);

  useEffect(() => {
    currentViewBoxRef.current = currentViewBox;
  }, [currentViewBox]);

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const applyViewBox = useCallback((vb: ViewBox, opts?: { setAsFit?: boolean }) => {
    const svg = svgRef.current;
    if (!svg) return;

    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    currentViewBoxRef.current = vb;
    setCurrentViewBox(vb);

    if (opts?.setAsFit) {
      fitViewBoxRef.current = vb;
      setFitViewBox(vb);
    }
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
    const vb = computeFitViewBoxFromBBox();
    if (!vb) return;
    applyViewBox(vb, { setAsFit: true });
    setIsPanning(false);
  }, [applyViewBox, computeFitViewBoxFromBBox]);

  const resetView = useCallback(() => {
    const fit = fitViewBoxRef.current;
    if (!fit) return;
    applyViewBox(fit);
    setIsPanning(false);
  }, [applyViewBox]);

  const zoomAtClientPoint = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const fit = fitViewBoxRef.current;
      const cur = currentViewBoxRef.current;
      if (!fit || !cur) return;

      const p = getSvgPoint(clientX, clientY);
      if (!p) return;

      const currentScale = fit.width / cur.width;
      const nextScale = clamp(currentScale * factor, MIN_SCALE, MAX_SCALE);
      const effectiveFactor = nextScale / currentScale;

      const nextWidth = cur.width / effectiveFactor;
      const nextHeight = cur.height / effectiveFactor;

      const relX = cur.width > 0 ? (p.x - cur.x) / cur.width : 0.5;
      const relY = cur.height > 0 ? (p.y - cur.y) / cur.height : 0.5;

      const nextX = p.x - relX * nextWidth;
      const nextY = p.y - relY * nextHeight;

      applyViewBox({ x: nextX, y: nextY, width: nextWidth, height: nextHeight });
    },
    [applyViewBox, getSvgPoint]
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAtClientPoint]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!svgMarkup) return;
      if (e.button !== 0) return;
      if (!currentViewBoxRef.current) return;

      const p = getSvgPoint(e.clientX, e.clientY);
      if (!p) return;

      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      panStartRef.current = { startViewBox: currentViewBoxRef.current, startPoint: p };
      setIsPanning(true);
    },
    [getSvgPoint, svgMarkup]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = panStartRef.current;
      if (!start) return;

      const p = getSvgPoint(e.clientX, e.clientY);
      if (!p) return;

      const dx = p.x - start.startPoint.x;
      const dy = p.y - start.startPoint.y;

      applyViewBox({
        x: start.startViewBox.x - dx,
        y: start.startViewBox.y - dy,
        width: start.startViewBox.width,
        height: start.startViewBox.height,
      });
    },
    [applyViewBox, getSvgPoint]
  );

  const handlePointerUpOrCancel = useCallback(() => {
    panStartRef.current = null;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!mermaidState.isValid || !mermaidState.code.trim()) {
        if (!mermaidState.code.trim()) {
          setSvgMarkup('');
          setFitViewBox(null);
          setCurrentViewBox(null);
          fitViewBoxRef.current = null;
          currentViewBoxRef.current = null;
          svgRef.current = null;
          if (svgMountRef.current) svgMountRef.current.replaceChildren();
        }
        return;
      }

      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, mermaidState.code);
        setSvgMarkup(svg);
      } catch (error) {
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

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    svgEl.setAttribute('width', '100%');
    svgEl.setAttribute('height', '100%');
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    (svgEl as unknown as SVGSVGElement).style.display = 'block';
    (svgEl as unknown as SVGSVGElement).style.maxWidth = 'none';
    (svgEl as unknown as SVGSVGElement).style.maxHeight = 'none';

    mount.replaceChildren(svgEl);
    svgRef.current = svgEl as unknown as SVGSVGElement;

    let rafId = 0;
    let attempts = 0;
    const tryAutoFit = () => {
      attempts += 1;
      const vb = computeFitViewBoxFromBBox();
      if (vb) {
        applyViewBox(vb, { setAsFit: true });
        setIsPanning(false);
        return;
      }
      if (attempts < 30) rafId = requestAnimationFrame(tryAutoFit);
    };

    rafId = requestAnimationFrame(tryAutoFit);
    return () => cancelAnimationFrame(rafId);
  }, [applyViewBox, computeFitViewBoxFromBBox, svgMarkup]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      if (!svgMarkup) return;
      if (!fitViewBoxRef.current || !currentViewBoxRef.current) return;
      e.preventDefault();

      const factor = Math.exp(-e.deltaY * 0.001);
      zoomAtClientPoint(e.clientX, e.clientY, factor);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => viewport.removeEventListener('wheel', onWheel, true);
  }, [svgMarkup, zoomAtClientPoint]);

  const zoomPercent = (() => {
    const fit = fitViewBox;
    const cur = currentViewBox;
    if (!fit || !cur) return 100;
    return Math.round((fit.width / cur.width) * 100);
  })();

  return (
    <div className="h-full flex flex-col bg-slate-50/30 dark:bg-slate-900/30">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between gap-3">
        <div>Preview</div>

        <div className="flex items-center gap-1.5 normal-case tracking-normal">
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono w-12 text-right">{zoomPercent}%</span>

          <button
            type="button"
            onClick={() => zoomByFactor(1 / 1.2)}
            disabled={!svgMarkup}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            onClick={() => zoomByFactor(1.2)}
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
            disabled={!svgMarkup || !fitViewBox}
            className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`flex-1 relative overflow-hidden flex items-center justify-center ${svgMarkup ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        style={{ touchAction: 'none' }}
      >
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
