import { DEFAULT_AI_CONFIG } from '../constants';
import type { AIConfig, ProviderFilters } from '../types';

type LegacyFilters = {
  freeOnly?: boolean;
  testedOnly?: boolean;
  experimental?: boolean;
};

export type LegacyAIConfig = Partial<AIConfig> & {
  filters?: LegacyFilters;
  filtersByProvider?: Partial<ProviderFilters> | null;
  selectedModelIdByProvider?: Partial<Record<AIConfig['provider'], string>> | null;
};

const normalizeProxyFilters = (value: unknown): { family: string; provider: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { family: '', provider: '' };
  const obj = value as Record<string, unknown>;
  const family = typeof obj.family === 'string' ? obj.family : '';
  const provider =
    typeof obj.provider === 'string'
      ? obj.provider
      : typeof obj.ownedBy === 'string'
        ? obj.ownedBy
        : '';
  const normalizedFamily = family.trim().toLowerCase();
  const normalizedProvider = provider.trim().toLowerCase();

  // Back-compat: old "provider=google" meant "Gemini models" (vendor google),
  // not strictly owned_by=google.
  if (!normalizedFamily && normalizedProvider === 'google') {
    return { family: 'gemini', provider: '' };
  }

  return { family, provider };
};

export const normalizeAiConfig = (config: LegacyAIConfig | null | undefined): AIConfig => {
  const raw = config ?? {};
  const { filters: legacyFilters, filtersByProvider: legacyByProvider, selectedModelIdByProvider: legacyModels, ...rest } = raw;

  const openRouterDefaults = DEFAULT_AI_CONFIG.filtersByProvider.openrouter;

  const openrouterFilters = {
    ...openRouterDefaults,
    ...(legacyByProvider?.openrouter ?? {}),
    ...(legacyFilters ?? {}),
  };

  const agentFilters = normalizeProxyFilters(legacyByProvider?.agent ?? null);
  const cliproxyFilters = normalizeProxyFilters(legacyByProvider?.cliproxy ?? null);

  const selectedModelIdByProvider: Record<AIConfig['provider'], string> = {
    openrouter: '',
    agent: '',
    cliproxy: '',
    ...(legacyModels ?? {}),
  };

  const provider = raw.provider ?? DEFAULT_AI_CONFIG.provider;
  if (raw.selectedModelId && !selectedModelIdByProvider[provider]) {
    selectedModelIdByProvider[provider] = raw.selectedModelId;
  }

  const agentToken =
    typeof raw.agentToken === 'string' && raw.agentToken.trim().length > 0
      ? raw.agentToken
      : DEFAULT_AI_CONFIG.agentToken;

  const proxyManagementKey =
    typeof raw.proxyManagementKey === 'string' ? raw.proxyManagementKey : DEFAULT_AI_CONFIG.proxyManagementKey;

  return {
    ...DEFAULT_AI_CONFIG,
    ...rest,
    provider,
    agentToken,
    proxyManagementKey,
    selectedModelIdByProvider,
    filtersByProvider: {
      openrouter: openrouterFilters,
      agent: agentFilters,
      cliproxy: cliproxyFilters,
    },
  };
};
