import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';

export type MermaidDiagramTypeHint = 'flowchart' | 'er' | 'sequence' | 'unknown';

export type ExcalidrawElementSkeleton = Record<string, unknown>;

export const detectMermaidDiagramTypeHint = (code: string): MermaidDiagramTypeHint => {
  if (!code.trim()) return 'unknown';
  const lines = code.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('%%')) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('flowchart') || lower.startsWith('graph')) return 'flowchart';
    if (lower.startsWith('erdiagram')) return 'er';
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

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const type = asString(item.type);
    if (!type) continue;

    if (type === 'line' || type === 'arrow') {
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      const pointsRaw = item.points;
      const points =
        Array.isArray(pointsRaw)
          ? pointsRaw
            .map((p) => (Array.isArray(p) && p.length === 2 ? [Number(p[0]), Number(p[1])] : null))
            .filter((p): p is [number, number] => Boolean(p) && p.every((n) => Number.isFinite(n)))
          : [];
      if (x !== null && y !== null && points.length >= 2) {
        const labelRaw = isRecord(item.label) ? item.label : null;
        const labelText = labelRaw ? asString(labelRaw.text) : null;
        const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
        const label =
          labelText && labelText.trim()
            ? {
              text: labelText,
              ...(labelFontSize ? { fontSize: labelFontSize } : {}),
            }
            : undefined;

        out.push({
          type,
          x,
          y,
          points,
          ...(asString(item.strokeColor) ? { strokeColor: String(item.strokeColor) } : {}),
          ...(asNumber(item.strokeWidth) !== null ? { strokeWidth: Number(item.strokeWidth) } : {}),
          ...(asStrokeStyle(item.strokeStyle) ? { strokeStyle: asStrokeStyle(item.strokeStyle) } : {}),
          ...(label ? { label } : {}),
        });
        continue;
      }

      const startX = asNumber(item.startX);
      const startY = asNumber(item.startY);
      const endX = asNumber(item.endX);
      const endY = asNumber(item.endY);
      if (startX === null || startY === null || endX === null || endY === null) continue;
      const fallbackPoints = [[0, 0], [endX - startX, endY - startY]] as const;

      const strokeColor = asString(item.strokeColor);
      const strokeWidth = asNumber(item.strokeWidth);
      const strokeStyle = asStrokeStyle(item.strokeStyle);

      const labelRaw = isRecord(item.label) ? item.label : null;
      const labelText = labelRaw ? asString(labelRaw.text) : null;
      const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
      const label =
        labelText && labelText.trim()
          ? {
            text: labelText,
            ...(labelFontSize ? { fontSize: labelFontSize } : {}),
          }
          : undefined;

      out.push({
        type,
        x: startX,
        y: startY,
        points: fallbackPoints,
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth !== null ? { strokeWidth } : {}),
        ...(strokeStyle ? { strokeStyle } : {}),
        ...(label ? { label } : {}),
      });
      continue;
    }

    if (type === 'rectangle' || type === 'ellipse') {
      const x = asNumber(item.x);
      const y = asNumber(item.y);
      if (x === null || y === null) continue;
      const width = asNumber(item.width);
      const height = asNumber(item.height);
      const strokeColor = asString(item.strokeColor);
      const strokeWidth = asNumber(item.strokeWidth);
      const strokeStyle = asStrokeStyle(item.strokeStyle);
      const backgroundColor = asString(item.backgroundColor) ?? asString(item.bgColor);

      const labelRaw = isRecord(item.label) ? item.label : null;
      const labelText = labelRaw ? asString(labelRaw.text) : null;
      const labelFontSize = labelRaw ? asNumber(labelRaw.fontSize) : null;
      const label =
        labelText && labelText.trim()
          ? {
            text: labelText,
            ...(labelFontSize ? { fontSize: labelFontSize } : {}),
          }
          : undefined;

      out.push({
        type,
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(strokeColor ? { strokeColor } : {}),
        ...(strokeWidth !== null ? { strokeWidth } : {}),
        ...(strokeStyle ? { strokeStyle } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(label ? { label } : {}),
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
      const strokeColor = asString(item.strokeColor) ?? asString(item.color);
      out.push({
        type,
        text,
        x,
        y,
        ...(width !== null ? { width } : {}),
        ...(height !== null ? { height } : {}),
        ...(fontSize !== null ? { fontSize } : {}),
        ...(strokeColor ? { strokeColor } : {}),
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

export const parseMermaidToExcalidrawSkeletons = async (args: {
  mermaidCode: string;
  diagramTypeHint: MermaidDiagramTypeHint;
  themeVariables?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}): Promise<{ skeletons: ExcalidrawElementSkeleton[]; files: BinaryFiles }> => {
  const preprocessed = preprocessMermaidForExcalidraw(args.mermaidCode);
  const { elements, files } = await withTimeout(
    parseMermaidToExcalidraw(preprocessed, { themeVariables: args.themeVariables }),
    args.timeoutMs ?? 12000
  );
  const skeletons = normalizeMermaidToExcalidrawSkeletons(elements);

  if (isImageOnlySkeletons(skeletons) && (args.diagramTypeHint === 'flowchart' || args.diagramTypeHint === 'sequence')) {
    throw new Error('mermaid-to-excalidraw returned graphImage (image-only) for flowchart/sequence');
  }

  return { skeletons, files: (files ?? {}) as BinaryFiles };
};

