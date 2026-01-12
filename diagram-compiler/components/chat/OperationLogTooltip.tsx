import React from 'react';

type Props = {
  tooltipId: string;
  content: string;
  pinnedTooltip: string | null;
  setPinnedTooltip: React.Dispatch<React.SetStateAction<string | null>>;
  children: React.ReactNode;
};

const OperationLogTooltip: React.FC<Props> = ({
  tooltipId,
  content,
  pinnedTooltip,
  setPinnedTooltip,
  children,
}) => {
  const isPinned = pinnedTooltip === tooltipId;
  return (
    <span
      className="group relative inline-flex items-center gap-1 cursor-help"
      data-tooltip-root={tooltipId}
      onClick={(event) => {
        event.stopPropagation();
        setPinnedTooltip((prev) => (prev === tooltipId ? null : tooltipId));
      }}
    >
      <span data-tooltip-id={tooltipId}>{children}</span>
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
          {content}
        </span>
      ) : null}
    </span>
  );
};

export default OperationLogTooltip;
