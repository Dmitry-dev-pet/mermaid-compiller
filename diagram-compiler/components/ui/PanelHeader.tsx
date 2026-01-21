import React from 'react';

type PanelHeaderProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
};

const PanelHeader = React.forwardRef<HTMLElement, PanelHeaderProps>(
  ({ as, className, style, ...props }, ref) => {
    const Component = as ?? 'div';
    return (
      <Component
        ref={ref}
        className={[
          'px-4 py-2 border-b bg-transparent',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          backgroundColor: 'var(--panel-alt-bg, #ffffff)',
          borderColor: 'var(--panel-border, #e5e7eb)',
          ...style,
        }}
        {...props}
      />
    );
  }
);

PanelHeader.displayName = 'PanelHeader';

export default PanelHeader;

