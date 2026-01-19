import React from 'react';
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';

type DiagramWhiteboardCanvasProps = {
  initialData: ExcalidrawInitialDataState;
  theme: 'light' | 'dark';
  viewModeEnabled: boolean;
  onThemeChange?: (nextTheme: 'light' | 'dark') => void;
  onApiReady: (api: ExcalidrawImperativeAPI) => void;
  onChange: (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => void;
  onPointerUp: (activeTool: AppState['activeTool'], pointerDownState: any) => void;
  onScrollChange: (scrollX: number, scrollY: number, zoom: AppState['zoom']) => void;
};

const DiagramWhiteboardCanvas: React.FC<DiagramWhiteboardCanvasProps> = ({
  initialData,
  theme,
  viewModeEnabled,
  onThemeChange,
  onApiReady,
  onChange,
  onPointerUp,
  onScrollChange,
}) => {
  return (
    <Excalidraw
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
    >
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.Separator />
        <MainMenu.Group title="Theme">
          <MainMenu.Item
            selected={theme === 'light'}
            onSelect={() => onThemeChange?.('light')}
          >
            Light
          </MainMenu.Item>
          <MainMenu.Item
            selected={theme === 'dark'}
            onSelect={() => onThemeChange?.('dark')}
          >
            Dark
          </MainMenu.Item>
        </MainMenu.Group>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    </Excalidraw>
  );
};

export default DiagramWhiteboardCanvas;
