import React from 'react';
import { Button } from '../ui/Button';
import { ArrowUpRight } from 'lucide-react';
import type { Message, OperationLog } from '../../types';
import { getAttemptIndicator, parseNotebookBuildMessage } from './chatMessageUtils';

type Props = {
  messages: Message[];
  operationLog?: OperationLog | null;
  isProcessing: boolean;
  isLatestGroup: boolean;
  onOpenNotebookBlock?: (index: number) => void;
};

const summarizeStatusGroup = (operationLog?: OperationLog | null) => {
  if (!operationLog) return null;
  let ok = 0;
  let failed = 0;
  const blockIds = new Set<number>();
  const statusByBlock = new Map<number, 'ok' | 'err'>();
  const attemptsByBlock = new Map<number, { current: number; max: number }>();
  const autoFixByBlock = new Map<number, number>();
  const errors: string[] = [];

  for (const event of operationLog.events) {
    if (typeof event.blockIndex === 'number') {
      blockIds.add(event.blockIndex);
    }
    if (event.title === 'Block validation' && typeof event.blockIndex === 'number') {
      statusByBlock.set(event.blockIndex, event.detail === 'valid' ? 'ok' : 'err');
      if (event.metrics?.autoFix) {
        autoFixByBlock.set(event.blockIndex, event.metrics.autoFix);
      }
    }
    if ((event.level === 'warn' || event.level === 'error') && typeof event.blockIndex === 'number') {
      statusByBlock.set(event.blockIndex, 'err');
      const errorText = event.error?.message ?? event.detail;
      if (errorText) errors.push(errorText);
    }
    if (event.attempt && typeof event.blockIndex === 'number') {
      attemptsByBlock.set(event.blockIndex, event.attempt);
    }
  }

  for (const status of statusByBlock.values()) {
    if (status === 'ok') ok += 1;
    if (status === 'err') failed += 1;
  }

  const blocks = blockIds.size || ok + failed;
  if (blocks === 0) return null;

  const attemptsUsed = Array.from(attemptsByBlock.values())
    .reduce((sum, attempt) => sum + attempt.current, 0);
  const attemptsMax = Array.from(attemptsByBlock.values())
    .reduce((sum, attempt) => sum + attempt.max, 0);
  const autoFixTotal = Array.from(autoFixByBlock.values())
    .reduce((sum, value) => sum + value, 0);
  const parts = [
    `Итог: блоков ${blocks}, успешно ${ok}${failed ? `, ошибок ${failed}` : ''}`,
  ];
  if (attemptsUsed && attemptsMax) {
    parts.push(`попытки ${attemptsUsed}/${attemptsMax}`);
  }
  if (autoFixTotal) {
    parts.push(`auto-fix ${autoFixTotal}`);
  }
  if (errors.length) {
    const uniqueErrors = Array.from(new Set(errors)).slice(0, 2);
    parts.push(`ошибки: ${uniqueErrors.join('; ')}`);
  }
  return parts.join(' • ');
};

const ChatStatusGroup: React.FC<Props> = ({ messages, operationLog, isProcessing, isLatestGroup, onOpenNotebookBlock }) => {
  const summaryLabel = isProcessing && isLatestGroup ? 'Working' : 'Finished working';
  const summaryLine = !isProcessing ? summarizeStatusGroup(operationLog) : null;

  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      <details
        className="text-[11px] text-slate-500 dark:text-slate-400"
        open={isProcessing && isLatestGroup}
      >
        <summary className="cursor-pointer list-none">{summaryLabel}</summary>
        <div className="mt-1 space-y-1">
          {messages.map((msg) => {
            const notebookBuildMeta = parseNotebookBuildMessage(msg);
            const messageText = notebookBuildMeta ? notebookBuildMeta.text : msg.content;
            const attemptInfo = getAttemptIndicator(messageText);
            const canOpenNotebook = notebookBuildMeta && typeof onOpenNotebookBlock === 'function';
            return (
              <div key={msg.id} className="flex items-start gap-2 text-[11px] leading-snug">
                <span className="text-slate-400 dark:text-slate-500">-</span>
                <span className="flex-1 whitespace-pre-wrap break-words">{messageText}</span>
                {attemptInfo && (
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: attemptInfo.total }).map((_, attemptIndex) => {
                      const isFilled = attemptIndex < attemptInfo.remaining;
                      return (
                        <span
                          key={`${msg.id}-attempt-${attemptIndex}`}
                          className={`h-1.5 w-1.5 rounded-[2px] ${
                            isFilled
                              ? 'bg-slate-500 dark:bg-slate-400'
                              : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        />
                      );
                    })}
                  </span>
                )}
                {canOpenNotebook && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenNotebookBlock?.(notebookBuildMeta.blockIndex)}
                    className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
                    title="Open diagram"
                  >
                    <ArrowUpRight size={12} />
                  </Button>
                )}
              </div>
            );
          })}
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

export default ChatStatusGroup;
