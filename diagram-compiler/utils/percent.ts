export const clampPercent = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
};

export const remainingPercentFromUsedPercent = (usedPercent: unknown): number | null => {
  const used = clampPercent(usedPercent);
  if (used === null) return null;
  return 100 - used;
};

export const sumClampedPercents = (values: unknown[]): { sum: number; count: number } => {
  let sum = 0;
  let count = 0;
  values.forEach((value) => {
    const pct = clampPercent(value);
    if (pct === null) return;
    sum += pct;
    count += 1;
  });
  return { sum, count };
};
