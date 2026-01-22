import React, { forwardRef } from 'react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  size?: 'xs' | 'sm' | 'md';
}

const sizes = {
  xs: 'h-7 px-2 text-[10px]',
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', size = 'sm', ...props }, ref) => {
    const base =
      'w-full rounded border border-[var(--panel-border)] bg-[var(--control-bg)] text-[var(--control-text)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';
    const combinedClassName = `${base} ${sizes[size]} ${className}`.trim().replace(/\s+/g, ' ');
    return <select ref={ref} className={combinedClassName} {...props} />;
  }
);

Select.displayName = 'Select';
