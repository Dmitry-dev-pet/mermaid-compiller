import { useState, useCallback, useEffect } from 'react';
import { AIConfig, ConnectionState } from '../types';
import { DEFAULT_AI_CONFIG } from '../constants';
import { fetchModels } from '../services/llmService';
import { safeParse } from '../utils';

export const useAI = () => {
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => safeParse('dc_ai_config', DEFAULT_AI_CONFIG));

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
        setAiConfig(prev => ({ ...prev, selectedModelId: models[0].id }));
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

  return {
    aiConfig,
    setAiConfig,
    connectionState,
    connectAI,
    disconnectAI
  };
};
