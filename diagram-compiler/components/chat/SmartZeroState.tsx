import React from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "../ui/Button";
import type { ZeroStatePreset } from "../../services/zeroStatePresets";

type SmartZeroStateProps = {
  title: string;
  headline: string;
  subtitle: string;
  hint: string;
  presets: ZeroStatePreset[];
  onSelectPreset?: (prompt: string) => void;
};

const SmartZeroState: React.FC<SmartZeroStateProps> = ({
  title,
  headline,
  subtitle,
  hint,
  presets,
  onSelectPreset,
}) => {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          <MessageSquare size={12} className="opacity-60" />
          {title}
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {headline}
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-3 py-1 text-xs"
              onClick={() => onSelectPreset?.(preset.prompt)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          {hint}
        </div>
      </div>
    </div>
  );
};

export default SmartZeroState;
