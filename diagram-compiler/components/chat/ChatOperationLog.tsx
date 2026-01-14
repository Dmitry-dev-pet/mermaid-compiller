import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
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
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
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
    <div className="text-[11px] text-[var(--control-muted-text)]">
      <details
        className="text-[11px] text-[var(--control-muted-text)]"
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
              className="inline-flex w-3 text-[var(--control-muted-text)] select-none"
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
            <span className="select-text text-[var(--control-text)]">{summaryLabel}</span>
          </span>
        </summary>
        <div className="mt-1 rounded border border-[var(--panel-border)] bg-[var(--menu-bg)]">
          <div className="px-2 py-1 space-y-0.5">
            {rows.map((event, index) => {
              const isNewBlock = event.isNewBlock;
              const statusIcon = event.leftBadge?.status === 'ok'
                ? (
                    <CheckCircle2
                      aria-label="OK"
                      size={10}
                      className="text-emerald-600 dark:text-emerald-300"
                      title="OK"
                    />
                  )
                : event.leftBadge?.status === 'err'
                  ? (
                      <AlertTriangle
                        aria-label="Error"
                        size={10}
                        className="text-amber-600 dark:text-amber-300"
                        title="Error"
                      />
                    )
                  : null;
              const showBlockMeta = Boolean(event.leftBadge);
              const blockBadgeClassName = event.leftBadge?.status === 'ok'
                ? 'border-emerald-500/60 text-emerald-700 dark:text-emerald-200 dark:border-emerald-400/40'
                : event.leftBadge?.status === 'err'
                  ? 'border-amber-500/60 text-amber-700 dark:text-amber-200 dark:border-amber-400/40'
                  : 'border-[var(--panel-border)] text-[var(--control-muted-text)]';
              return (
              <div
                key={event.id}
                className={`grid grid-cols-[7rem_1fr_4rem_5rem] items-start gap-x-2 text-[11px] leading-snug ${isNewBlock ? 'mt-1 pt-1 border-t border-[var(--panel-border)]' : ''}`}
              >
                {event.isSection ? (
                  <div className="col-span-4 mt-1 first:mt-0">
                    <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-[var(--panel-border)]" />
                    <div className="uppercase tracking-wide text-[10px] text-[var(--control-muted-text)]">
                      {event.text}
                    </div>
                    <div className="h-px flex-1 bg-[var(--panel-border)]" />
                  </div>
                  </div>
                ) : (
                  <>
                    <div className="font-mono tabular-nums text-[var(--control-muted-text)] whitespace-nowrap">
                      {showBlockMeta ? (
                        <div className="inline-flex items-center gap-2">
                          {event.leftLabel ? <span>{event.leftLabel}</span> : null}
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none ${blockBadgeClassName}`}
                            title={event.leftBadge?.status === 'ok' ? 'OK' : event.leftBadge?.status === 'err' ? 'Error' : undefined}
                          >
                            <span>{event.leftBadge?.text}</span>
                            {statusIcon}
                          </span>
                        </div>
                      ) : (
                        <div>{event.leftLabel}</div>
                      )}
                    </div>
                    <div className="min-w-0 break-words text-[var(--control-text)]">
                      <OperationLogRowText
                        row={event}
                        pinnedTooltip={pinnedTooltip}
                        setPinnedTooltip={setPinnedTooltip}
                        onOpenBuildDocsFile={onOpenBuildDocsFile}
                      />
                  </div>
                    <span
                      className="text-right font-mono tabular-nums text-[var(--control-muted-text)] whitespace-nowrap"
                      title={event.volumeLabel ? 'Approx context volume' : undefined}
                    >
                      {event.volumeLabel ?? ''}
                    </span>
                    <span className="text-right font-mono tabular-nums text-[var(--control-muted-text)] whitespace-nowrap">
                      {event.timeLabel ?? ''}
                    </span>
                </>
              )}
            </div>
              );
            })}
          </div>
        </div>
      </details>
      {summaryLine && (
        <div className="mt-1 text-[11px] text-[var(--control-muted-text)] whitespace-nowrap truncate">
          {summaryLine}
        </div>
      )}
    </div>
  );
};

export default ChatOperationLog;
