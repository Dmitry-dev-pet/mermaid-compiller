import React from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { MermaidState } from '../../types';

interface PreviewBodyProps {
  viewportRef: React.RefObject<HTMLDivElement>;
  svgMountRef: React.RefObject<HTMLDivElement>;
  markdownMountRef: React.RefObject<HTMLDivElement>;
  docsMountRef: React.RefObject<HTMLDivElement>;
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  isMarkdownMermaidMode: boolean;
  isMarkdownMermaidInvalid: boolean;
  renderError: string | null;
  mermaidState: MermaidState;
  activeMarkdownErrorMessage: string | null;
  codeForRender: string;
  svgMarkup: string;
  exportError: string | null;
  hasBuildDocs: boolean;
  onMarkdownScroll?: () => void;
  onToggleFullScreen: () => void;
  zoomPercent: number;
  showZoomControls: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToViewport: () => void;
}

const PreviewBody: React.FC<PreviewBodyProps> = ({
  viewportRef,
  svgMountRef,
  markdownMountRef,
  docsMountRef,
  isBuildDocsMode,
  isMarkdownMode,
  isMarkdownMermaidMode,
  isMarkdownMermaidInvalid,
  renderError,
  mermaidState,
  activeMarkdownErrorMessage,
  codeForRender,
  svgMarkup,
  exportError,
  hasBuildDocs,
  onMarkdownScroll,
  onToggleFullScreen,
  zoomPercent,
  showZoomControls,
  onZoomOut,
  onZoomIn,
  onFitToViewport,
}) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      {exportError && !isBuildDocsMode && !isMarkdownMode && (
        <div
          className="absolute top-3 left-3 z-20 max-w-[60%] rounded border border-red-200/70 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/40 backdrop-blur px-2 py-1 text-[10px] text-red-700 dark:text-red-200 truncate"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {exportError}
        </div>
      )}

      {isBuildDocsMode && (
        <div className="absolute inset-0 overflow-auto text-sm text-slate-700 dark:text-slate-200 leading-6 p-4">
          {hasBuildDocs ? (
            <div ref={docsMountRef} className="markdown-body" />
          ) : (
            <div className="text-slate-400 dark:text-slate-500 text-sm">No documentation loaded.</div>
          )}
        </div>
      )}

      {!isBuildDocsMode &&
        renderError &&
        mermaidState.status !== 'invalid' &&
        !isMarkdownMode &&
        !isMarkdownMermaidInvalid && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Render failed</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {renderError}
            </p>
          </div>
        </div>
      )}
      {!isBuildDocsMode && isMarkdownMermaidInvalid && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {activeMarkdownErrorMessage || 'Syntax Error'}
            </p>
          </div>
        </div>
      )}
      {!isBuildDocsMode && mermaidState.status === 'invalid' && !isMarkdownMode && !isMarkdownMermaidMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {mermaidState.errorMessage || 'Syntax Error'}
            </p>
          </div>
        </div>
      )}

      {!isBuildDocsMode && !codeForRender.trim() && !isMarkdownMode && (
        <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
      )}

      {!isBuildDocsMode && svgMarkup && !isMarkdownMode && (
        <div
          ref={svgMountRef}
          className="absolute inset-0"
          onDoubleClick={(e) => {
            e.preventDefault();
            onToggleFullScreen();
          }}
        />
      )}
      {showZoomControls && !isBuildDocsMode && svgMarkup && !isMarkdownMode && (
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/90 shadow-sm px-1.5 py-1.5">
          <button
            type="button"
            onClick={onZoomIn}
            className="h-7 w-7 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={14} className="mx-auto" />
          </button>
          <div className="text-[11px] font-mono text-slate-700 dark:text-slate-200 select-none">
            {`${zoomPercent}%`}
          </div>
          <button
            type="button"
            onClick={onZoomOut}
            className="h-7 w-7 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={14} className="mx-auto" />
          </button>
          <button
            type="button"
            onClick={onFitToViewport}
            className="mt-1 h-7 w-7 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Fit"
            aria-label="Fit"
          >
            <Maximize size={14} className="mx-auto" />
          </button>
        </div>
      )}
      {!isBuildDocsMode && isMarkdownMode && (
        <div
          ref={markdownMountRef}
          onScroll={onMarkdownScroll}
          className="markdown-body absolute inset-0 overflow-auto p-4 text-sm text-slate-700 dark:text-slate-200 leading-6"
        />
      )}
    </div>
  );
};

export default PreviewBody;
