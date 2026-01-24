import React, { forwardRef } from 'react';

export type TabListProps = React.HTMLAttributes<HTMLDivElement>;

export const TabList = forwardRef<HTMLDivElement, TabListProps>(({ className = '', ...props }, ref) => {
  return (
    <div ref={ref} className={`flex items-center gap-1 ${className}`.trim()} {...props} />
  );
});

TabList.displayName = 'TabList';

export interface TabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean;
  size?: 'sm' | 'md';
}

const sizes = {
  sm: 'h-6 px-2 text-[10px]',
  md: 'h-7 px-3 text-xs',
};

export const Tab = forwardRef<HTMLButtonElement, TabProps>(
  ({ className = '', isActive = false, size = 'sm', type = 'button', ...props }, ref) => {
    const base =
      'inline-flex items-center gap-1 rounded border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20';
    const active = 'bg-blue-600 text-white border-blue-600';
    const inactive =
      'bg-[var(--control-bg)] text-[var(--control-text)] border-[var(--panel-border)] hover:bg-[var(--control-bg-hover)]';
    const combinedClassName = `${base} ${sizes[size]} ${isActive ? active : inactive} ${className}`
      .trim()
      .replace(/\s+/g, ' ');

    return <button ref={ref} type={type} className={combinedClassName} {...props} />;
  }
);

Tab.displayName = 'Tab';
