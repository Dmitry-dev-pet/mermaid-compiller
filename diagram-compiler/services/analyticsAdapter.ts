import type { AIConfig, AppState, DocsMode, ModelParams } from '../types';
import type { AnalyticsContext, DocsUsageSummary } from './analyticsService';
import { buildAnalyticsContext } from './analyticsContext';

export type AnalyticsAdapter = {
  getContext: (mode: DocsMode) => Promise<AnalyticsContext>;
  track: (event: string, payload?: Record<string, unknown>) => void;
  trackWithContext: (event: string, mode: DocsMode, payload?: Record<string, unknown>) => Promise<void>;
};

type AnalyticsAdapterDeps = {
  aiConfig: AIConfig;
  appState: AppState;
  modelParams?: ModelParams | null;
  getDocsUsageSummary: (mode: DocsMode) => Promise<DocsUsageSummary>;
  resolveDiagramType: () => string | null;
  trackEvent?: (event: string, payload?: Record<string, unknown>) => void;
};

export const createAnalyticsAdapter = (deps: AnalyticsAdapterDeps): AnalyticsAdapter => {
  const getContext = async (mode: DocsMode): Promise<AnalyticsContext> => {
    const docsUsage = await deps.getDocsUsageSummary(mode);
    return buildAnalyticsContext({
      aiConfig: deps.aiConfig,
      appState: deps.appState,
      diagramType: deps.resolveDiagramType(),
      docsUsage,
      modelParams: deps.modelParams ?? null,
    });
  };

  const track = (event: string, payload: Record<string, unknown> = {}) => {
    deps.trackEvent?.(event, payload);
  };

  const trackWithContext = async (
    event: string,
    mode: DocsMode,
    payload: Record<string, unknown> = {}
  ) => {
    if (!deps.trackEvent) return;
    const context = await getContext(mode);
    const merged: Record<string, unknown> = { ...context, ...payload };
    if (!('mode' in merged)) {
      merged.mode = mode;
    }
    deps.trackEvent(event, merged);
  };

  return {
    getContext,
    track,
    trackWithContext,
  };
};
