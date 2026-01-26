import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type TextElement = OrderedExcalidrawElement & {
  type: 'text';
  text?: unknown;
  originalText?: unknown;
  containerId?: unknown;
  version?: unknown;
  versionNonce?: unknown;
  updated?: unknown;
};

const isTextElement = (el: OrderedExcalidrawElement): el is TextElement => el.type === 'text';

export type ContainerTextMap = Map<string, { text: string; originalText: string }>;

// Backwards compatible: containerId keys are stored as-is.
const keyForContainer = (containerId: string) => containerId;
// Id-based fallback uses a prefix to avoid collisions with real container ids.
const keyForId = (id: string) => `id:${id}`;

export const buildContainerTextMap = (elements: readonly OrderedExcalidrawElement[]): ContainerTextMap => {
  const map: ContainerTextMap = new Map();
  for (const el of elements) {
    if (!isTextElement(el)) continue;
    const containerId = typeof el.containerId === 'string' ? el.containerId : '';
    const text = typeof el.text === 'string' ? el.text : '';
    const originalText =
      typeof el.originalText === 'string'
        ? el.originalText
        : text;
    if (containerId) {
      map.set(keyForContainer(containerId), { text, originalText });
    }
    const id = typeof el.id === 'string' ? String(el.id) : '';
    if (id) {
      map.set(keyForId(id), { text, originalText });
    }
  }
  return map;
};

const nextNonce = (prev: unknown) => {
  const seed = typeof prev === 'number' && Number.isFinite(prev) ? prev : Date.now();
  // Cheap deterministic-ish nonce variation (no crypto); enough to force Excalidraw refresh.
  return ((seed * 1664525 + 1013904223) >>> 0) as unknown as number;
};

export const applyContainerTextMap = (
  elements: readonly OrderedExcalidrawElement[],
  map: ContainerTextMap
): { elements: OrderedExcalidrawElement[]; changed: boolean } => {
  let changed = false;
  const next = elements.map((el) => {
    if (!isTextElement(el)) return el;
    const containerId = typeof el.containerId === 'string' ? el.containerId : '';
    const id = typeof el.id === 'string' ? String(el.id) : '';
    const target =
      (containerId ? map.get(keyForContainer(containerId)) : undefined)
      ?? (id ? map.get(keyForId(id)) : undefined);
    if (!target) return el;
    const prevText = typeof el.text === 'string' ? el.text : '';
    const prevOriginal = typeof el.originalText === 'string' ? el.originalText : prevText;
    if (prevText === target.text && prevOriginal === target.originalText) return el;
    changed = true;
    const prevVersion = typeof el.version === 'number' && Number.isFinite(el.version) ? el.version : 1;
    const prevNonce = typeof el.versionNonce === 'number' && Number.isFinite(el.versionNonce) ? el.versionNonce : 0;
    return {
      ...el,
      text: target.text,
      originalText: target.originalText,
      version: prevVersion + 1,
      versionNonce: nextNonce(prevNonce),
      updated: Date.now(),
    } as OrderedExcalidrawElement;
  });
  return { elements: next, changed };
};
