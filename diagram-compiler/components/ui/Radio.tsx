import React, { forwardRef } from 'react';

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

export const RadioGroup: React.FC<RadioGroupProps> = ({ className = '', ...props }) => {
  return <div className={`flex items-center gap-3 ${className}`.trim()} {...props} />;
};

export interface RadioOptionProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
}

export const RadioOption = forwardRef<HTMLInputElement, RadioOptionProps>(
  ({ label, className = '', checked, ...props }, ref) => {
    const base =
      'inline-flex items-center gap-2 rounded border px-2 py-1 text-xs font-medium transition-colors cursor-pointer';
    const active = 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200';
    const inactive =
      'border-[var(--panel-border)] bg-[var(--control-bg)] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]';
    const combinedClassName = `${base} ${checked ? active : inactive} ${className}`.trim().replace(/\s+/g, ' ');

    return (
      <label className={combinedClassName}>
        <input ref={ref} type="radio" className="accent-blue-600" checked={checked} {...props} />
        <span>{label}</span>
      </label>
    );
  }
);

RadioOption.displayName = 'RadioOption';
