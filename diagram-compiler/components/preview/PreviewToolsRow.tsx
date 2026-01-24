import React from 'react';
import { Download, Link2, Maximize2, Maximize, Minimize2, Moon, PenLine, RefreshCw, SquarePen, Sun } from 'lucide-react';
import { Button } from '../ui/Button';
import { HEADER_CONTROL_BUTTON } from '../../utils/uiControlStyles';
import type { PreviewHeaderToolsModel } from '../../hooks/preview/usePreviewHeaderModel';

type PreviewToolsRowProps = PreviewHeaderToolsModel;

const PreviewToolsRow: React.FC<PreviewToolsRowProps> = ({
  isBuildDocsMode,
  isMarkdownMode,
  svgMarkup,
  isExporting,
  onExportSvg,
  onExportPng,
  canNotebookExcalidrawToggle,
  isNotebookExcalidrawMode,
  onToggleNotebookExcalidraw,
  showWhiteboardToggle,
  isWhiteboardMode,
  isWhiteboardDirty,
  isWhiteboardAutoSync,
  onToggleWhiteboard,
  onWhiteboardSyncFromCode,
  onToggleWhiteboardAutoSync,
  showExcalidrawThemeControl,
  excalidrawTheme,
  onSetExcalidrawTheme,
  isFullScreen,
  onToggleFullScreen,
}) => {
  if (isBuildDocsMode) return null;
  const canExportControls = !isWhiteboardMode;
  return (
    <div className="flex items-center gap-1 normal-case tracking-normal">
      {canExportControls && (
        <div className={`${HEADER_CONTROL_BUTTON} px-1 gap-1`}>
          <span className="text-[10px] text-[var(--control-muted-text)] font-semibold uppercase tracking-wide">
            Export
          </span>
          <Button
            type="button"
            onClick={onExportSvg}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            className="ml-1"
            title="Export SVG"
          >
            <Download size={12} />
            SVG
          </Button>
          <Button
            type="button"
            onClick={onExportPng}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            title="Export PNG"
          >
            <Download size={12} />
            PNG
          </Button>
        </div>
      )}

      {canNotebookExcalidrawToggle && (
        <div className={`${HEADER_CONTROL_BUTTON} px-1 gap-1`}>
          <Button
            type="button"
            onClick={onToggleNotebookExcalidraw}
            title={isNotebookExcalidrawMode ? 'Back to notebook preview' : 'Render active diagram in Excalidraw'}
            aria-label={isNotebookExcalidrawMode ? 'Back to notebook preview' : 'Render active diagram in Excalidraw'}
            aria-pressed={isNotebookExcalidrawMode}
          >
            {isNotebookExcalidrawMode ? <Maximize size={12} /> : <SquarePen size={12} />}
            {isNotebookExcalidrawMode ? 'Notebook' : 'ED'}
          </Button>
        </div>
      )}

      {showWhiteboardToggle && (
        <div className={`${HEADER_CONTROL_BUTTON} px-1 gap-1`}>
          <Button
            type="button"
            onClick={onToggleWhiteboard}
            title={isWhiteboardMode ? 'Back to Mermaid preview' : 'Edit in whiteboard'}
            aria-label={isWhiteboardMode ? 'Back to preview' : 'Edit in whiteboard'}
          >
            {isWhiteboardMode ? <Maximize size={12} /> : <PenLine size={12} />}
            {isWhiteboardMode ? 'Preview' : 'Whiteboard'}
            {isWhiteboardMode ? (
              <span
                className={`ml-2 inline-flex h-2 w-2 rounded-full ${
                  isWhiteboardDirty
                    ? 'bg-amber-500 dark:bg-amber-300'
                    : 'bg-emerald-500/70 dark:bg-emerald-300/70'
                }`}
                title={isWhiteboardDirty ? 'Unsaved changes' : 'Saved'}
                aria-label={isWhiteboardDirty ? 'Unsaved changes' : 'Saved'}
              />
            ) : null}
          </Button>
          {isWhiteboardMode && (
            <Button
              type="button"
              onClick={onWhiteboardSyncFromCode}
              title="Sync from Mermaid code (overwrites whiteboard)"
              aria-label="Sync from Mermaid code"
            >
              <RefreshCw size={12} />
              Sync
            </Button>
          )}
          {isWhiteboardMode && (
            <Button
              type="button"
              onClick={onToggleWhiteboardAutoSync}
              className={
                isWhiteboardAutoSync
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                  : ''
              }
              title={isWhiteboardAutoSync ? 'Disable auto sync from code' : 'Enable auto sync from code'}
              aria-label={isWhiteboardAutoSync ? 'Disable auto sync from code' : 'Enable auto sync from code'}
              aria-pressed={isWhiteboardAutoSync}
            >
              <Link2 size={12} />
              Auto
            </Button>
          )}
        </div>
      )}

      {showExcalidrawThemeControl && (
        <div className={`${HEADER_CONTROL_BUTTON} px-1 gap-1`}>
          <Button
            type="button"
            onClick={() => onSetExcalidrawTheme('light')}
            className={`${
              excalidrawTheme === 'light'
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                : ''
            }`}
            title="Excalidraw theme: light"
            aria-label="Excalidraw theme: light"
            aria-pressed={excalidrawTheme === 'light'}
          >
            <Sun size={12} />
            Light
          </Button>
          <Button
            type="button"
            onClick={() => onSetExcalidrawTheme('dark')}
            className={`${
              excalidrawTheme === 'dark'
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                : ''
            }`}
            title="Excalidraw theme: dark"
            aria-label="Excalidraw theme: dark"
            aria-pressed={excalidrawTheme === 'dark'}
          >
            <Moon size={12} />
            Dark
          </Button>
        </div>
      )}

      <Button
        type="button"
        onClick={onToggleFullScreen}
        title={isFullScreen ? 'Exit full screen' : 'Full screen'}
        aria-label={isFullScreen ? 'Exit full screen' : 'Full screen'}
      >
        {isFullScreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        Full screen
      </Button>
    </div>
  );
};

export default PreviewToolsRow;
