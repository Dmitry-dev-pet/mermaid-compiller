import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';

export type MermaidDiagramTypeHint = 'flowchart' | 'er' | 'sequence' | 'class' | 'unknown';

export type ExcalidrawElementSkeleton = Record<string, unknown>;

export const detectMermaidDiagramTypeHint = (code: string): MermaidDiagramTypeHint => {
  if (!code.trim()) return 'unknown';
  const normalized = stripYamlFrontmatter(code);
  const lines = normalized.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('%%')) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('flowchart') || lower.startsWith('graph')) return 'flowchart';
    if (lower.startsWith('erdiagram')) return 'er';
    if (lower.startsWith('classdiagram')) return 'class';
    if (lower.startsWith('sequencediagram')) return 'sequence';
    return 'unknown';
  }
  return 'unknown';
};

export const stripYamlFrontmatter = (code: string): string => {
  const lines = code.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && (lines[index]?.trim() ?? '') === '') index += 1;
  if ((lines[index]?.trim() ?? '') !== '---') return code;

  const start = index;
  index += 1;
  while (index < lines.length) {
    if ((lines[index]?.trim() ?? '') === '---') {
      const rest = [...lines.slice(0, start), ...lines.slice(index + 1)];
      return rest.join('\n');
    }
    index += 1;
  }
  return code;
};

export const stripMermaidInitDirectives = (code: string): string => {
  // Mermaid init directives are comments like: %%{init: {...}}%%
  return code
    .split(/\r?\n/)
    .filter((line) => !/^\s*%%\{.*\binit\s*:.*\}%%\s*$/.test(line))
    .join('\n')
    .trim();
};

export const preprocessMermaidForExcalidraw = (code: string): string => {
  return stripMermaidInitDirectives(stripYamlFrontmatter(code)).replace(/<br\s*\/?>/gi, '');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asNumber = (value: unknown): number | null => {
  if (typeof value !== 'number') return null;
  return Number.isFinite(value) ? value : null;
};

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const asStrokeStyle = (value: unknown): 'solid' | 'dashed' | 'dotted' | undefined => {
  const raw = typeof value === 'string' ? value : '';
  if (raw === 'solid' || raw === 'dashed' || raw === 'dotted') return raw;
  return undefined;
};

export const normalizeMermaidToExcalidrawSkeletons = (raw: unknown): ExcalidrawElementSkeleton[] => {
  if (!Array.isArray(raw)) return [];
  const out: ExcalidrawElementSkeleton[] = [];

  const normalizeLabel = (value: unknown): Record<string, unknown> | undefined => {
    if (!isRecord(value)) return undefined;
    const text = asString(value.text);
    if (!text?.trim()) return undefined;
    return { ...value, text };
  };

  const normalizePoints = (pointsRaw: unknown): Array<[number, number]> => {
    if (!Array.isArray(pointsRaw)) return [];
    return pointsRaw
      .map((p) => (Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : null))
      .filter((p): p is [number, number] => Boolean(p) && p.every((n) => Number.isFinite(n)));
  };

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = asString(item.type);
    if (!type) continue;

    if (type === 'line' || type === 'arrow') {
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      const points = normalizePoints(item.points);

      // Pass-through the modern skeleton format when possible.
      if (x !== null && y !== null && points.length >= 2) {
        out.push({
          ...item,
          type,
          x,
          y,
          points,
          ...(asStrokeStyle(item.strokeStyle) ? { strokeStyle: asStrokeStyle(item.strokeStyle) } : {}),
          ...(normalizeLabel(item.label) ? { label: normalizeLabel(item.label) } : {}),
        });
        continue;
      }

      // Legacy skeleton format (startX/startY/endX/endY).
      const startX = asNumber(item.startX);
      const startY = asNumber(item.startY);
      const endX = asNumber(item.endX);
      const endY = asNumber(item.endY);
      if (startX === null || startY === null || endX === null || endY === null) continue;
      const fallbackPoints = [[0, 0], [endX - startX, endY - startY]] as const;

      out.push({
        ...item,
        type,
        x: startX,
        y: startY,
        points: fallbackPoints,
        ...(asStrokeStyle(item.strokeStyle) ? { strokeStyle: asStrokeStyle(item.strokeStyle) } : {}),
        ...(normalizeLabel(item.label) ? { label: normalizeLabel(item.label) } : {}),
      });
      continue;
    }

    if (type === 'rectangle' || type === 'ellipse' || type === 'diamond') {
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      if (x === null || y === null) continue;
      const width = asNumber(item.width);
      const height = asNumber(item.height);
      out.push({
        ...item,
        type,
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(asStrokeStyle(item.strokeStyle) ? { strokeStyle: asStrokeStyle(item.strokeStyle) } : {}),
        ...(normalizeLabel(item.label) ? { label: normalizeLabel(item.label) } : {}),
      });
      continue;
    }

    if (type === 'text') {
      const text = asString(item.text) ?? '';
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      if (x === null || y === null) continue;
      const width = asNumber(item.width);
      const height = asNumber(item.height);
      const fontSize = asNumber(item.fontSize);
      out.push({
        ...item,
        type,
        text,
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(fontSize !== null ? { fontSize } : {}),
      });
      continue;
    }

    if (type === 'image') {
      out.push({ ...item });
      continue;
    }
  }

  return out;
};

export const isImageOnlySkeletons = (skeletons: readonly ExcalidrawElementSkeleton[]): boolean => {
  return skeletons.length > 0 && skeletons.every((s) => s.type === 'image');
};

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    let done = false;
    const finishResolve = (value: T) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const finishReject = (error: unknown) => {
      if (done) return;
      done = true;
      reject(error);
    };
    const timer = setTimeout(() => finishReject(new Error(`Timeout after ${ms}ms`)), ms);
    promise.then((value) => {
      clearTimeout(timer);
      finishResolve(value);
    }).catch((error) => {
      clearTimeout(timer);
      finishReject(error);
    });
  });
};

const withSilencedConsoleLogs = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const originalLog = console.log;
  const originalDebug = console.debug;
  const originalInfo = console.info;

  try {
    (console as unknown as { log: (...args: unknown[]) => void }).log = () => {};
    (console as unknown as { debug: (...args: unknown[]) => void }).debug = () => {};
    (console as unknown as { info: (...args: unknown[]) => void }).info = () => {};
    return await fn();
  } finally {
    (console as unknown as { log: (...args: unknown[]) => void }).log = originalLog;
    (console as unknown as { debug: (...args: unknown[]) => void }).debug = originalDebug;
    (console as unknown as { info: (...args: unknown[]) => void }).info = originalInfo;
  }
};

export const parseMermaidToExcalidrawSkeletons = async (args: {
  mermaidCode: string;
  diagramTypeHint: MermaidDiagramTypeHint;
  themeVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<{ skeletons: ExcalidrawElementSkeleton[]; files: BinaryFiles }> => {
  const preprocessed = preprocessMermaidForExcalidraw(args.mermaidCode);
  const { elements, files } = await withSilencedConsoleLogs(async () => {
    return await withTimeout(
      parseMermaidToExcalidraw(preprocessed, { themeVariables: args.themeVariables }),
      args.timeoutMs ?? 12000
    );
  });
  const skeletons = normalizeMermaidToExcalidrawSkeletons(elements);

  if (
    isImageOnlySkeletons(skeletons)
    && (args.diagramTypeHint === 'flowchart' || args.diagramTypeHint === 'sequence' || args.diagramTypeHint === 'class')
  ) {
    throw new Error('mermaid-to-excalidraw returned graphImage (image-only) for flowchart/sequence/class');
  }

  return { skeletons, files: (files ?? {}) as BinaryFiles };
};

export const parseMermaidToExcalidrawSkeletonsLenient = async (args: {
  mermaidCode: string;
  themeVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<{ skeletons: ExcalidrawElementSkeleton[]; files: BinaryFiles }> => {
  const preprocessed = preprocessMermaidForExcalidraw(args.mermaidCode);
  const { elements, files } = await withSilencedConsoleLogs(async () => {
    return await withTimeout(
      parseMermaidToExcalidraw(preprocessed, { themeVariables: args.themeVariables }),
      args.timeoutMs ?? 12000
    );
  });
  const skeletons = normalizeMermaidToExcalidrawSkeletons(elements);
  return { skeletons, files: (files ?? {}) as BinaryFiles };
};
