import type { AIConfig, AppState } from '../types';
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
  setAiConfig: (value: AIConfig) => void
) => {
  setAppState(settings.appState);
  setAiConfig(settings.aiConfig);
};
