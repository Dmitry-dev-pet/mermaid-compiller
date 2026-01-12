import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { OperationLog } from '../../types';
import { LLM_TIMEOUT_MS } from '../../constants';
import { buildOperationLogViewModel } from './operationLogUtils';
import type { DocsMode } from '../../types';
import OperationLogRowText from './OperationLogRowText';

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
  const [isOpen, setIsOpen] = useState(false);
  const [mouseDownSelectionLength, setMouseDownSelectionLength] = useState(0);

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
      const wrapper = target.closest('[data-tooltip-root]');
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
                      <OperationLogRowText
                        row={event}
                        pinnedTooltip={pinnedTooltip}
                        setPinnedTooltip={setPinnedTooltip}
                        onOpenBuildDocsFile={onOpenBuildDocsFile}
                      />
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
