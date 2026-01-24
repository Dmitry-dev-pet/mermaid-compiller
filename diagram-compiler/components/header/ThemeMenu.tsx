import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Moon, Palette, Layers } from 'lucide-react';
import { ThemePresetId } from '../../types';
import { APP_THEME_PRESETS } from '../../utils/appTheme';
import { Button } from '../ui/Button';

type ThemeMenuProps = {
  theme: ThemePresetId;
  onThemeChange: (theme: ThemePresetId) => void;
};

const ThemeMenu: React.FC<ThemeMenuProps> = ({ theme, onThemeChange }) => {
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const themeLabel = APP_THEME_PRESETS.find((preset) => preset.id === theme)?.label ?? theme;
  const ThemeIcon = useMemo(() => {
    if (theme === 'lightPlus') return Palette;
    if (theme === 'darkPlus') return Moon;
    if (theme === 'abyss') return Layers;
    return Palette;
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(target)) {
        setIsThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={themeDropdownRef}>
      <Button
        type="button"
        onClick={() => setIsThemeOpen((v) => !v)}
        variant="default"
        className="px-3"
        title="Theme"
        aria-haspopup="menu"
        aria-expanded={isThemeOpen}
      >
        <ThemeIcon size={16} className="opacity-80" />
        <span className="text-[10px] font-medium ml-1">Theme</span>
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-400 ml-1">{themeLabel}</span>
        <ChevronDown size={14} className={`ml-1 transition-transform ${isThemeOpen ? 'rotate-180' : ''}`} />
      </Button>
      {isThemeOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 z-50"
          role="menu"
          aria-label="Theme"
        >
          {APP_THEME_PRESETS.map((preset) => {
            const isSelected = preset.id === theme;
            const icon =
              preset.id === 'darkPlus'
                ? Moon
                : preset.id === 'abyss'
                  ? Layers
                  : Palette;
            return (
              <Button
                key={preset.id}
                type="button"
                variant="ghost"
                onClick={() => {
                  onThemeChange(preset.id);
                  setIsThemeOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                }`}
                role="menuitem"
              >
                <span className="flex items-center gap-2">
                  {React.createElement(icon, { size: 14, className: 'opacity-80' })}
                  <span className="font-medium">{preset.label}</span>
                </span>
                {isSelected && <Check size={14} className="opacity-80" />}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThemeMenu;
