import { AIConfig, Model } from '../types';

export const filterModels = (models: Model[], config: AIConfig): Model[] => {
  const isOpenRouter = config.provider === 'openrouter';
  
  return models.filter((m) => {
    if (isOpenRouter) {
      const openRouterFilters = config.filtersByProvider.openrouter;
      if (openRouterFilters.freeOnly && !m.isFree) return false;
      if (openRouterFilters.testedOnly && !m.id.startsWith('openai/') && !m.id.startsWith('anthropic/') && !m.id.startsWith('google/') && !m.id.startsWith('mistralai/') && !m.id.startsWith('meta-llama/')) return false; // Basic "tested" check logic often implies reliable providers
      if (openRouterFilters.minContextWindow > 0 && (m.contextLength ?? 0) < openRouterFilters.minContextWindow) return false;
      // Vendor filter is applied separately in UI usually, but we can include it here if we want a full filter
      if (openRouterFilters.vendor && m.vendor !== openRouterFilters.vendor) return false;
    } else {
    const cliproxyFilters = config.filtersByProvider.cliproxy;
    if (cliproxyFilters.vendor && m.vendor !== cliproxyFilters.vendor) return false;
    }
    return true;
  });
};
