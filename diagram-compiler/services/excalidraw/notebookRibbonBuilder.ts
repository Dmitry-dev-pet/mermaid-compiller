import mermaid from 'mermaid';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { BinaryFileData, BinaryFiles, DataURL, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

import {
  applyInlineMermaidDirectives,
  detectMermaidDiagramType,
  MermaidMarkdownBlock,
  validateMermaidDiagramCode,
} from '../mermaidService';
import { initializeMermaid } from '../mermaidService';
import { renderMermaidToExcalidrawElementsLenient } from './mermaidToExcalidrawRenderer';
import { parseWhiteboardBundle } from '../history/whiteboardBundle';
import { extractFrontmatterThemeVariables } from '../../utils/mermaidFrontmatterThemeVariables';
import { MERMAID_THEME_PRESETS, MermaidThemePresetId } from '../../utils/mermaidThemePreset';
import { parseSvgViewBox } from '../../utils/svgViewBox';

type Bounds = { minX: number; minY: number; width: number; height: number };

const toSvgDataUrl = (svg: string): DataURL => {
  // Prefer base64 for better compatibility with Excalidraw canvas rendering.
  try {
    const decoded = unescape(encodeURIComponent(svg));
    const base64 = btoa(decoded);
    return `data:image/svg+xml;base64,${base64}` as DataURL;
  } catch {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` as DataURL;
  }
};

const convertForeignObjectsToText = (svgMarkup: string, theme: 'light' | 'dark'): string => {
  if (!svgMarkup.includes('foreignObject')) return svgMarkup;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return svgMarkup;
    const foreignObjects = Array.from(svgEl.querySelectorAll('foreignObject'));
    for (const foreignObject of foreignObjects) {
      const rawText = (foreignObject.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
      if (!rawText) {
        foreignObject.remove();
        continue;
      }
      const x = Number(foreignObject.getAttribute('x') ?? '0');
      const y = Number(foreignObject.getAttribute('y') ?? '0');
      const width = Number(foreignObject.getAttribute('width') ?? '0');
      const height = Number(foreignObject.getAttribute('height') ?? '0');
      const cx = Number.isFinite(x) && Number.isFinite(width) ? x + width / 2 : 0;
      const cy = Number.isFinite(y) && Number.isFinite(height) ? y + height / 2 : 0;

      const text = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', theme === 'dark' ? '#e7e7e7' : '#111827');
      text.setAttribute('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif');
      text.setAttribute('font-size', '14');

      const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length <= 1) {
        text.textContent = rawText;
      } else {
        const lineHeight = 16;
        const startDy = -((lines.length - 1) / 2) * lineHeight;
        for (let i = 0; i < lines.length; i += 1) {
          const tspan = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.textContent = lines[i]!;
          tspan.setAttribute('x', String(cx));
          tspan.setAttribute('dy', String(i === 0 ? startDy : lineHeight));
          text.appendChild(tspan);
        }
      }

      foreignObject.parentNode?.insertBefore(text, foreignObject);
      foreignObject.remove();
    }
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgEl);
  } catch {
    return svgMarkup;
  }
};

const parseSvgWidthHeight = (svg: string): { width: number; height: number } | null => {
  const widthMatch = svg.match(/\bwidth\s*=\s*["']\s*([0-9.-]+)\s*(px)?\s*["']/i);
  const heightMatch = svg.match(/\bheight\s*=\s*["']\s*([0-9.-]+)\s*(px)?\s*["']/i);
  if (!widthMatch?.[1] || !heightMatch?.[1]) return null;
  const width = Number(widthMatch[1]);
  const height = Number(heightMatch[1]);
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) return null;
  return { width, height };
};

const extractHeadingBeforeIndex = (markdown: string, index: number): string | null => {
  const prefix = markdown.slice(0, Math.max(0, index));
  const lines = prefix.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) return (m[1] ?? '').trim() || null;
    // Stop scanning when we hit another mermaid block fence or a hard separator.
    if (line.startsWith('```')) break;
    if (/^---+$/.test(line)) break;
  }
  return null;
};

const namespaceScene = (
  elementsRaw: readonly Record<string, unknown>[],
  filesRaw: BinaryFiles | undefined,
  prefix: string
) => {
  const elements = elementsRaw.map((el) => ({ ...el })) as Array<Record<string, unknown>>;
  const files: BinaryFiles = {};
  const fileIdMap = new Map<string, string>();
  const elementIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  const mapId = (id: unknown, map: Map<string, string>, kind: string) => {
    if (typeof id !== 'string' || !id) return id;
    const existing = map.get(id);
    if (existing) return existing;
    const next = `${prefix}:${kind}:${id}`;
    map.set(id, next);
    return next;
  };

  for (const el of elements) {
    if (typeof el.id === 'string') {
      el.id = mapId(el.id, elementIdMap, 'el');
    }
    if (Array.isArray(el.groupIds)) {
      el.groupIds = el.groupIds.map((gid) => mapId(gid, groupIdMap, 'group'));
    }
    if (typeof el.frameId === 'string') {
      el.frameId = mapId(el.frameId, elementIdMap, 'el');
    }
    if (typeof el.containerId === 'string') {
      el.containerId = mapId(el.containerId, elementIdMap, 'el');
    }
    if (typeof el.fileId === 'string') {
      el.fileId = mapId(el.fileId, fileIdMap, 'file');
    }
    if (typeof el.startBinding === 'object' && el.startBinding && typeof (el.startBinding as any).elementId === 'string') {
      (el.startBinding as any).elementId = mapId((el.startBinding as any).elementId, elementIdMap, 'el');
    }
    if (typeof el.endBinding === 'object' && el.endBinding && typeof (el.endBinding as any).elementId === 'string') {
      (el.endBinding as any).elementId = mapId((el.endBinding as any).elementId, elementIdMap, 'el');
    }
    if (Array.isArray(el.boundElements)) {
      el.boundElements = el.boundElements.map((b: any) => {
        if (!b || typeof b !== 'object') return b;
        if (typeof b.id === 'string') return { ...b, id: mapId(b.id, elementIdMap, 'el') };
        return b;
      });
    }
  }

  if (filesRaw) {
    for (const [id, file] of Object.entries(filesRaw)) {
      const nextId = mapId(id, fileIdMap, 'file') as string;
      files[nextId] = { ...(file as any), id: nextId } as any;
    }
  }

  return { elements, files };
};

const getElementsBounds = (elements: readonly Record<string, unknown>[]): Bounds | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const visitPoint = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const el of elements) {
    if (!el || typeof el !== 'object') continue;
    if ((el as any).isDeleted === true) continue;
    const x = typeof (el as any).x === 'number' ? (el as any).x : null;
    const y = typeof (el as any).y === 'number' ? (el as any).y : null;
    if (x === null || y === null) continue;

    const points = Array.isArray((el as any).points) ? (el as any).points : null;
    if (Array.isArray(points) && points.length >= 1) {
      for (const p of points) {
        if (!Array.isArray(p) || p.length !== 2) continue;
        const px = Number(p[0]);
        const py = Number(p[1]);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        visitPoint(x + px, y + py);
      }
      continue;
    }

    const w = typeof (el as any).width === 'number' ? (el as any).width : null;
    const h = typeof (el as any).height === 'number' ? (el as any).height : null;
    if (w !== null && h !== null) {
      visitPoint(x, y);
      visitPoint(x + w, y + h);
    } else {
      visitPoint(x, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
};

const offsetElements = (
  elements: readonly Record<string, unknown>[],
  dx: number,
  dy: number,
  notebookIndex?: number
) => {
  return elements.map((el) => {
    if (!el || typeof el !== 'object') return el;
    const x = typeof (el as any).x === 'number' ? (el as any).x : null;
    const y = typeof (el as any).y === 'number' ? (el as any).y : null;
    if (x === null || y === null) return el;
    const next: Record<string, unknown> = { ...el, x: x + dx, y: y + dy };
    if (typeof notebookIndex === 'number') {
      const existing = (next as any).customData;
      next.customData = { ...(existing && typeof existing === 'object' ? existing : {}), __mlgNotebookIndex: notebookIndex };
    }
    return next;
  });
};

const parseScene = (raw: string): { elements: Array<Record<string, unknown>>; files: BinaryFiles } | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    if (rec.type !== 'excalidraw') return null;
    const elements = Array.isArray(rec.elements) ? (rec.elements as Array<Record<string, unknown>>) : [];
    const files = (rec.files && typeof rec.files === 'object' ? (rec.files as BinaryFiles) : {}) as BinaryFiles;
    if (!elements.length) return null;
    return { elements, files };
  } catch {
    return null;
  }
};

const buildMermaidSvgImageScene = async (args: {
  blockIndex: number;
  code: string;
  theme: 'light' | 'dark';
  themeVariables: Record<string, string | number | boolean>;
}): Promise<{ elements: Array<Record<string, unknown>>; files: BinaryFiles; bounds: Bounds } | null> => {
  try {
    initializeMermaid({ theme: 'base', themeVariables: args.themeVariables as Record<string, unknown> });
    const id = `notebook-svg-${Date.now()}-${args.blockIndex}`;
    const normalized = applyInlineMermaidDirectives(args.code);
    const { svg } = await mermaid.render(id, normalized);
    if (!svg || !svg.includes('<svg')) return null;
    const svgForCanvas = svg.includes('foreignObject') ? convertForeignObjectsToText(svg, args.theme) : svg;
    const viewBox = (() => {
      const m = svgForCanvas.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
      return m?.[1] ? parseSvgViewBox(m[1]) : null;
    })();
    const size = parseSvgWidthHeight(svgForCanvas) ?? (viewBox ? { width: viewBox.width, height: viewBox.height } : null) ?? { width: 800, height: 600 };
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);

    const fileId = `mermaid-svg-${Date.now()}-${args.blockIndex}` as BinaryFileData['id'];
    const file: BinaryFileData = {
      mimeType: 'image/svg+xml',
      id: fileId,
      dataURL: toSvgDataUrl(svgForCanvas),
      created: Date.now(),
    };
    const files: BinaryFiles = { [fileId]: file };
    const elements = convertToExcalidrawElements(
      [{ type: 'image', fileId, x: 0, y: 0, width, height, locked: true }] as any,
      { regenerateIds: false }
    ) as unknown as Array<Record<string, unknown>>;

    return {
      elements,
      files,
      bounds: { minX: 0, minY: 0, width, height },
    };
  } catch {
    return null;
  }
};

export const buildNotebookExcalidrawScene = async (args: {
  mermaidCode: string;
  markdownBlocks: MermaidMarkdownBlock[];
  theme: 'light' | 'dark';
  basePresetId: MermaidThemePresetId;
  previewBackgroundColor?: string | null;
  whiteboardBundleJson?: string | null;
  shouldCancel?: () => boolean;
}): Promise<ExcalidrawInitialDataState | null> => {
  if (!args.markdownBlocks.length) return null;
  const shouldCancel = args.shouldCancel ?? (() => false);

  const byBlockSceneJson = (() => {
    const bundle = parseWhiteboardBundle(args.whiteboardBundleJson ?? null);
    return bundle?.byBlock ?? null;
  })();

  const scenes: Array<{
    elements: Array<Record<string, unknown>>;
    files: BinaryFiles;
    bounds: Bounds;
    title: string;
    label: string;
    blockIndex: number;
  }> = [];

  const basePreset = MERMAID_THEME_PRESETS.find((p) => p.id === args.basePresetId);
  const baseThemeVariables = {
    ...((basePreset?.themeVariables ?? {}) as Record<string, string | number | boolean>),
    darkMode: args.theme === 'dark',
    ...(args.previewBackgroundColor ? { background: args.previewBackgroundColor } : {}),
  } as Record<string, string | number | boolean>;

  for (let i = 0; i < args.markdownBlocks.length; i += 1) {
    if (shouldCancel()) return null;
    const block = args.markdownBlocks[i];
    const code = block?.code ?? '';
    if (!code.trim()) continue;

    const savedSceneJson = byBlockSceneJson?.[String(block.index)] ?? null;
    if (savedSceneJson && savedSceneJson.trim()) {
      const parsed = parseScene(savedSceneJson);
      if (parsed) {
        const { elements, files: namespacedFiles } = namespaceScene(
          parsed.elements as unknown as readonly Record<string, unknown>[],
          parsed.files,
          `wb-${i}`
        );
        const bounds = getElementsBounds(elements);
        if (bounds) {
          const markdownTitle = extractHeadingBeforeIndex(args.mermaidCode, block.start) ?? '';
          const title = markdownTitle || `Diagram ${i + 1}`;
          const type = block.diagramType ?? detectMermaidDiagramType(code);
          const shortType =
            type === 'flowchart' ? 'FC'
              : type === 'sequence' ? 'SD'
                : type === 'er' ? 'ER'
                  : type === 'class' ? 'CL'
                    : (type ?? 'MD').toUpperCase();
          const label = `${shortType} — ${title}`;
          scenes.push({
            elements,
            files: namespacedFiles,
            bounds,
            title,
            label,
            blockIndex: block.index,
          });
          continue;
        }
      }
    }

    const validation = await validateMermaidDiagramCode(code, { logError: false });
    if (shouldCancel()) return null;
    if (validation.isValid === false) continue;

    try {
      const vars = extractFrontmatterThemeVariables(code);
      const mergedThemeVariables = {
        ...baseThemeVariables,
        ...(vars ?? {}),
        darkMode: args.theme === 'dark',
        ...(args.previewBackgroundColor ? { background: args.previewBackgroundColor } : {}),
      } as Record<string, string | number | boolean>;
      const { elements: rawElements, files } = await renderMermaidToExcalidrawElementsLenient({
        mermaidCode: code,
        themeVariables: mergedThemeVariables,
        timeoutMs: 12000,
      });
      if (shouldCancel()) return null;
      const { elements, files: namespacedFiles } = namespaceScene(
        rawElements as unknown as readonly Record<string, unknown>[],
        files,
        `md-${i}`
      );
      const bounds = getElementsBounds(elements);
      if (!bounds) continue;
      const markdownTitle = extractHeadingBeforeIndex(args.mermaidCode, block.start) ?? '';
      const title = markdownTitle || `Diagram ${i + 1}`;
      const type = block.diagramType ?? detectMermaidDiagramType(code);
      const shortType =
        type === 'flowchart' ? 'FC'
          : type === 'sequence' ? 'SD'
            : type === 'er' ? 'ER'
              : type === 'class' ? 'CL'
                : (type ?? 'MD').toUpperCase();
      const label = `${shortType} — ${title}`;
      scenes.push({
        elements,
        files: namespacedFiles,
        bounds,
        title,
        label,
        blockIndex: block.index,
      });
    } catch {
      // Fallback: render as Mermaid SVG image inside Excalidraw so notebook still shows it.
      const vars = extractFrontmatterThemeVariables(code);
      const mergedThemeVariables = {
        ...baseThemeVariables,
        ...(vars ?? {}),
        darkMode: args.theme === 'dark',
        ...(args.previewBackgroundColor ? { background: args.previewBackgroundColor } : {}),
      } as Record<string, string | number | boolean>;
      const fallback = await buildMermaidSvgImageScene({
        blockIndex: i,
        code,
        theme: args.theme,
        themeVariables: mergedThemeVariables,
      });
      if (!fallback) continue;
      const { elements: imgElements, files: imgFiles } = namespaceScene(
        fallback.elements as unknown as readonly Record<string, unknown>[],
        fallback.files,
        `svg-${i}`
      );
      const markdownTitle = extractHeadingBeforeIndex(args.mermaidCode, block.start) ?? '';
      const title = markdownTitle || `Diagram ${i + 1}`;
      const type = block.diagramType ?? detectMermaidDiagramType(code);
      const shortType =
        type === 'flowchart' ? 'FC'
          : type === 'sequence' ? 'SD'
            : type === 'er' ? 'ER'
              : type === 'class' ? 'CL'
                : (type ?? 'MD').toUpperCase();
      const label = `${shortType} — ${title}`;
      const imgBounds = getElementsBounds(imgElements);
      scenes.push({
        elements: imgElements as any,
        files: imgFiles,
        bounds: imgBounds ?? fallback.bounds,
        title,
        label,
        blockIndex: block.index,
      });
    }
  }

  if (!scenes.length) return null;

  const padX = 48;
  const padY = 56;
  const headerHeight = 56;
  const headerTextTop = 14;
  const dividerY = headerHeight - 8;
  const maxWidth = Math.max(...scenes.map((s) => s.bounds.width));
  const contentWidth = maxWidth + padX * 2;
  const dividerWidth = contentWidth;

  const headerStroke = args.theme === 'dark' ? '#e5e7eb' : '#111827';
  const dividerStroke = args.theme === 'dark' ? '#334155' : '#cbd5e1';

  const mergedElements: Array<Record<string, unknown>> = [];
  const mergedFiles: BinaryFiles = {};

  let yOffset = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const notebookIndex = scene.blockIndex;
    const headerSkeleton = [
      { type: 'text', x: 0, y: headerTextTop, text: scene.label, fontSize: 20, strokeColor: headerStroke, width: dividerWidth, textAlign: 'center' },
      { type: 'line', x: 0, y: dividerY, points: [[0, 0], [dividerWidth, 0]], strokeColor: dividerStroke, strokeWidth: 1 },
    ];
    const headerConverted = convertToExcalidrawElements(
      headerSkeleton as unknown as Parameters<typeof convertToExcalidrawElements>[0],
      { regenerateIds: false }
    ) as unknown as readonly Record<string, unknown>[];
    const { elements: headerElements } = namespaceScene(headerConverted, undefined, `hdr-${notebookIndex}`);

    mergedElements.push(...offsetElements(headerElements, 0, yOffset, notebookIndex));

    const dx = padX + Math.round((maxWidth - scene.bounds.width) / 2) - scene.bounds.minX;
    const dy = yOffset + headerHeight + padY - scene.bounds.minY;
    mergedElements.push(...offsetElements(scene.elements, dx, dy, notebookIndex));
    Object.assign(mergedFiles, scene.files);
    yOffset += headerHeight + scene.bounds.height + padY * 2;
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: 'mermaid-langgraph',
    elements: mergedElements as any,
    files: mergedFiles as any,
    scrollToContent: true,
    appState: {
      theme: args.theme,
      viewBackgroundColor: args.previewBackgroundColor ?? undefined,
    } as any,
  };
};
