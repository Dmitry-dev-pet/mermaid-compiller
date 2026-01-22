import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import svgPanZoom from 'svg-pan-zoom';
import { parseSvgViewBox } from '../../utils/svgViewBox';

type UseSvgPanZoomArgs = {
  svgMarkup: string;
  svgMountRef: RefObject<HTMLDivElement>;
  enabled: boolean;
  bindFunctionsRef?: MutableRefObject<((element: Element) => void) | null>;
};

type ViewBox = { x: number; y: number; width: number; height: number };

const FIT_PADDING_RATIO = 0.05;

export const useSvgPanZoom = ({ svgMarkup, svgMountRef, enabled, bindFunctionsRef }: UseSvgPanZoomArgs) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const panZoomRef = useRef<ReturnType<typeof svgPanZoom> | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

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

  const zoomIn = useCallback(() => {
    applyPreviewZoom(zoomPercent + 10);
  }, [applyPreviewZoom, zoomPercent]);

  const zoomOut = useCallback(() => {
    applyPreviewZoom(zoomPercent - 10);
  }, [applyPreviewZoom, zoomPercent]);

  const syncZoomPercent = useCallback((nextPercent: number) => {
    const instance = panZoomRef.current;
    if (!instance) return;
    const nextZoom = nextPercent / 100;
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
  }, [updateZoomPercent]);

  useEffect(() => {
    if (!enabled) {
      safeDestroyPanZoom();
      if (svgMountRef.current) svgMountRef.current.replaceChildren();
      svgRef.current = null;
      setZoomPercent(100);
      return;
    }
    if (!svgMarkup) {
      safeDestroyPanZoom();
      if (svgMountRef.current) svgMountRef.current.replaceChildren();
      svgRef.current = null;
      setZoomPercent(100);
      return;
    }

    const mount = svgMountRef.current;
    if (!mount) return;

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

    try {
      bindFunctionsRef?.current?.(mount);
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
          const zoomInstance = panZoomRef.current;
          if (!zoomInstance) return;
          const isZoomGesture = event.ctrlKey || event.metaKey;
          if (!isZoomGesture) {
            event.preventDefault();
            try {
              zoomInstance.panBy({ x: -event.deltaX, y: -event.deltaY });
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
            zoomInstance.zoomAtPointBy(scale, point);
            updateZoomPercent(zoomInstance.getZoom());
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
  }, [
    bindFunctionsRef,
    computeFitViewBoxFromBBox,
    enabled,
    safeDestroyPanZoom,
    svgMarkup,
    svgMountRef,
    updateZoomPercent,
  ]);

  return {
    svgRef,
    zoomPercent,
    setZoomPercent,
    zoomIn,
    zoomOut,
    fitToViewport,
    syncZoomPercent,
    destroyPanZoom: safeDestroyPanZoom,
  };
};
