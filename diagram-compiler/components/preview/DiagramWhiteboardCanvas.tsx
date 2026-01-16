import React from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type DiagramWhiteboardCanvasProps = {
  sceneKey: number;
  initialData: ExcalidrawInitialDataState;
  theme: 'light' | 'dark';
  viewModeEnabled: boolean;
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  onChange: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => void;
  onPointerUp: (activeTool: AppState['activeTool'], pointerDownState: any) => void;
  onScrollChange: (scrollX: number, scrollY: number, zoom: AppState['zoom']) => void;
};

const DiagramWhiteboardCanvas: React.FC<DiagramWhiteboardCanvasProps> = ({
  sceneKey,
  initialData,
  theme,
  viewModeEnabled,
  onApiReady,
  onChange,
  onPointerUp,
  onScrollChange,
}) => {
  return (
    <Excalidraw
      key={sceneKey}
      initialData={initialData}
      theme={theme}
      viewModeEnabled={viewModeEnabled}
      zenModeEnabled={false}
      detectScroll={false}
      excalidrawAPI={(api) => {
        if (!api) return;
        onApiReady(api);
      }}
      onChange={onChange}
      onPointerUp={onPointerUp}
      onScrollChange={onScrollChange}
    />
  );
};

export default DiagramWhiteboardCanvas;
