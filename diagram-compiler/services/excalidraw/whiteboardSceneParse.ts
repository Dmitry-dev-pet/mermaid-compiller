import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

import { readSceneMeta } from './whiteboardSceneMeta';

export const tryParseInitialScene = (sceneJson: string | null): ExcalidrawInitialDataState | null => {
  if (!sceneJson?.trim()) return null;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== 'excalidraw') return null;
    if (!Array.isArray(record.elements)) return null;
    // Ignore blank scenes (common when initialData resolves before SVG is ready).
    const elements = record.elements as unknown[];
    const filesRaw = record.files;
    const filesCount =
      filesRaw && typeof filesRaw === 'object' ? Object.keys(filesRaw as Record<string, unknown>).length : 0;
    const nonDeletedElements = elements.filter((el) => {
      if (!el || typeof el !== 'object') return false;
      return (el as { isDeleted?: unknown }).isDeleted !== true;
    });
    // If the stored scene has no visible elements, treat it as empty (regenerate).
    if (nonDeletedElements.length === 0) return null;
    // Guard: if the stored scene looks like a partial import (e.g. only boxes,
    // no labels/edges), regenerate from Mermaid so the result is editable.
    const elementTypes = nonDeletedElements
      .map((el) => String((el as { type?: unknown }).type ?? ''));
    const hasImage = elementTypes.some((t) => t === 'image');
    const hasText = elementTypes.some((t) => t === 'text');
    const hasLines = elementTypes.some((t) => t === 'line' || t === 'arrow');
    if (!hasImage && !hasText && !hasLines && elements.length > 0) return null;
    // If the scene contains image elements but no files payload, it will render
    // as a placeholder; prefer regenerating from Mermaid instead.
    if (filesCount === 0 && elements.some((el) => !!el && typeof el === 'object' && (el as { type?: unknown }).type === 'image')) {
      return null;
    }
    // Migration: older whiteboard scenes were stored as a single locked image
    // snapshot of the Mermaid SVG. This is not editable; prefer regenerating
    // semantic elements from Mermaid code.
    const isImageOnly = elements.length > 0 && elements.every((el) => !!el && typeof el === 'object' && (el as { type?: unknown }).type === 'image');
    if (filesCount > 0 && isImageOnly) {
      const meta = readSceneMeta(record);
      // For ER diagrams Excalidraw elements are not always available yet; keep
      // image-only scenes stable to avoid regenerating on every load.
      if (meta?.diagramType === 'er') return parsed as ExcalidrawInitialDataState;
      return null;
    }
    return parsed as ExcalidrawInitialDataState;
  } catch {
    return null;
  }
};

