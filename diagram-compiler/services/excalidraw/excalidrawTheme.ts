export const CANVAS_BG_DARK = '#1e1e1e';
export const CANVAS_BG_LIGHT = '#ffffff';

const parseHexColor = (color: string): { r: number; g: number; b: number } | null => {
  const raw = color.trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (![3, 6].includes(hex.length)) return null;
  const full = hex.length === 3 ? hex.split('').map((c) => `${c}${c}`).join('') : hex;
  const int = Number.parseInt(full, 16);
  if (!Number.isFinite(int)) return null;
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

const parseRgbColor = (color: string): { r: number; g: number; b: number } | null => {
  const m = color.trim().match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/i);
  if (!m) return null;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) return null;
  return { r, g, b };
};

export const isDarkColor = (color: string): boolean | null => {
  const rgb = parseHexColor(color) ?? parseRgbColor(color);
  if (!rgb) return null;
  // Perceived luminance (0..255).
  const l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return l < 128;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const applyMermaidThemeToExcalidrawElements = <T,>(
  raw: readonly T[],
  opts: {
    backgroundColor: string | null;
    themeVariables: Record<string, string | number | boolean> | null;
    uiTheme: 'light' | 'dark';
    forceTheme?: boolean;
  }
): T[] => {
  const elements = Array.isArray(raw) ? [...raw] : [];
  const vars = opts.themeVariables ?? null;
  const fromVarsBackground = typeof vars?.background === 'string' ? vars.background.trim() : '';
  const bg = (opts.backgroundColor?.trim() ?? '') || fromVarsBackground;
  const darkModeVar = typeof vars?.darkMode === 'boolean' ? vars.darkMode : null;
  const bgDark = (bg ? isDarkColor(bg) : null) ?? darkModeVar ?? (opts.uiTheme === 'dark');

  const defaults = bgDark
    ? { line: '#cbd5e1', text: '#e5e7eb', fill: 'transparent' }
    : { line: '#0f172a', text: '#0f172a', fill: 'transparent' };

  const lineColor =
    opts.forceTheme
      ? defaults.line
      : (typeof vars?.lineColor === 'string' && vars.lineColor.trim()) ? String(vars.lineColor).trim()
        : defaults.line;
  const textColor =
    opts.forceTheme
      ? defaults.text
      : (typeof vars?.primaryTextColor === 'string' && vars.primaryTextColor.trim()) ? String(vars.primaryTextColor).trim()
        : defaults.text;
  const nodeFill =
    opts.forceTheme
      ? defaults.fill
      : (typeof vars?.primaryColor === 'string' && vars.primaryColor.trim()) ? String(vars.primaryColor).trim()
        : defaults.fill;

  const shouldFixContrast = (color: unknown): boolean => {
    if (typeof color !== 'string') return true;
    const trimmed = color.trim();
    if (!trimmed) return true;
    const dark = isDarkColor(trimmed);
    if (dark === null) return false;
    return bgDark ? dark : !dark;
  };

  return elements.map((el) => {
    if (!isRecord(el)) return el;
    const type = typeof el.type === 'string' ? el.type : '';
    if (!type) return el;

    // Keep images untouched.
    if (type === 'image') return el;

    const next: Record<string, unknown> = { ...el, locked: false };
    if (type === 'text') {
      if (opts.forceTheme || shouldFixContrast(el.strokeColor)) {
        next.strokeColor = textColor;
      }
      return next as T;
    }

    if (type === 'rectangle' || type === 'diamond' || type === 'ellipse') {
      if (opts.forceTheme || shouldFixContrast(el.strokeColor)) {
        next.strokeColor = lineColor;
      }
      if (opts.forceTheme || typeof el.backgroundColor !== 'string' || el.backgroundColor === 'transparent') {
        next.backgroundColor = nodeFill;
      }
      return next as T;
    }

    if (type === 'line' || type === 'arrow') {
      if (opts.forceTheme || shouldFixContrast(el.strokeColor)) {
        next.strokeColor = lineColor;
      }
      return next as T;
    }

    return next as T;
  });
};

