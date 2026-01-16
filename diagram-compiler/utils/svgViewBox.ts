export type SvgViewBox = { x: number; y: number; width: number; height: number };

export const parseSvgViewBox = (value: string | null): SvgViewBox | null => {
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
