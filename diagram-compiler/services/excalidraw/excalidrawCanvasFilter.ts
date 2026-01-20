type Rgb = { r: number; g: number; b: number };

const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));

const parseCssColorToRgb = (color: string): Rgb | null => {
  const raw = color.trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (![3, 6].includes(hex.length)) return null;
    const full = hex.length === 3 ? hex.split('').map((c) => `${c}${c}`).join('') : hex;
    const int = Number.parseInt(full, 16);
    if (!Number.isFinite(int)) return null;
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
  }
  const m = raw.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/i);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return null;
  return { r, g, b };
};

const rgbToHex = (rgb: Rgb): string => {
  const to = (n: number) => clamp255(n).toString(16).padStart(2, '0');
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
};

// Match Excalidraw dark canvas filter from `@excalidraw/excalidraw/index.css`:
// `.excalidraw.theme--dark canvas { filter: invert(93%) hue-rotate(180deg); }`
const DARK_CANVAS_INVERT = 0.93;
const DARK_CANVAS_HUE_ROTATE_DEG = 180;

const applyInvert = (rgb: Rgb, p: number): Rgb => {
  // new = old + p * (255 - 2 * old)
  const a = 1 - 2 * p;
  const b = 255 * p;
  return {
    r: clamp255(a * rgb.r + b),
    g: clamp255(a * rgb.g + b),
    b: clamp255(a * rgb.b + b),
  };
};

const removeInvert = (rgb: Rgb, p: number): Rgb => {
  // old = (new - 255p) / (1 - 2p)
  const denom = 1 - 2 * p;
  if (Math.abs(denom) < 1e-6) return rgb;
  const b = 255 * p;
  return {
    r: clamp255((rgb.r - b) / denom),
    g: clamp255((rgb.g - b) / denom),
    b: clamp255((rgb.b - b) / denom),
  };
};

// CSS `hue-rotate()` is a matrix transform (SVG/CSS filter spec), not an HSL hue shift.
const applyCssHueRotate = (rgb: Rgb, deg: number): Rgb => {
  const rad = (deg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const m00 = 0.213 + cosA * 0.787 - sinA * 0.213;
  const m01 = 0.715 - cosA * 0.715 - sinA * 0.715;
  const m02 = 0.072 - cosA * 0.072 + sinA * 0.928;

  const m10 = 0.213 - cosA * 0.213 + sinA * 0.143;
  const m11 = 0.715 + cosA * 0.285 + sinA * 0.14;
  const m12 = 0.072 - cosA * 0.072 - sinA * 0.283;

  const m20 = 0.213 - cosA * 0.213 - sinA * 0.787;
  const m21 = 0.715 - cosA * 0.715 + sinA * 0.715;
  const m22 = 0.072 + cosA * 0.928 + sinA * 0.072;

  return {
    r: clamp255((r * m00 + g * m01 + b * m02) * 255),
    g: clamp255((r * m10 + g * m11 + b * m12) * 255),
    b: clamp255((r * m20 + g * m21 + b * m22) * 255),
  };
};

export const applyExcalidrawDarkCanvasFilterToColor = (color: string): string | null => {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return null;
  const inverted = applyInvert(rgb, DARK_CANVAS_INVERT);
  const rotated = applyCssHueRotate(inverted, DARK_CANVAS_HUE_ROTATE_DEG);
  return rgbToHex(rotated);
};

export const removeExcalidrawDarkCanvasFilterFromColor = (color: string): string | null => {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) return null;
  const unrotated = applyCssHueRotate(rgb, -DARK_CANVAS_HUE_ROTATE_DEG);
  const uninverted = removeInvert(unrotated, DARK_CANVAS_INVERT);
  return rgbToHex(uninverted);
};

export const resolveExcalidrawStoredCanvasColor = (visible: string, theme: 'light' | 'dark'): string | null => {
  const trimmed = visible.trim();
  if (!trimmed) return null;
  if (theme === 'light') return trimmed;
  return removeExcalidrawDarkCanvasFilterFromColor(trimmed) ?? trimmed;
};

export const resolveExcalidrawVisibleCanvasColor = (stored: string, theme: 'light' | 'dark'): string | null => {
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (theme === 'light') return trimmed;
  return applyExcalidrawDarkCanvasFilterToColor(trimmed) ?? trimmed;
};
