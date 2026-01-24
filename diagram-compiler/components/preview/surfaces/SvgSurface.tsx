import React from 'react';
import type { MermaidState } from '../../../types';
import { Button } from '../../ui/Button';
import { Maximize, Minus, Plus } from 'lucide-react';

type SvgSurfaceProps = {
  viewportRef: React.RefObject<HTMLDivElement>;
  svgMountRef: React.RefObject<HTMLDivElement>;
  svgMarkup: string;
  exportError: string | null;
  renderError: string | null;
  mermaidState: MermaidState;
  isMarkdownMermaidInvalid: boolean;
  isMarkdownMermaidMode: boolean;
  activeMarkdownErrorMessage: string | null;
  codeForRender: string;
  onToggleFullScreen: () => void;
  showZoomControls: boolean;
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitToViewport: () => void;
};

const SvgSurface: React.FC<SvgSurfaceProps> = ({
  viewportRef,
  svgMountRef,
  svgMarkup,
  exportError,
  renderError,
  mermaidState,
  isMarkdownMermaidInvalid,
  isMarkdownMermaidMode,
  activeMarkdownErrorMessage,
  codeForRender,
  onToggleFullScreen,
  showZoomControls,
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onFitToViewport,
}) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      {exportError && (
        <div
          className="absolute top-3 left-3 z-20 max-w-[60%] rounded border border-red-200/70 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/40 backdrop-blur px-2 py-1 text-[10px] text-red-700 dark:text-red-200 truncate"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {exportError}
        </div>
      )}

      {renderError && mermaidState.status !== 'invalid' && !isMarkdownMermaidInvalid && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Render failed</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {renderError}
            </p>
          </div>
        </div>
      )}

      {isMarkdownMermaidInvalid && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {activeMarkdownErrorMessage || 'Syntax Error'}
            </p>
          </div>
        </div>
      )}

      {!isMarkdownMermaidInvalid && mermaidState.status === 'invalid' && !isMarkdownMermaidMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="text-center p-6 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg max-w-sm">
            <h3 className="text-red-700 dark:text-red-400 font-medium mb-1">Cannot render diagram</h3>
            <p className="text-xs text-red-600 dark:text-red-300 font-mono text-left bg-white dark:bg-slate-950 p-2 rounded border border-red-100 dark:border-red-900 overflow-auto max-h-32">
              {mermaidState.errorMessage || 'Syntax Error'}
            </p>
          </div>
        </div>
      )}

      {!codeForRender.trim() && (
        <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
      )}

      {svgMarkup && (
        <div
          ref={svgMountRef}
          className="absolute inset-0"
          onDoubleClick={(e) => {
            e.preventDefault();
            onToggleFullScreen();
          }}
        />
      )}

      {showZoomControls && svgMarkup && (
        <div className="absolute bottom-3 right-3 z-20 flex flex-col items-center gap-1 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/90 shadow-sm px-1.5 py-1.5">
          <Button
            type="button"
            onClick={onZoomIn}
            size="icon"
            className="h-7 w-7 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={14} className="mx-auto" />
          </Button>
          <div className="text-[11px] font-mono text-slate-700 dark:text-slate-200 select-none">
            {`${zoomPercent}%`}
          </div>
          <Button
            type="button"
            onClick={onZoomOut}
            size="icon"
            className="h-7 w-7 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={14} className="mx-auto" />
          </Button>
          <Button
            type="button"
            onClick={onFitToViewport}
            size="icon"
            className="mt-1 h-7 w-7 text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="Fit"
            aria-label="Fit"
          >
            <Maximize size={14} className="mx-auto" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default SvgSurface;
