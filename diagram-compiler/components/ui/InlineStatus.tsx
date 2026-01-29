import React from 'react';

export type InlineStatusKind = 'idle' | 'loading' | 'syncing' | 'success' | 'error' | 'cancelled';

export const InlineStatus: React.FC<{ kind: InlineStatusKind; message?: string }> = ({ kind, message }) => {
  if (!message || kind === 'idle') return null;

  const className =
    kind === 'loading' || kind === 'syncing'
      ? 'text-amber-600 dark:text-amber-300'
      : kind === 'error'
        ? 'text-rose-600 dark:text-rose-300'
        : kind === 'success'
          ? 'text-emerald-600 dark:text-emerald-300'
          : 'text-slate-500 dark:text-slate-400';

  return (
    <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
      <span className={className}>{message}</span>
    </div>
  );
};

