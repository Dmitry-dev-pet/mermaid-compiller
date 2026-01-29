import React from 'react';
import { ChevronDown } from 'lucide-react';

type CollapsibleSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  summary?: React.ReactNode;
  children: React.ReactNode;
};

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, open, onToggle, summary, children }) => {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{title}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {!open ? (
        summary ?? null
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
};

