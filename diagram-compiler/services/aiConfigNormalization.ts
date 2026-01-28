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

export const normalizeAiConfig = (config: LegacyAIConfig | null | undefined): AIConfig => {
  const raw = config ?? {};
  const { filters: legacyFilters, filtersByProvider: legacyByProvider, selectedModelIdByProvider: legacyModels, ...rest } = raw;

  const openRouterDefaults = DEFAULT_AI_CONFIG.filtersByProvider.openrouter;
  const agentDefaults = DEFAULT_AI_CONFIG.filtersByProvider.agent;
  const cliproxyDefaults = DEFAULT_AI_CONFIG.filtersByProvider.cliproxy;

  const openrouterFilters = {
    ...openRouterDefaults,
    ...(legacyByProvider?.openrouter ?? {}),
    ...(legacyFilters ?? {}),
  };

  const agentFilters = {
    ...agentDefaults,
    ...(legacyByProvider?.agent ?? {}),
  };

  const cliproxyFilters = {
    ...cliproxyDefaults,
    ...(legacyByProvider?.cliproxy ?? {}),
  };

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

  return {
    ...DEFAULT_AI_CONFIG,
    ...rest,
    provider,
    agentToken,
    selectedModelIdByProvider,
    filtersByProvider: {
      openrouter: openrouterFilters,
      agent: agentFilters,
      cliproxy: cliproxyFilters,
    },
  };
};
