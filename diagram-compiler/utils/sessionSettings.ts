import type { AIConfig, AppState, ModelParams } from '../types';
import { DEFAULT_APP_STATE } from '../constants';
import type { SessionSettings } from '../services/history/types';

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
  setAppState({ ...DEFAULT_APP_STATE, ...settings.appState });
  setAiConfig(settings.aiConfig);
  setModelParams?.(settings.modelParams ?? null);
};
