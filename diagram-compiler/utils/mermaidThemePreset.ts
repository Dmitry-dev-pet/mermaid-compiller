import { extractInlineThemeCommand, MermaidThemeName, setInlineThemeCommand } from './inlineThemeCommand';
import { removeFrontmatterThemeVariables, setFrontmatterThemeVariables } from './mermaidFrontmatterThemeVariables';
import type { ThemePresetId } from '../types';

export type MermaidThemePresetId = ThemePresetId;

export type MermaidThemePreset = {
  id: MermaidThemePresetId;
  label: string;
  theme: MermaidThemeName;
  themeVariables?: Record<string, string | number | boolean>;
  panelBackground?: string;
};

export const MERMAID_THEME_PRESETS: MermaidThemePreset[] = [
  {
    id: 'lightPlus',
    label: 'Light+',
    theme: 'base',
    themeVariables: {
      darkMode: false,
      background: '#f3f3f3',
      primaryColor: '#ffffff',
      primaryTextColor: '#0f172a',
      lineColor: '#374151',
      tertiaryColor: '#ffffff',
      noteBkgColor: '#fff7ed',
      noteTextColor: '#0f172a',
    },
    panelBackground: '#f3f3f3',
  },
  {
    id: 'darkPlus',
    label: 'Dark+',
    theme: 'base',
    themeVariables: {
      darkMode: true,
      background: '#252526',
      primaryColor: '#1e1e1e',
      primaryTextColor: '#d4d4d4',
      lineColor: '#9da5b4',
      tertiaryColor: '#1e1e1e',
      noteBkgColor: '#1e1e1e',
      noteTextColor: '#d4d4d4',
    },
    panelBackground: '#252526',
  },
  {
    id: 'abyss',
    label: 'Abyss',
    theme: 'base',
    themeVariables: {
      darkMode: true,
      background: '#0f2a3f',
      primaryColor: '#0c1e2b',
      primaryTextColor: '#dbeafe',
      lineColor: '#7dd3fc',
      tertiaryColor: '#0c1e2b',
      noteBkgColor: '#0c1e2b',
      noteTextColor: '#dbeafe',
    },
    panelBackground: '#0f2a3f',
  },
];

const getPreset = (id: MermaidThemePresetId): MermaidThemePreset => {
  const found = MERMAID_THEME_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown Mermaid theme preset: ${id}`);
  return found;
};

const shallowEqualRecord = (
  a: Record<string, string | number | boolean>,
  b: Record<string, string | number | boolean>
): boolean => {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]!;
    if (key !== bKeys[i]) return false;
    if (String(a[key]) !== String(b[key])) return false;
  }
  return true;
};

export const extractMermaidThemePreset = (
  code: string,
  args?: { themeVariables?: Record<string, string | number | boolean> | null }
): MermaidThemePresetId | null => {
  const theme = extractInlineThemeCommand(code).theme;
  if (!theme) return null;
  if (theme !== 'base') {
    // Map Mermaid built-in themes to the closest preset.
    if (theme === 'dark') return 'darkPlus';
    if (theme === 'forest') return 'abyss';
    return 'lightPlus';
  }

  const vars = args?.themeVariables ?? null;
  if (!vars) return 'lightPlus';

  for (const preset of MERMAID_THEME_PRESETS) {
    if (preset.theme !== 'base') continue;
    if (!preset.themeVariables) continue;
    if (shallowEqualRecord(vars, preset.themeVariables)) return preset.id;
  }
  return 'lightPlus';
};

export const setMermaidThemePreset = (code: string, presetId: MermaidThemePresetId | null): string => {
  if (!code.trim()) return code;

  if (!presetId) {
    const clearedTheme = setInlineThemeCommand(code, null);
    return removeFrontmatterThemeVariables(clearedTheme);
  }

  const preset = getPreset(presetId);
  const withTheme = setInlineThemeCommand(code, preset.theme);
  if (!preset.themeVariables) return removeFrontmatterThemeVariables(withTheme);
  return setFrontmatterThemeVariables(withTheme, preset.themeVariables);
};

export const getMermaidThemePresetPanelBackground = (
  presetId: MermaidThemePresetId | null,
  defaultPresetId: MermaidThemePresetId
): string => {
  const effectiveId = presetId ?? defaultPresetId;
  const preset = MERMAID_THEME_PRESETS.find((p) => p.id === effectiveId);
  const backgroundFromVars = preset?.themeVariables?.background;
  if (typeof backgroundFromVars === 'string' && backgroundFromVars.trim()) return backgroundFromVars;
  if (typeof preset?.panelBackground === 'string' && preset.panelBackground.trim()) return preset.panelBackground;
  return '#f3f3f3';
};
