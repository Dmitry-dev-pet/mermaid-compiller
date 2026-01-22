import React from 'react';
import { Button } from './Button';
import { HEADER_CONTROL_BUTTON } from '../../utils/uiControlStyles';

type ModeToggleOption = {
  id: string;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
};

type ModeToggleProps = {
  options: ModeToggleOption[];
  className?: string;
};

const buttonBase =
  'inline-flex h-6 items-center justify-center gap-1 px-2 text-[10px] font-medium leading-none transition-colors select-none rounded border border-transparent';

const ModeToggle: React.FC<ModeToggleProps> = ({ options, className = '' }) => {
  return (
    <div className={`${HEADER_CONTROL_BUTTON} px-1 gap-1 ${className}`.trim()}>
      {options.map((option) => {
        const isActive = !!option.active;
        const isDisabled = !!option.disabled;
        return (
          <Button
            key={option.id}
            type="button"
            variant="ghost"
            onClick={option.onClick}
            disabled={isDisabled}
            className={`${buttonBase} focus:ring-0 focus:ring-transparent ${
              isActive
                ? 'text-slate-900 dark:text-slate-50 bg-slate-200/60 dark:bg-slate-800/60 border-[var(--panel-border)]'
                : isDisabled
                  ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-50 hover:bg-[var(--control-bg-hover)]'
            }`}
            aria-pressed={isActive}
            title={option.title}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
};

export default ModeToggle;
