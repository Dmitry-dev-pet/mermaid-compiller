import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_AI_CONFIG, DEFAULT_APP_STATE } from '../constants';
import { createAnalyticsAdapter } from './analyticsAdapter';
import { DEFAULT_MODEL_PARAMS } from './llm/modelParams';

describe('createAnalyticsAdapter', () => {
  it('builds context with resolved diagram type and model params', async () => {
    const adapter = createAnalyticsAdapter({
      aiConfig: DEFAULT_AI_CONFIG,
      appState: DEFAULT_APP_STATE,
      modelParams: { temperature: 0.6 },
      getDocsUsageSummary: async () => ({
        total: 3,
        included: 1,
        excluded: 2,
        includedPaths: ['a.md'],
        excludedPaths: ['b.md', 'c.md'],
      }),
      resolveDiagramType: () => 'sequence',
    });

    const context = await adapter.getContext('build');
    expect(context.diagramType).toBe('sequence');
    expect(context.modelParams).toEqual({ temperature: 0.6 });
    expect(context.docsUsage?.includedPaths).toEqual(['a.md']);
  });

  it('tracks events with merged context', async () => {
    const trackEvent = vi.fn();
    const adapter = createAnalyticsAdapter({
      aiConfig: DEFAULT_AI_CONFIG,
      appState: DEFAULT_APP_STATE,
      modelParams: null,
      getDocsUsageSummary: async () => ({
        total: 1,
        included: 1,
        excluded: 0,
        includedPaths: [],
        excludedPaths: [],
      }),
      resolveDiagramType: () => 'flowchart',
      trackEvent,
    });

    await adapter.trackWithContext('diagram_build_started', 'build', { extra: 'ok' });

    expect(trackEvent).toHaveBeenCalledWith(
      'diagram_build_started',
      expect.objectContaining({
        mode: 'build',
        diagramType: 'flowchart',
        extra: 'ok',
        modelParams: DEFAULT_MODEL_PARAMS,
      })
    );
  });

  it('allows payload mode override', async () => {
    const trackEvent = vi.fn();
    const adapter = createAnalyticsAdapter({
      aiConfig: DEFAULT_AI_CONFIG,
      appState: DEFAULT_APP_STATE,
      modelParams: null,
      getDocsUsageSummary: async () => ({
        total: 1,
        included: 1,
        excluded: 0,
        includedPaths: [],
        excludedPaths: [],
      }),
      resolveDiagramType: () => 'flowchart',
      trackEvent,
    });

    await adapter.trackWithContext('diagram_recompile_started', 'build', { mode: 'recompile' });

    expect(trackEvent).toHaveBeenCalledWith(
      'diagram_recompile_started',
      expect.objectContaining({
        mode: 'recompile',
        diagramType: 'flowchart',
      })
    );
  });
});
