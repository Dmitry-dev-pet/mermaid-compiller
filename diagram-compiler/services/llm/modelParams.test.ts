import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_PARAMS, resolveModelParams } from './modelParams';

describe('resolveModelParams', () => {
  it('returns DEFAULT_MODEL_PARAMS when empty', () => {
    expect(resolveModelParams()).toEqual(DEFAULT_MODEL_PARAMS);
    expect(resolveModelParams(null)).toEqual(DEFAULT_MODEL_PARAMS);
    expect(resolveModelParams({})).toEqual(DEFAULT_MODEL_PARAMS);
  });

  it('returns provided params when set', () => {
    expect(resolveModelParams({ temperature: 0.7, top_p: 0.9 })).toEqual({
      temperature: 0.7,
      top_p: 0.9,
    });
  });
});

