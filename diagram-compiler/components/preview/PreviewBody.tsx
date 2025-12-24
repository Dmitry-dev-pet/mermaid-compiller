import React from 'react';
import { Scan, ZoomIn, ZoomOut } from 'lucide-react';
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
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToViewport: () => void;
  hasBuildDocs: boolean;
  onMarkdownScroll?: () => void;
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
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onFitToViewport,
  hasBuildDocs,
  onMarkdownScroll,
}) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      {!isBuildDocsMode && !isMarkdownMode && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/80 backdrop-blur px-2 py-1 shadow-sm">
          <button
            type="button"
            onClick={onZoomOut}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>

          <span className="text-[11px] text-slate-700 dark:text-slate-200 font-mono w-12 text-right select-none">
            {zoomPercent}%
          </span>

          <button
            type="button"
            onClick={onZoomIn}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>

          <button
            type="button"
            onClick={onFitToViewport}
            disabled={!svgMarkup || isMarkdownMode}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
            title="Fit (center & maximize)"
            aria-label="Fit (center & maximize)"
          >
            <Scan size={16} />
          </button>
        </div>
      )}

      {exportError && !isBuildDocsMode && !isMarkdownMode && (
        <div className="absolute top-3 left-3 z-20 max-w-[60%] rounded border border-red-200/70 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/40 backdrop-blur px-2 py-1 text-[10px] text-red-700 dark:text-red-200 truncate">
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
        <div ref={svgMountRef} className="absolute inset-0" />
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
