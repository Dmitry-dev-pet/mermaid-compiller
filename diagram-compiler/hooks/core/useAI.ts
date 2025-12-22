import { useState, useCallback, useEffect, useRef } from 'react';
import { AIConfig, ConnectionState, ProviderFilters } from '../../types';
import { DEFAULT_AI_CONFIG } from '../../constants';
import { fetchModels } from '../../services/llmService';
import { safeParse } from '../../utils';

type LegacyFilters = {
  freeOnly?: boolean;
  testedOnly?: boolean;
  experimental?: boolean;
};

type LegacyAIConfig = Omit<AIConfig, 'filtersByProvider'> & {
  filters?: LegacyFilters;
  filtersByProvider?: Partial<ProviderFilters>;
  selectedModelIdByProvider?: Partial<Record<AIConfig['provider'], string>>;
};

const normalizeAiConfig = (config: LegacyAIConfig): AIConfig => {
  const { filters: legacyFilters, filtersByProvider: legacyByProvider, ...rest } = config;
  const openRouterDefaults = DEFAULT_AI_CONFIG.filtersByProvider.openrouter;
  const cliproxyDefaults = DEFAULT_AI_CONFIG.filtersByProvider.cliproxy;
  const openrouterFilters = {
    ...openRouterDefaults,
    ...(legacyByProvider?.openrouter ?? {}),
    ...(legacyFilters ?? {}),
  };
  const cliproxyFilters = {
    ...cliproxyDefaults,
    ...(legacyByProvider?.cliproxy ?? {}),
  };

  const selectedModelIdByProvider = {
    openrouter: '',
    cliproxy: '',
    ...(config.selectedModelIdByProvider ?? {}),
  };

  if (config.selectedModelId && !selectedModelIdByProvider[config.provider]) {
    selectedModelIdByProvider[config.provider] = config.selectedModelId;
  }

  return {
    ...DEFAULT_AI_CONFIG,
    ...rest,
    selectedModelIdByProvider,
    filtersByProvider: {
      openrouter: openrouterFilters,
      cliproxy: cliproxyFilters,
    },
  };
};

export const useAI = () => {
  const [aiConfig, setAiConfig] = useState<AIConfig>(() =>
    normalizeAiConfig(safeParse('dc_ai_config', DEFAULT_AI_CONFIG as LegacyAIConfig))
  );
  const previousProviderRef = useRef(aiConfig.provider);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    availableModels: []
  });

  // --- Persistence ---
  useEffect(() => {
    localStorage.setItem('dc_ai_config', JSON.stringify(aiConfig));
  }, [aiConfig]);

  // --- Logic ---
  const connectAI = useCallback(async () => {
    setConnectionState(prev => ({ ...prev, status: 'connecting', error: undefined }));
    try {
      const models = await fetchModels(aiConfig);
      
      if (models.length === 0) {
        throw new Error("No models found. Check endpoint/key.");
      }

      setConnectionState({
        status: 'connected',
        availableModels: models
      });
      
      // Auto-select first model if none selected or current not in list
      if (!aiConfig.selectedModelId || !models.find(m => m.id === aiConfig.selectedModelId)) {
        setAiConfig(prev => ({
          ...prev,
          selectedModelId: models[0].id,
          selectedModelIdByProvider: {
            ...prev.selectedModelIdByProvider,
            [prev.provider]: models[0].id,
          },
        }));
      }

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setConnectionState({
        status: 'failed',
        error: message || 'Connection failed',
        availableModels: []
      });
    }
  }, [aiConfig]);

  const disconnectAI = useCallback(() => {
    setConnectionState({ status: 'disconnected', availableModels: [] });
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (aiConfig.openRouterKey || aiConfig.proxyEndpoint) {
        connectAI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const previousProvider = previousProviderRef.current;
    if (previousProvider === aiConfig.provider) return;
    previousProviderRef.current = aiConfig.provider;

    const shouldConnect =
      aiConfig.provider === 'openrouter'
        ? Boolean(aiConfig.openRouterKey)
        : Boolean(aiConfig.proxyEndpoint);

    if (shouldConnect) {
      connectAI();
    }
  }, [aiConfig.openRouterKey, aiConfig.provider, aiConfig.proxyEndpoint, connectAI]);

  return {
    aiConfig,
    setAiConfig,
    connectionState,
    connectAI,
    disconnectAI
  };
};
