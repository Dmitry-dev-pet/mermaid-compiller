export const readCssVarInt = (name: string): number => {
  try {
    const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name);
    const value = parseInt(raw, 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

export const centerScrollOnLikeExcalidraw = (args: {
  scenePoint: { x: number; y: number };
  viewportDimensions: { width: number; height: number };
  zoom: { value: number };
  offsets?: { left?: number; right?: number; top?: number; bottom?: number };
}) => {
  // Mirrors Excalidraw internal `centerScrollOn` logic.
  // Note: In Excalidraw, scroll values are in "scene units" and are affected by zoom.
  const z = args.zoom.value || 1;
  const left = args.offsets?.left ?? 0;
  const right = args.offsets?.right ?? 0;
  const top = args.offsets?.top ?? 0;
  const bottom = args.offsets?.bottom ?? 0;

  let scrollX = (args.viewportDimensions.width - right) / 2 / z - args.scenePoint.x;
  scrollX += left / 2 / z;

  let scrollY = (args.viewportDimensions.height - bottom) / 2 / z - args.scenePoint.y;
  scrollY += top / 2 / z;

  return { scrollX, scrollY };
};

export const clampScrollYToBounds = (args: {
  desiredScrollY: number;
  boundsMinY: number;
  boundsMaxY: number;
  viewportHeight: number;
  zoomValue: number;
  safeTopPx: number;
  safeBottomPx: number;
  padTopPx: number;
  padBottomPx: number;
}) => {
  const vh = args.viewportHeight;
  const z = args.zoomValue > 0 ? args.zoomValue : 1;
  if (!(vh > 0)) return args.desiredScrollY;

  // This follows Excalidraw's viewport bounds math used in its scrollbar logic.
  const viewportHeightWithZoom = vh / z;
  const viewportHeightDiff = vh - viewportHeightWithZoom;

  const padTopScene = args.padTopPx / z;
  const padBottomScene = args.padBottomPx / z;

  // Top-most: align viewportMinY to (boundsMinY - padTop).
  const maxScrollY = -args.boundsMinY + padTopScene + viewportHeightDiff / 2 + args.safeTopPx;
  // Bottom-most: align viewportMaxY to (boundsMaxY + padBottom).
  const minScrollY =
    -args.boundsMaxY
    - padBottomScene
    + viewportHeightDiff / 2
    + args.safeTopPx
    + viewportHeightWithZoom
    - args.safeBottomPx;

  if (minScrollY > maxScrollY) return maxScrollY;
  return Math.max(minScrollY, Math.min(maxScrollY, args.desiredScrollY));
};

export const VIEW_SCROLL_PAD_TOP_PX = 1200;
export const VIEW_SCROLL_PAD_BOTTOM_PX = 600;
