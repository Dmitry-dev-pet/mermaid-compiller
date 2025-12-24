import React from 'react';
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2 } from 'lucide-react';
import { MermaidThemeName } from '../../utils/inlineThemeCommand';
import { MermaidDirection } from '../../utils/inlineDirectionCommand';
import { MermaidLook } from '../../utils/inlineLookCommand';

interface PreviewHeaderControlsProps {
  title: string;
  isBuildDocsMode: boolean;
  isMarkdownMode: boolean;
  markdownNavEnabled: boolean;
  markdownNavLabel: string;
  markdownPrevDisabled: boolean;
  markdownNextDisabled: boolean;
  onMarkdownPrev: () => void;
  onMarkdownNext: () => void;
  showThemeControl: boolean;
  showDirectionControl: boolean;
  showLookControl: boolean;
  directionOptions: MermaidDirection[];
  selectedInlineTheme: string;
  selectedInlineDirection: string;
  selectedInlineLook: string;
  onSetInlineTheme: (theme: MermaidThemeName | null) => void;
  onSetInlineDirection: (direction: MermaidDirection | null) => void;
  onSetInlineLook: (look: MermaidLook | null) => void;
  codeForRender: string;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  svgMarkup: string;
  isExporting: boolean;
  onExportSvg: () => void;
  onExportPng: () => void;
}

const PreviewHeaderControls: React.FC<PreviewHeaderControlsProps> = ({
  title,
  isBuildDocsMode,
  isMarkdownMode,
  markdownNavEnabled,
  markdownNavLabel,
  markdownPrevDisabled,
  markdownNextDisabled,
  onMarkdownPrev,
  onMarkdownNext,
  showThemeControl,
  showDirectionControl,
  showLookControl,
  directionOptions,
  selectedInlineTheme,
  selectedInlineDirection,
  selectedInlineLook,
  onSetInlineTheme,
  onSetInlineDirection,
  onSetInlineLook,
  codeForRender,
  isFullScreen,
  onToggleFullScreen,
  svgMarkup,
  isExporting,
  onExportSvg,
  onExportPng,
}) => {
  return (
    <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex flex-wrap md:flex-nowrap items-center gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 truncate">{title}</div>
        {!isBuildDocsMode && (showThemeControl || showDirectionControl || showLookControl) && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/30 px-2 py-1">
            {showThemeControl && (
              <label className="flex flex-col gap-0.5 shrink-0">
                <span className="text-[10px] text-slate-500 dark:text-slate-300 font-semibold uppercase tracking-wide">
                  Theme
                </span>
                <select
                  className="h-6 min-w-[88px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-[11px] font-medium"
                  value={selectedInlineTheme}
                  onChange={(e) => onSetInlineTheme((e.target.value || null) as MermaidThemeName | null)}
                  disabled={!codeForRender.trim()}
                  aria-label="Diagram theme (inline)"
                  title="Diagram theme (inline)"
                >
                  <option value="">(none)</option>
                  <option value="default">default</option>
                  <option value="dark">dark</option>
                  <option value="forest">forest</option>
                  <option value="neutral">neutral</option>
                  <option value="base">base</option>
                </select>
              </label>
            )}

            {showDirectionControl && (
              <label className="flex flex-col gap-0.5 shrink-0">
                <span className="text-[10px] text-slate-500 dark:text-slate-300 font-semibold uppercase tracking-wide">
                  Dir
                </span>
                <select
                  className="h-6 min-w-[64px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-[11px] font-medium"
                  value={selectedInlineDirection}
                  onChange={(e) => onSetInlineDirection((e.target.value || null) as MermaidDirection | null)}
                  disabled={!codeForRender.trim() || isMarkdownMode}
                  aria-label="Diagram direction (inline)"
                  title="Diagram direction (inline)"
                >
                  <option value="">(none)</option>
                  {directionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {showLookControl && (
              <label className="flex flex-col gap-0.5 shrink-0">
                <span className="text-[10px] text-slate-500 dark:text-slate-300 font-semibold uppercase tracking-wide">
                  Look
                </span>
                <select
                  className="h-6 min-w-[92px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 text-[11px] font-medium"
                  value={selectedInlineLook}
                  onChange={(e) => onSetInlineLook((e.target.value || null) as MermaidLook | null)}
                  disabled={!codeForRender.trim()}
                  aria-label="Diagram look (inline)"
                  title="Diagram look (inline)"
                >
                  <option value="">(none)</option>
                  <option value="classic">classic</option>
                  <option value="handDrawn">handDrawn</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>
      {!isBuildDocsMode && (
        <div className="flex-1 flex items-center justify-center">
          {markdownNavEnabled && (
            <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/30 px-2 py-1">
              <button
                type="button"
                onClick={onMarkdownPrev}
                disabled={markdownPrevDisabled}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
                title="Previous diagram"
                aria-label="Previous diagram"
                data-testid="markdown-prev-diagram"
              >
                <span className="sr-only">Previous diagram</span>
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] text-slate-700 dark:text-slate-200 font-mono w-12 text-center select-none">
                {markdownNavLabel}
              </span>
              <button
                type="button"
                onClick={onMarkdownNext}
                disabled={markdownNextDisabled}
                className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-950/40 text-slate-800 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
                title="Next diagram"
                aria-label="Next diagram"
                data-testid="markdown-next-diagram"
              >
                <span className="sr-only">Next diagram</span>
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {!isBuildDocsMode && (
        <div className="flex flex-wrap items-center justify-end gap-2 normal-case tracking-normal">
          <button
            type="button"
            onClick={onToggleFullScreen}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
            title={isFullScreen ? 'Exit full screen' : 'Full screen'}
            aria-label={isFullScreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            type="button"
            onClick={onExportSvg}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-[11px] font-medium"
            title="Export SVG"
          >
            <Download size={14} />
            SVG
          </button>

          <button
            type="button"
            onClick={onExportPng}
            disabled={!svgMarkup || isExporting || isMarkdownMode}
            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 text-[11px] font-medium"
            title="Export PNG"
          >
            <Download size={14} />
            PNG
          </button>
        </div>
      )}
    </div>
  );
};

export default PreviewHeaderControls;
