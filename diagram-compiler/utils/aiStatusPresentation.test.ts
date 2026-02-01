import { describe, expect, it } from 'vitest';
import { getCliproxyViaProviders, getProviderBadges } from './aiStatusPresentation';
import type { CliproxyAuthFile } from './cliproxyAuthFileStatus';
import type { Model } from '../types';

const readyFile = (provider: string): CliproxyAuthFile => ({
  id: provider,
  provider,
  status: 'ready',
});

describe('aiStatusPresentation', () => {
  it('returns openrouter provider badge', () => {
    expect(getProviderBadges({
      aiProvider: 'openrouter',
      family: 'gpt',
      model: null,
      cliproxyAuthFiles: [],
    })).toEqual(['openrouter']);
  });

  it('returns agent badge by family', () => {
    expect(getProviderBadges({
      aiProvider: 'agent',
      family: 'gemini',
      model: null,
      cliproxyAuthFiles: [],
    })).toEqual(['gemini-cli']);
    expect(getProviderBadges({
      aiProvider: 'agent',
      family: 'gpt',
      model: null,
      cliproxyAuthFiles: [],
    })).toEqual(['codex']);
  });

  it('derives cliproxy via providers', () => {
    const model: Model = {
      id: 'gemini-3-pro-preview',
      name: 'Gemini 3 Pro',
      vendor: 'google',
      ownedBy: 'antigravity',
    };
    const via = getCliproxyViaProviders({
      selectedModelId: model.id,
      modelVendor: model.vendor,
      modelName: model.name,
      modelOwnedBy: model.ownedBy,
      cliproxyAuthFiles: [readyFile('gemini-cli'), readyFile('antigravity')],
    });
    expect(via).toContain('gemini-cli');
    expect(via).toContain('antigravity');
  });
});
