declare module 'svg-pan-zoom' {
  export type SvgPanZoomPan = { x: number; y: number };

  export type SvgPanZoomOptions = {
    panEnabled?: boolean;
    zoomEnabled?: boolean;
    controlIconsEnabled?: boolean;
    fit?: boolean;
    center?: boolean;
    minZoom?: number;
    maxZoom?: number;
    zoomScaleSensitivity?: number;
    dblClickZoomEnabled?: boolean;
    mouseWheelZoomEnabled?: boolean;
    preventMouseEventsDefault?: boolean;
    eventsListenerElement?: Element;
    beforePan?: (oldPan: SvgPanZoomPan, newPan: SvgPanZoomPan) => SvgPanZoomPan;
    onZoom?: (newZoom: number) => void;
    onPan?: (newPan: SvgPanZoomPan) => void;
  };

  export type SvgPanZoomInstance = {
    destroy(): void;
    resize(): void;
    fit(): void;
    center(): void;
    zoomIn(): void;
    zoomOut(): void;
    zoom(zoomLevel: number): void;
    getZoom(): number;
    pan(pan: SvgPanZoomPan): void;
    getPan(): SvgPanZoomPan;
  };

  export default function svgPanZoom(svg: SVGSVGElement, options?: SvgPanZoomOptions): SvgPanZoomInstance;
}
