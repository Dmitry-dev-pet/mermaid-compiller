import type { AIConfig, AppState, ModelParams } from '../types';
import { DEFAULT_APP_STATE } from '../constants';
import type { SessionSettings } from '../services/history/types';

const coerceThinkingStyle = (value: unknown): AppState['thinkingStyle'] => {
  if (value === 'simple' || value === 'engineering' || value === 'strict_c4') {
    return value;
  }
  return DEFAULT_APP_STATE.thinkingStyle;
};

export const buildSessionSettings = (
  appState: AppState,
  aiConfig: AIConfig,
  modelParams?: SessionSettings['modelParams']
): SessionSettings => ({
  appState,
  aiConfig,
  modelParams,
});

export const applySessionSettings = (
  settings: SessionSettings,
  setAppState: (value: AppState) => void,
  setAiConfig: (value: AIConfig) => void,
  setModelParams?: (value: ModelParams | null) => void
) => {
  const nextAppState = { ...DEFAULT_APP_STATE, ...settings.appState };
  nextAppState.thinkingStyle = coerceThinkingStyle(settings.appState?.thinkingStyle);
  setAppState(nextAppState);
  setAiConfig(settings.aiConfig);
  setModelParams?.(settings.modelParams ?? null);
};
