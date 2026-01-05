import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG, DEFAULT_APP_STATE } from '../constants';
import type { ModelParams } from '../types';
import { applySessionSettings, buildSessionSettings } from './sessionSettings';

describe('sessionSettings', () => {
  it('buildSessionSettings includes modelParams when provided', () => {
    const modelParams: ModelParams = { temperature: 0.3, top_p: 0.9 };
    const settings = buildSessionSettings(DEFAULT_APP_STATE, DEFAULT_AI_CONFIG, modelParams);
    expect(settings.modelParams).toEqual(modelParams);
  });

  it('applySessionSettings sets modelParams when present', () => {
    const modelParams: ModelParams = { temperature: 0.5 };
    let appliedModelParams: ModelParams | null = null;
    let appliedAppState = DEFAULT_APP_STATE;
    let appliedAiConfig = DEFAULT_AI_CONFIG;

    applySessionSettings(
      { appState: DEFAULT_APP_STATE, aiConfig: DEFAULT_AI_CONFIG, modelParams },
      (value) => { appliedAppState = value; },
      (value) => { appliedAiConfig = value; },
      (value) => { appliedModelParams = value; }
    );

    expect(appliedAppState).toEqual(DEFAULT_APP_STATE);
    expect(appliedAiConfig).toEqual(DEFAULT_AI_CONFIG);
    expect(appliedModelParams).toEqual(modelParams);
  });

  it('applySessionSettings clears modelParams when missing', () => {
    let appliedModelParams: ModelParams | null = { temperature: 0.8 };

    applySessionSettings(
      { appState: DEFAULT_APP_STATE, aiConfig: DEFAULT_AI_CONFIG },
      () => {},
      () => {},
      (value) => { appliedModelParams = value; }
    );

    expect(appliedModelParams).toBeNull();
  });
});

