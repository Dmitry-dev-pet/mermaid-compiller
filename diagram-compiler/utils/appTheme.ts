import type { ColorScheme, ThemePresetId } from '../types';

export type AppThemePreset = {
  id: ThemePresetId;
  label: string;
  colorScheme: ColorScheme;
  appBackground: string;
  headerBackground: string;
  panelBackground: string;
  panelAltBackground: string;
  borderColor: string;
  controlBackground: string;
  controlHoverBackground: string;
  controlText: string;
  controlMutedText: string;
  menuBackground: string;
  menuHoverBackground: string;
};

export const APP_THEME_PRESETS: AppThemePreset[] = [
  {
    id: 'lightPlus',
    label: 'Light+',
    colorScheme: 'light',
    appBackground: '#ffffff',
    headerBackground: '#e7e7e7',
    panelBackground: '#f3f3f3',
    panelAltBackground: '#ffffff',
    borderColor: '#e5e5e5',
    controlBackground: '#ffffff',
    controlHoverBackground: '#f3f4f6',
    controlText: '#0f172a',
    controlMutedText: '#64748b',
    menuBackground: '#ffffff',
    menuHoverBackground: '#f3f4f6',
  },
  {
    id: 'darkPlus',
    label: 'Dark+',
    colorScheme: 'dark',
    appBackground: '#1e1e1e',
    headerBackground: '#3c3c3c',
    panelBackground: '#252526',
    panelAltBackground: '#1e1e1e',
    borderColor: '#3c3c3c',
    controlBackground: '#1e1e1e',
    controlHoverBackground: '#2a2d2e',
    controlText: '#d4d4d4',
    controlMutedText: '#9da5b4',
    menuBackground: '#252526',
    menuHoverBackground: '#2a2d2e',
  },
  {
    id: 'abyss',
    label: 'Abyss',
    colorScheme: 'dark',
    appBackground: '#0c1e2b',
    headerBackground: '#0b2437',
    panelBackground: '#0f2a3f',
    panelAltBackground: '#0c1e2b',
    borderColor: '#1b3b54',
    controlBackground: '#0c1e2b',
    controlHoverBackground: '#123145',
    controlText: '#dbeafe',
    controlMutedText: '#94a3b8',
    menuBackground: '#0f2a3f',
    menuHoverBackground: '#123145',
  },
];

export const isThemePresetId = (value: unknown): value is ThemePresetId => {
  return (
    value === 'lightPlus'
    || value === 'darkPlus'
    || value === 'abyss'
  );
};

export const coerceThemePresetId = (value: unknown): ThemePresetId => {
  // Migration from earlier versions.
  if (value === 'light') return 'lightPlus';
  if (value === 'dark') return 'darkPlus';
  if (value === 'paper') return 'lightPlus';
  if (value === 'default') return 'lightPlus';
  if (value === 'neutral') return 'lightPlus';
  if (value === 'base') return 'lightPlus';
  if (value === 'dim') return 'darkPlus';
  if (value === 'forest') return 'abyss';
  if (value === 'darkPlus') return 'darkPlus';
  if (value === 'lightPlus') return 'lightPlus';
  if (value === 'abyss') return 'abyss';
  return isThemePresetId(value) ? value : 'lightPlus';
};

export const getThemeColorScheme = (presetId: ThemePresetId): ColorScheme => {
  const preset = APP_THEME_PRESETS.find((p) => p.id === presetId);
  return preset?.colorScheme ?? 'light';
};

export const getAppThemeTokens = (presetId: ThemePresetId): AppThemePreset => {
  const preset = APP_THEME_PRESETS.find((p) => p.id === presetId);
  return preset ?? APP_THEME_PRESETS[0]!;
};
