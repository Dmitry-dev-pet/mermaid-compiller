export type WhiteboardBundleV1 = {
  kind: 'mlg-whiteboard-bundle';
  v: 1;
  byBlock: Record<string, string | null>;
};

const normalizeByBlockRecord = (raw: unknown): Record<string, string | null> => {
  if (!raw || typeof raw !== 'object') return {};
  return Object.entries(raw as Record<string, unknown>).reduce<Record<string, string | null>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[k] = v;
    else if (v === null) acc[k] = null;
    return acc;
  }, {});
};

export const parseWhiteboardBundle = (raw: string | null): WhiteboardBundleV1 | null => {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    if (rec.kind !== 'mlg-whiteboard-bundle' || rec.v !== 1) return null;
    return {
      kind: 'mlg-whiteboard-bundle',
      v: 1,
      byBlock: normalizeByBlockRecord(rec.byBlock),
    };
  } catch {
    return null;
  }
};

export const ensureWhiteboardBundle = (raw: string | null, blockIndex: number): WhiteboardBundleV1 => {
  const existing = parseWhiteboardBundle(raw);
  if (existing) return existing;
  // Migration: if this revision stored a single Excalidraw scene, assume it
  // belonged to the currently active markdown block.
  if (raw?.trim()) {
    return {
      kind: 'mlg-whiteboard-bundle',
      v: 1,
      byBlock: { [String(blockIndex)]: raw },
    };
  }
  return { kind: 'mlg-whiteboard-bundle', v: 1, byBlock: {} };
};

export const resolveWhiteboardSceneForBlock = (raw: string | null, blockIndex: number): string | null => {
  const bundle = parseWhiteboardBundle(raw);
  if (!bundle) return null;
  return bundle.byBlock[String(blockIndex)] ?? null;
};

export const updateWhiteboardBundleForBlock = (
  raw: string | null,
  blockIndex: number,
  sceneJson: string | null
): string | null => {
  const bundle = ensureWhiteboardBundle(raw, blockIndex);
  bundle.byBlock[String(blockIndex)] = sceneJson?.trim() ? sceneJson : null;
  return JSON.stringify(bundle);
};
