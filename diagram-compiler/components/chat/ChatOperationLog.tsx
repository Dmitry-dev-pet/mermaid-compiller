import React, { useEffect, useMemo, useState } from 'react';
import type { OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';
import { buildOperationLogViewModel } from './operationLogUtils';

type Props = {
  operationLog: OperationLog;
  showSummaryLine?: boolean;
  timeoutMs?: number;
};

const ChatOperationLog: React.FC<Props> = ({ operationLog, showSummaryLine = true, timeoutMs = LLM_TIMEOUT_MS }) => {
  const [now, setNow] = useState(Date.now());
  const [pinnedTooltip, setPinnedTooltip] = useState<string | null>(null);
  const isRunning = operationLog.status === 'running';

  useEffect(() => {
    if (!isRunning) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

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
  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      <details className="text-[11px] text-slate-500 dark:text-slate-400" open={isRunning}>
        <summary className="cursor-pointer list-none">{summaryLabel}</summary>
        <div className="mt-1 space-y-1">
          {rows.map((event) => (
            <div key={event.id} className="flex items-start gap-2 text-[11px] leading-snug">
              {event.isSection ? (
                <span className="flex-1 uppercase tracking-wide text-[10px] text-slate-400 dark:text-slate-500">
                  {event.text}
                </span>
              ) : (
                <>
                  <span className="text-slate-400 dark:text-slate-500">-</span>
                  <span className="w-[3.5rem] text-right text-slate-400 dark:text-slate-500 tabular-nums">
                    {event.timeLabel ?? ''}
                  </span>
                  <div className="flex-1 break-words">
                    {(() => {
                      const hasTooltip = Boolean(event.tooltipMessages || event.tooltipDocs || event.tooltip);
                      if (!hasTooltip) return <div className="whitespace-pre-wrap">{event.text}</div>;
                      const lines = event.text.split('\n');
                      const renderLine = (line: string, index: number) => {
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
                                <span className="underline decoration-dotted" data-tooltip-id={tooltipId}>{messageText}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
                                <span
                                  aria-hidden
                                  className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
                                >
                                  Нажмите для подробностей
                                </span>
                                <span
                                  id={tooltipId}
                                  tabIndex={-1}
                                  aria-hidden={!isPinned}
                                  className={`absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg transition-opacity whitespace-pre-wrap ${isPinned ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none group-hover:pointer-events-none'}`}
                                >
                                  {event.tooltipMessages}
                                </span>
                              </span>
                            </span>
                          );
                        }
                        const match = line.match(/^(.*?\bdocs\b.*?:\s*)(.+)$/i);
                        if (!match) {
                          return <span key={`line-${index}`}>{line}</span>;
                        }
                        const [_, prefix, files] = match;
                        const docsTooltipId = `${event.id}-docs-${index}`;
                        const isPinned = pinnedTooltip === docsTooltipId;
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
                              <span className="underline decoration-dotted" data-tooltip-id={docsTooltipId}>{files}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">i</span>
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg select-none ${isPinned ? 'hidden' : 'hidden group-hover:block'}`}
                              >
                                Нажмите для подробностей
                              </span>
                              <span
                                id={docsTooltipId}
                                tabIndex={-1}
                                aria-hidden={!isPinned}
                                className={`absolute left-0 top-full z-50 mt-6 max-h-64 w-[28rem] overflow-auto rounded bg-slate-900 px-2 py-1 text-[10px] text-slate-100 shadow-lg transition-opacity whitespace-pre-wrap ${isPinned ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none group-hover:pointer-events-none'}`}
                              >
                                {event.tooltipDocs ?? ''}
                              </span>
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
          ))}
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
