import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';
import { buildOperationLogViewModel } from './operationLogUtils';
import type { DocsMode } from '../../types';

type Props = {
  operationLog: OperationLog;
  showSummaryLine?: boolean;
  timeoutMs?: number;
  onOpenBuildDocsFile?: (fileName: string, mode: DocsMode) => void;
};

const ChatOperationLog: React.FC<Props> = ({
  operationLog,
  showSummaryLine = true,
  timeoutMs = LLM_TIMEOUT_MS,
  onOpenBuildDocsFile,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [pinnedTooltip, setPinnedTooltip] = useState<string | null>(null);
  const isRunning = operationLog.status === 'running';
  const [isOpen, setIsOpen] = useState(() => isRunning);
  const [mouseDownSelectionLength, setMouseDownSelectionLength] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    setIsOpen(isRunning);
  }, [isRunning, operationLog.id]);

  useEffect(() => {
    if (!pinnedTooltip) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinnedTooltip(null);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        setPinnedTooltip(null);
        return;
      }
      const wrapper = target.closest('[data-tooltip-id]');
      if (!wrapper) setPinnedTooltip(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pinnedTooltip]);

  const { summaryLabel, summaryLine, rows } = useMemo(
    () => buildOperationLogViewModel(operationLog, { showSummaryLine, timeoutMs, now }),
    [now, operationLog, showSummaryLine, timeoutMs]
  );
  const open = isRunning ? true : isOpen;
  const hasSelection = () => {
    const selection = window.getSelection();
    if (!selection) return false;
    return selection.toString().trim().length > 0;
  };
  const normalizeFileLabel = (value: string) => {
    const trimmed = value.trim();
    const withoutSize = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return withoutSize || trimmed;
  };
  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      <details
        className="text-[11px] text-slate-500 dark:text-slate-400"
        open={open}
      >
        <summary
          className="cursor-pointer list-none select-text"
          onMouseDown={() => {
            const selection = window.getSelection();
            setMouseDownSelectionLength(selection?.toString().length ?? 0);
          }}
          onClick={(event) => {
            if (isRunning) return;
            event.preventDefault();
            // Don't toggle when user is selecting text.
            if (hasSelection() || mouseDownSelectionLength > 0) return;
            setPinnedTooltip(null);
            setIsOpen((prev) => !prev);
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            <button
              type="button"
              aria-label={open ? 'Collapse log' : 'Expand log'}
              className="inline-flex w-3 text-slate-400 dark:text-slate-500 select-none"
              onClick={(event) => {
                if (isRunning) return;
                event.preventDefault();
                event.stopPropagation();
                setPinnedTooltip(null);
                setIsOpen((prev) => !prev);
              }}
            >
              {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
            </button>
            <span className="select-text">{summaryLabel}</span>
          </span>
        </summary>
        <div className="mt-1 rounded border border-slate-200/40 dark:border-slate-800/60 bg-white/40 dark:bg-slate-950/20">
          <div className="px-2 py-1 space-y-0.5">
            {rows.map((event, index) => {
              const prev = rows[index - 1];
              const isNewBlock =
                typeof event.blockIndex === 'number'
                && typeof prev?.blockIndex === 'number'
                && event.blockIndex !== prev.blockIndex;
              return (
              <div
                key={event.id}
                className={`grid grid-cols-[4.25rem_1fr] items-start gap-x-2 text-[11px] leading-snug ${isNewBlock ? 'mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-800/70' : ''}`}
              >
                {event.isSection ? (
                  <div className="col-span-2 mt-1 first:mt-0">
                    <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-slate-200/60 dark:bg-slate-800/70" />
                    <div className="uppercase tracking-wide text-[10px] text-slate-400 dark:text-slate-500">
                      {event.text}
                    </div>
                    <div className="h-px flex-1 bg-slate-200/60 dark:bg-slate-800/70" />
                  </div>
                  </div>
                ) : (
                  <>
                    <span className="font-mono tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap">
                      {event.timeLabel ?? ''}
                    </span>
                    <div className="min-w-0 break-words">
                      {(() => {
                        const hasTooltip = Boolean(event.tooltipMessages || event.tooltipDocs || event.tooltip);
	                        if (!hasTooltip) return <div className="whitespace-pre-wrap">{event.text}</div>;
	                        const lines = event.text.split('\n');
	                        const renderLine = (line: string, index: number) => {
	                          const docsMode: DocsMode =
	                            event.contextScope === 'planner'
	                              ? 'plan'
	                              : event.contextScope === 'build' || event.contextScope === 'block'
	                                ? 'build'
	                                : 'build';
	                          const renderFileButton = (label: string) => (
	                            <button
	                              type="button"
	                              className="underline decoration-dotted hover:text-slate-900 dark:hover:text-slate-100"
	                              onClick={(eventClick) => {
	                                if (!onOpenBuildDocsFile) return;
	                                eventClick.preventDefault();
	                                eventClick.stopPropagation();
	                                onOpenBuildDocsFile(normalizeFileLabel(label), docsMode);
	                              }}
	                              title="Открыть в Build Docs"
	                            >
	                              {label}
	                            </button>
	                          );
	                          const messageMatch = event.tooltipMessages
	                            ? line.match(/^(.*?)(messages:\s.*)$/i)
	                            : null;
	                          if (messageMatch && event.tooltipMessages) {
	                            const [, prefix, messageText] = messageMatch;
	                            const tooltipId = `${event.id}-messages`;
	                            const isPinned = pinnedTooltip === tooltipId;
	                            return (
	                              <span key={`line-${index}`} className="inline-flex items-center gap-1">
	                                {prefix ? <span>{prefix}</span> : null}
	                                <span
	                                  className="group relative inline-flex items-center gap-1 cursor-help"
	                                  onClick={(clickEvent) => {
	                                    clickEvent.stopPropagation();
	                                    setPinnedTooltip((prev) => (prev === tooltipId ? null : tooltipId));
	                                  }}
	                                >
	                                  <span className="underline decoration-dotted" data-tooltip-id={tooltipId}>
	                                    {messageText}
	                                  </span>
	                                  <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
	                                  <span
	                                    aria-hidden
	                                    className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
	                                  >
	                                    Нажмите для подробностей
	                                  </span>
	                                  {isPinned ? (
	                                    <span
	                                      id={tooltipId}
	                                      tabIndex={-1}
	                                      aria-hidden={!isPinned}
	                                      className="absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg whitespace-pre-wrap"
	                                    >
	                                      {event.tooltipMessages}
	                                    </span>
	                                  ) : null}
	                                </span>
	                              </span>
	                            );
	                          }
	                        const match = line.match(/^(.*?\bdocs\b.*?:\s*)(.+)$/i);
	                        if (!match) {
	                          const trimmed = line.trim();
	                          if (/^[A-Za-z0-9_.-]+\.(?:md|mdx)\s*\([^)]*\)\s*$/i.test(trimmed)) {
	                            return renderFileButton(trimmed);
	                          }
	                          return <span key={`line-${index}`}>{line}</span>;
	                        }
	                        const [_, prefix, files] = match;
	                        const docsTooltipId = `${event.id}-docs-${index}`;
	                        const isPinned = pinnedTooltip === docsTooltipId;
	                        const fileParts = files
	                          .split(',')
	                          .map((part) => part.trim())
	                          .filter(Boolean);
                        return (
                          <span key={`line-${index}`} className="inline-flex flex-wrap items-center gap-1">
                            <span>{prefix}</span>
                            <span
                              className="group relative inline-flex items-center gap-1 cursor-help"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                setPinnedTooltip((prev) => (prev === docsTooltipId ? null : docsTooltipId));
                              }}
                            >
	                              <span className="inline-flex flex-wrap items-center gap-1" data-tooltip-id={docsTooltipId}>
	                                {fileParts.length ? (
	                                  fileParts.map((part) => {
	                                    return (
	                                      <span key={part}>{renderFileButton(part)}</span>
	                                    );
	                                  })
	                                ) : (
	                                  renderFileButton(files)
	                                )}
	                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
                              >
                                Нажмите для подробностей
                              </span>
                              {isPinned ? (
                                <span
                                  id={docsTooltipId}
                                  tabIndex={-1}
                                  aria-hidden={!isPinned}
                                  className="absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg whitespace-pre-wrap"
                                >
                                  {event.tooltipDocs ?? ''}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        );
                        };
                      return lines.map((line, index) => (
                        <div key={`line-${index}`} className="whitespace-pre-wrap">
                          {renderLine(line, index)}
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </div>
              );
            })}
          </div>
        </div>
      </details>
      {summaryLine && (
        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap truncate">
          {summaryLine}
        </div>
      )}
    </div>
  );
};

export default ChatOperationLog;
