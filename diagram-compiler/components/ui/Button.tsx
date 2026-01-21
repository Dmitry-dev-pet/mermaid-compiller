import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'icon';
  isLoading?: boolean;
}

const variants = {
  // Corresponds to previous HEADER_CONTROL_BUTTON styles
  default: "border border-[var(--panel-border)] bg-[var(--control-bg)] text-[var(--control-text)] hover:bg-[var(--control-bg-hover)]",
  // Transparent, for menus and icons
  ghost: "bg-transparent hover:bg-[var(--control-bg-hover)] text-[var(--control-text)] border border-transparent",
  // Emphasis action
  primary: "bg-blue-600 text-white hover:bg-blue-700 border border-transparent shadow-sm",
  // Border only
  outline: "border border-[var(--panel-border)] bg-transparent hover:bg-[var(--control-bg-hover)] text-[var(--control-text)]",
  // Destructive action
  danger: "bg-red-500 text-white hover:bg-red-600 border border-transparent"
};

const sizes = {
  // Standard small size (matching previous h-7)
  sm: "h-7 px-2 text-[10px]",
  // Larger standard size
  md: "h-9 px-4 py-2 text-sm",
  // Square icon button
  icon: "h-7 w-7 p-0 flex items-center justify-center"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className = "", 
    variant = "default", 
    size = "sm", 
    isLoading = false, 
    children, 
    disabled, 
    ...props 
  }, ref) => {

    const baseClass = "inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:pointer-events-none";
    
    const combinedClassName = `
      ${baseClass} 
      ${variants[variant]} 
      ${sizes[size]} 
      ${className}
    `.trim().replace(/\s+/g, ' ');

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={combinedClassName}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
