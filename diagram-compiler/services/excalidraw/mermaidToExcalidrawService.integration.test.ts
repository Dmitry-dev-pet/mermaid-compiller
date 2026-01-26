// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mermaid from 'mermaid';
import type { MermaidConfig } from 'mermaid';

import { parseMermaidToExcalidrawSkeletons } from './mermaidToExcalidrawService';

type BBox = { x: number; y: number; width: number; height: number };

const parseTranslate = (transform: string | null): { x: number; y: number } => {
  if (!transform) return { x: 0, y: 0 };
  const m = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (!m) return { x: 0, y: 0 };
  return { x: Number(m[1]) || 0, y: Number(m[2]) || 0 };
};

const toNumber = (v: string | null, fallback = 0): number => {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bboxUnion = (a: BBox | null, b: BBox | null): BBox | null => {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const bboxFromPoints = (points: string): BBox | null => {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 4) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const bboxFromPath = (d: string): BBox | null => {
  const tokens = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
  if (!tokens || tokens.length < 4) return null;
  const nums = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
  if (nums.length < 4) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!;
    const y = nums[i + 1]!;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const computeBBox = (el: Element): BBox => {
  const tag = el.tagName.toLowerCase();
  const { x: tx, y: ty } = parseTranslate(el.getAttribute('transform'));

  if (tag === 'rect' || tag === 'foreignobject') {
    const x = toNumber(el.getAttribute('x')) + tx;
    const y = toNumber(el.getAttribute('y')) + ty;
    const width = toNumber(el.getAttribute('width'));
    const height = toNumber(el.getAttribute('height'));
    return { x, y, width, height };
  }

  if (tag === 'circle') {
    const cx = toNumber(el.getAttribute('cx')) + tx;
    const cy = toNumber(el.getAttribute('cy')) + ty;
    const r = toNumber(el.getAttribute('r'));
    return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  }

  if (tag === 'ellipse') {
    const cx = toNumber(el.getAttribute('cx')) + tx;
    const cy = toNumber(el.getAttribute('cy')) + ty;
    const rx = toNumber(el.getAttribute('rx'));
    const ry = toNumber(el.getAttribute('ry'));
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }

  if (tag === 'line') {
    const x1 = toNumber(el.getAttribute('x1')) + tx;
    const y1 = toNumber(el.getAttribute('y1')) + ty;
    const x2 = toNumber(el.getAttribute('x2')) + tx;
    const y2 = toNumber(el.getAttribute('y2')) + ty;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const maxX = Math.max(x1, x2);
    const maxY = Math.max(y1, y2);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const from = bboxFromPoints(el.getAttribute('points') ?? '') ?? { x: 0, y: 0, width: 0, height: 0 };
    return { x: from.x + tx, y: from.y + ty, width: from.width, height: from.height };
  }

  if (tag === 'path') {
    const from = bboxFromPath(el.getAttribute('d') ?? '') ?? { x: 0, y: 0, width: 0, height: 0 };
    return { x: from.x + tx, y: from.y + ty, width: from.width, height: from.height };
  }

  if (tag === 'text') {
    const x = toNumber(el.getAttribute('x')) + tx;
    const y = toNumber(el.getAttribute('y')) + ty;
    const fontSize = Number.parseInt(getComputedStyle(el).fontSize || '', 10) || 16;
    const text = (el.textContent ?? '').trim();
    // Rough estimate is good enough for tests.
    const width = Math.max(1, text.length) * fontSize * 0.6;
    const height = fontSize * 1.1;
    return { x: x - width / 2, y: y - height, width, height };
  }

  // <g> or unknown: union children.
  let union: BBox | null = null;
  for (const child of Array.from(el.children)) {
    union = bboxUnion(union, computeBBox(child));
  }
  const resolved = union ?? { x: 0, y: 0, width: 0, height: 0 };
  return { x: resolved.x + tx, y: resolved.y + ty, width: resolved.width, height: resolved.height };
};

const installSvgBBoxPolyfill = () => {
  const proto = (globalThis as unknown as { SVGElement?: unknown }).SVGElement
    ? (SVGElement.prototype as unknown as Record<string, unknown>)
    : null;
  if (!proto) return;

  if (typeof proto.getBBox !== 'function') {
    proto.getBBox = function getBBoxPolyfill(this: Element): BBox {
      return computeBBox(this);
    };
  }

  // Some fallback paths use getBoundingClientRect; map it to bbox.
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function getBoundingClientRectPolyfill(this: Element) {
      const bb = computeBBox(this);
      return {
        x: bb.x,
        y: bb.y,
        width: bb.width,
        height: bb.height,
        top: bb.y,
        left: bb.x,
        right: bb.x + bb.width,
        bottom: bb.y + bb.height,
        toJSON: () => ({}),
      };
    };
  }
};

const installSvgPathLengthPolyfill = () => {
  const proto =
    ((globalThis as unknown as { SVGPathElement?: unknown }).SVGPathElement
      ? (SVGPathElement.prototype as unknown as Record<string, unknown>)
      : null)
    ?? ((globalThis as unknown as { SVGElement?: unknown }).SVGElement
      ? (SVGElement.prototype as unknown as Record<string, unknown>)
      : null);
  if (!proto) return;

  if (typeof proto.getTotalLength !== 'function') {
    const parsePathPoints = (el: Element) => {
      const d = el.getAttribute('d') ?? '';
      const tokens = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
      if (!tokens || tokens.length < 2) return [] as Array<{ x: number; y: number }>;
      const nums = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
      if (nums.length < 2) return [] as Array<{ x: number; y: number }>;
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        points.push({ x: nums[i]!, y: nums[i + 1]! });
      }
      return points;
    };

    proto.getTotalLength = function getTotalLengthPolyfill(this: Element): number {
      const points = parsePathPoints(this);
      if (points.length < 2) return 1;
      const d = this.getAttribute('d') ?? '';
      const tokens = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
      if (!tokens || tokens.length < 4) return 1;
      const nums = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
      if (nums.length < 4) return 1;
      let length = 0;
      for (let i = 0; i + 3 < nums.length; i += 2) {
        const x1 = nums[i]!;
        const y1 = nums[i + 1]!;
        const x2 = nums[i + 2]!;
        const y2 = nums[i + 3]!;
        length += Math.hypot(x2 - x1, y2 - y1);
      }
      return length || 1;
    };
  }

  if (typeof proto.getPointAtLength !== 'function') {
    proto.getPointAtLength = function getPointAtLengthPolyfill(this: Element, len: number) {
      const d = this.getAttribute('d') ?? '';
      const tokens = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
      if (!tokens || tokens.length < 2) return { x: 0, y: 0 };
      const nums = tokens.map((t) => Number(t)).filter((n) => Number.isFinite(n));
      if (nums.length < 2) return { x: 0, y: 0 };
      const points: Array<{ x: number; y: number }> = [];
      for (let i = 0; i + 1 < nums.length; i += 2) {
        points.push({ x: nums[i]!, y: nums[i + 1]! });
      }
      if (points.length === 1) return points[0];
      let remaining = Math.max(0, Number(len) || 0);
      for (let i = 0; i + 1 < points.length; i += 1) {
        const p1 = points[i]!;
        const p2 = points[i + 1]!;
        const segment = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (remaining <= segment) {
          const t = segment === 0 ? 0 : remaining / segment;
          return {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
          };
        }
        remaining -= segment;
      }
      return points[points.length - 1]!;
    };
  }
};

const patchMermaidInitialize = () => {
  const original: (config: MermaidConfig) => void = mermaid.initialize.bind(mermaid);
  mermaid.initialize = ((config: MermaidConfig) => {
    try {
      return original(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already registered')) return;
      throw error;
    }
  }) as typeof mermaid.initialize;
};

describe('mermaidToExcalidrawService (integration)', () => {
  let logSpy: ReturnType<typeof vi.spyOn> | null = null;
  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeAll(() => {
    if (process.env.DUMP_M2E === '1') return;
    // The upstream library can be noisy during parsing.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
  });

  installSvgBBoxPolyfill();
  installSvgPathLengthPolyfill();
  patchMermaidInitialize();

  const dump = (label: string, args: { skeletons: unknown[]; files: Record<string, unknown> }) => {
    if (process.env.DUMP_M2E !== '1') return;
    const counts = args.skeletons.reduce<Record<string, number>>((acc, el) => {
      const t = typeof el === 'object' && el ? String((el as { type?: unknown }).type ?? 'unknown') : 'unknown';
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    }, {});
    const filesSummary = Object.fromEntries(
      Object.entries(args.files ?? {}).map(([id, file]) => {
        const rec = file && typeof file === 'object' ? (file as Record<string, unknown>) : {};
        const dataURL = typeof rec.dataURL === 'string' ? rec.dataURL : '';
        return [
          id,
          {
            mimeType: rec.mimeType,
            dataURLChars: dataURL.length,
            dataURLPrefix: dataURL.slice(0, 64),
          },
        ];
      })
    );
    console.log(`\\n--- ${label} ---`);
    console.log(JSON.stringify({ counts, skeletons: args.skeletons, files: filesSummary }, null, 2));
  };

  it('converts flowchart to non-image skeletons', async () => {
    const code = `flowchart TD
  A[Start] --> B[End]
`;
    const { skeletons } = await parseMermaidToExcalidrawSkeletons({
      mermaidCode: code,
      diagramTypeHint: 'flowchart',
      timeoutMs: 20000,
    });
    dump('flowchart', { skeletons, files: {} });
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.type === 'image')).toBe(false);
    expect(skeletons.some((s) => s.type === 'rectangle' || s.type === 'ellipse' || s.type === 'diamond')).toBe(true);
    expect(skeletons.some((s) => s.type === 'arrow' || s.type === 'line')).toBe(true);
  });

  it('converts labeled flowchart (Cyrillic + edge labels) to non-image skeletons', async () => {
    const code = `flowchart TD
    A[Вербовка] --> B{Симуляция болезни?}
    B -->|Нет| C[Отправка на фронт]
    B -->|Да| D[Лазарет]
    D --> C
`;
    const { skeletons } = await parseMermaidToExcalidrawSkeletons({
      mermaidCode: code,
      diagramTypeHint: 'flowchart',
      timeoutMs: 20000,
    });
    dump('flowchart-cyrillic', { skeletons, files: {} });
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.type === 'image')).toBe(false);
    // Nodes + edges.
    expect(skeletons.some((s) => s.type === 'rectangle' || s.type === 'ellipse' || s.type === 'diamond')).toBe(true);
    expect(skeletons.some((s) => s.type === 'diamond')).toBe(true);
    expect(skeletons.some((s) => s.type === 'arrow' || s.type === 'line')).toBe(true);
    // Edge labels should exist either as arrow.label or separate text elements.
    const hasLabel =
      skeletons.some((s) => typeof (s as { label?: unknown }).label === 'object')
      || skeletons.some((s) => s.type === 'text' && typeof (s as { text?: unknown }).text === 'string' && ['Нет', 'Да'].includes((s as { text: string }).text));
    expect(hasLabel).toBe(true);

    // Arrows should reference their start/end nodes (needed for bindings in the
    // downstream Excalidraw conversion).
    const arrows = skeletons.filter((s) => s.type === 'arrow') as Array<{
      start?: unknown;
      end?: unknown;
      label?: unknown;
    }>;
    expect(arrows.length).toBeGreaterThanOrEqual(3);
    expect(
      arrows.some((a) => {
        const start = (a as { start?: { id?: unknown } }).start;
        const end = (a as { end?: { id?: unknown } }).end;
        return typeof start?.id === 'string' && typeof end?.id === 'string';
      })
    ).toBe(true);
    expect(
      arrows.some((a) => {
        const label = (a as { label?: { text?: unknown } }).label;
        return typeof label?.text === 'string' && ['Нет', 'Да'].includes(String(label.text));
      })
    ).toBe(true);
  });

  it('converts sequence to non-image skeletons', async () => {
    const code = `sequenceDiagram
  participant A
  participant B
  A->>B: hi
`;
    const { skeletons, files } = await parseMermaidToExcalidrawSkeletons({
      mermaidCode: code,
      diagramTypeHint: 'sequence',
      timeoutMs: 20000,
    });
    dump('sequence', { skeletons, files: files as unknown as Record<string, unknown> });
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.type === 'image')).toBe(false);
    expect(skeletons.some((s) => s.type === 'arrow')).toBe(true);
  });

  it('falls back to graphImage for unsupported ER diagrams', async () => {
    const code = `erDiagram
  A ||--|| B : rel
`;
    const { skeletons, files } = await parseMermaidToExcalidrawSkeletons({
      mermaidCode: code,
      diagramTypeHint: 'er',
      timeoutMs: 20000,
    });
    dump('er', { skeletons, files: files as unknown as Record<string, unknown> });
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.every((s) => s.type === 'image')).toBe(true);
    expect(Object.keys(files).length).toBeGreaterThan(0);
  });
});
