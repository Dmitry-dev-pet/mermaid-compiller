import type { AppState } from '@excalidraw/excalidraw/types';

import { detectMermaidDiagramTypeHint, type MermaidDiagramTypeHint } from './mermaidToExcalidrawService';

export type MermaidLanggraphSceneGenerator = 'unknown' | 'mermaid-to-excalidraw' | 'svg-vectors' | 'svg-image';

export type MermaidLanggraphSceneMeta = {
  v: 2;
  diagramType: MermaidDiagramTypeHint;
  mermaidHash: number;
  svgHash: number;
  generator: MermaidLanggraphSceneGenerator;
};

export const MLG_META_KEY = '__mermaidLanggraph' as const;
export const MLG_CANVAS_BG_BY_THEME_KEY = '__mlgCanvasBackgroundByTheme' as const;

export type CanvasBackgroundByTheme = Partial<Record<'light' | 'dark', string>>;

export const pickAppStateForSave = (appState: AppState): Partial<AppState> => {
  return {
    theme: appState.theme,
    viewBackgroundColor: appState.viewBackgroundColor,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    zoom: appState.zoom,
  };
};

export const normalizeTheme = (theme: 'light' | 'dark') => theme;

export const hashString = (s: string): number => {
  // djb2, matches Excalidraw internal helper.
  let hash = 5381;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) + hash + s.charCodeAt(i);
  }
  return hash >>> 0;
};

export const buildSceneMeta = (args: { mermaidCode: string; svgMarkup: string }): MermaidLanggraphSceneMeta => {
  return {
    v: 2,
    diagramType: detectMermaidDiagramTypeHint(args.mermaidCode),
    mermaidHash: hashString(args.mermaidCode.trim()),
    svgHash: hashString(args.svgMarkup.trim()),
    generator: 'unknown',
  };
};

export const injectSceneMetaJson = (sceneJson: string, meta: MermaidLanggraphSceneMeta): string => {
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return sceneJson;
    const record = parsed as Record<string, unknown>;
    record[MLG_META_KEY] = meta;
    return JSON.stringify(record, null, 2);
  } catch {
    return sceneJson;
  }
};

export const injectCanvasBackgroundByThemeJson = (
  sceneJson: string,
  backgrounds: CanvasBackgroundByTheme | null | undefined
): string => {
  const next = backgrounds ?? null;
  const light = typeof next?.light === 'string' ? next.light.trim() : '';
  const dark = typeof next?.dark === 'string' ? next.dark.trim() : '';
  if (!light && !dark) return sceneJson;
  try {
    const parsed = JSON.parse(sceneJson) as unknown;
    if (!parsed || typeof parsed !== 'object') return sceneJson;
    const record = parsed as Record<string, unknown>;
    record[MLG_CANVAS_BG_BY_THEME_KEY] = {
      ...(light ? { light } : {}),
      ...(dark ? { dark } : {}),
    };
    return JSON.stringify(record, null, 2);
  } catch {
    return sceneJson;
  }
};

export const readCanvasBackgroundByTheme = (record: Record<string, unknown>): CanvasBackgroundByTheme | null => {
  const raw = record[MLG_CANVAS_BG_BY_THEME_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const light = typeof rec.light === 'string' ? rec.light.trim() : '';
  const dark = typeof rec.dark === 'string' ? rec.dark.trim() : '';
  if (!light && !dark) return null;
  return {
    ...(light ? { light } : {}),
    ...(dark ? { dark } : {}),
  };
};

export const readSceneMeta = (record: Record<string, unknown>): MermaidLanggraphSceneMeta | null => {
  const raw = record[MLG_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const meta = raw as Partial<MermaidLanggraphSceneMeta>;
  if (meta.v !== 2) return null;
  if (
    meta.diagramType !== 'flowchart'
    && meta.diagramType !== 'er'
    && meta.diagramType !== 'sequence'
    && meta.diagramType !== 'class'
    && meta.diagramType !== 'unknown'
  ) {
    return null;
  }
  if (typeof meta.mermaidHash !== 'number' || typeof meta.svgHash !== 'number') return null;
  if (
    meta.generator !== 'unknown'
    && meta.generator !== 'mermaid-to-excalidraw'
    && meta.generator !== 'svg-vectors'
    && meta.generator !== 'svg-image'
  ) return null;
  return meta as MermaidLanggraphSceneMeta;
};
