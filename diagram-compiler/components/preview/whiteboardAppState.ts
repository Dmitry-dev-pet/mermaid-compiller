import type { AppState, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';

export const clampWhiteboardZoom = (zoom: number) => Math.min(4, Math.max(0.1, zoom));

export const WHITEBOARD_EDITABLE_APPSTATE: Partial<AppState> = {
  viewModeEnabled: false,
  zenModeEnabled: false,
  activeTool: {
    type: 'selection',
    lastActiveTool: null,
    locked: false,
  } as AppState['activeTool'],
};

export const buildWhiteboardAppState = (args: {
  sceneAppState?: Partial<AppState>;
  uiTheme: 'light' | 'dark';
  viewMode: boolean;
  backgroundColor?: string | null;
  zoomPercent: number;
  viewModePatch?: Partial<AppState> | null;
}): Partial<AppState> => {
  const targetZoom = clampWhiteboardZoom(args.zoomPercent / 100);
  return {
    ...(args.sceneAppState ?? {}),
    ...WHITEBOARD_EDITABLE_APPSTATE,
    viewModeEnabled: args.viewMode,
    ...(args.viewModePatch ?? {}),
    theme: args.uiTheme,
    viewBackgroundColor: args.backgroundColor ?? (args.sceneAppState?.viewBackgroundColor ?? undefined),
    zoom: { value: targetZoom } as AppState['zoom'],
  };
};

export const buildWhiteboardInitialData = (args: {
  scene: ExcalidrawInitialDataState | null;
  sceneMeta: Record<string, unknown>;
  uiTheme: 'light' | 'dark';
  viewMode: boolean;
  backgroundColor?: string | null;
  zoomPercent: number;
}): ExcalidrawInitialDataState => {
  const base: ExcalidrawInitialDataState = args.scene ?? {
    type: 'excalidraw',
    version: 2,
    source: 'mermaid-langgraph',
    elements: [],
    files: {},
    scrollToContent: false,
    appState: {},
  };
  return {
    ...base,
    appState: buildWhiteboardAppState({
      sceneAppState: base.appState as Partial<AppState> | undefined,
      uiTheme: args.uiTheme,
      viewMode: args.viewMode,
      backgroundColor: args.backgroundColor,
      zoomPercent: args.zoomPercent,
    }),
    __mermaidLanggraph: args.sceneMeta,
  } as ExcalidrawInitialDataState;
};
