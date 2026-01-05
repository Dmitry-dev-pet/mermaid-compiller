import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Message } from '../../types';
import { getAttemptIndicator, parseNotebookBuildMessage } from './chatMessageUtils';

type Props = {
  messages: Message[];
  isProcessing: boolean;
  isLatestGroup: boolean;
  onOpenNotebookBlock?: (index: number) => void;
};

const summarizeStatusGroup = (group: Message[]) => {
  let ok = 0;
  let failed = 0;
  let blocks = 0;
  let attemptsUsed = 0;
  let attemptsMax = 0;
  let autoFixTotal = 0;
  const errors: string[] = [];
  for (const msg of group) {
    const text = msg.content.replace(/^\[notebook-block:\d+\]\s*/i, '').toLowerCase();
    if (text.includes('сборка: блок') || text.includes('notebook block')) blocks += 1;
    if (text.includes('— готов') || text.includes('— готов.')) ok += 1;
    if (text.includes('— невалиден') || text.includes('failed') || text.includes('error')) failed += 1;
    const attemptMatch = text.match(/попытки:\s*(\d+)\s*\/\s*(\d+)/i);
    if (attemptMatch) {
      attemptsUsed += Number(attemptMatch[1]);
      attemptsMax += Number(attemptMatch[2]);
    }
    const autoFixMatch = text.match(/auto-fix:\s*(\d+)/i);
    if (autoFixMatch) {
      autoFixTotal += Number(autoFixMatch[1]);
    }
    const errorMatch = text.match(/последняя ошибка:\s*(.+)$/i);
    if (errorMatch?.[1]) {
      errors.push(errorMatch[1].trim());
    }
  }
  if (ok === 0 && failed === 0 && blocks === 0) return null;
  const parts = [
    `Итог: блоков ${blocks || ok + failed}, успешно ${ok}${failed ? `, ошибок ${failed}` : ''}`,
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

const ChatStatusGroup: React.FC<Props> = ({ messages, isProcessing, isLatestGroup, onOpenNotebookBlock }) => {
  const summaryLabel = isProcessing && isLatestGroup ? 'Working' : 'Finished working';
  const summaryLine = !isProcessing ? summarizeStatusGroup(messages) : null;

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
                  <button
                    type="button"
                    onClick={() => onOpenNotebookBlock?.(notebookBuildMeta.blockIndex)}
                    className="shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
                    title="Open diagram"
                  >
                    <ArrowUpRight size={12} />
                  </button>
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
