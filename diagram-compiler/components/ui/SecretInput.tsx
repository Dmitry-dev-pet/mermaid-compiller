import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

type SecretInputProps = {
  value: string;
  onChange: (value: string) => void;
  name: string;
  placeholder?: string;
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  className?: string;
  inputClassName?: string;
  ariaLabelShow?: string;
  ariaLabelHide?: string;
};

export const SecretInput: React.FC<SecretInputProps> = ({
  value,
  onChange,
  name,
  placeholder,
  revealed,
  onRevealedChange,
  className,
  inputClassName,
  ariaLabelShow,
  ariaLabelHide,
}) => {
  return (
    <div className={`relative ${className ?? ''}`}>
      <Input
        type={revealed ? 'text' : 'password'}
        autoComplete="new-password"
        name={name}
        data-1p-ignore="true"
        data-lpignore="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        size="md"
        className={`pr-8 ${inputClassName ?? ''}`}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRevealedChange(!revealed)}
        className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        aria-label={revealed ? (ariaLabelHide ?? 'Hide secret') : (ariaLabelShow ?? 'Show secret')}
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </Button>
    </div>
  );
};

