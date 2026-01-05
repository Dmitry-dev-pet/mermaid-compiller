import type { ModelParams } from '../../types';

export const DEFAULT_MODEL_PARAMS: ModelParams = { temperature: 0.2 };

export const resolveModelParams = (modelParams?: ModelParams | null): ModelParams => {
  if (modelParams && Object.keys(modelParams).length > 0) {
    return modelParams;
  }
  return DEFAULT_MODEL_PARAMS;
};
