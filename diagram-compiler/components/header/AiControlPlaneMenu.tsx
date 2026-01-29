import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Check,
  X,
  Wifi,
  WifiOff,
  Loader2,
  Filter,
  LogOut,
  Timer,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AIConfig, CliproxyFilters, ConnectionState, ModelParams, OpenRouterFilters } from '../../types';
import { DEFAULT_AI_CONFIG } from '../../constants';
import { useCliproxyQuotas } from '../../hooks/core/useCliproxyQuotas';
import { useCliproxyManagementInfo } from '../../hooks/core/useCliproxyManagementInfo';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RadioGroup, RadioOption } from '../ui/Radio';
import { Select } from '../ui/Select';

type AiControlPlaneMenuProps = {
  aiConfig: AIConfig;
  modelParams: ModelParams | null;
  onModelParamsChange: React.Dispatch<React.SetStateAction<ModelParams | null>>;
  connectionState: ConnectionState;
  onConfigChange: React.Dispatch<React.SetStateAction<AIConfig>>;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  llmTimeoutMs: number;
  onLLMTimeoutMsChange: (timeoutMs: number) => void;
};

const normalizeCliproxyBase = (endpoint: string) => endpoint.trim().replace(/\/v1\/?$/, '').replace(/\/$/, '');

const formatMonthDayTime = (date: Date) => date.toLocaleString(void 0, {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

type ModelFamilyKey = 'gpt' | 'claude' | 'gemini' | 'other';

const getModelFamilyKey = (model: { id: string; vendor?: string | null }): ModelFamilyKey => {
  const vendor = typeof model.vendor === 'string' ? model.vendor.trim().toLowerCase() : '';
  if (vendor === 'openai' || vendor === 'gpt') return 'gpt';
  if (vendor === 'anthropic') return 'claude';
  if (vendor === 'google') return 'gemini';
  const id = model.id.trim().toLowerCase();
  if (id.includes('claude')) return 'claude';
  if (id.includes('gemini')) return 'gemini';
  if (id.startsWith('gpt') || id.includes('/gpt') || id.includes('gpt-')) return 'gpt';
  return 'other';
};

const getModelFamilyLabel = (key: ModelFamilyKey) => {
  if (key === 'gpt') return 'GPT';
  if (key === 'claude') return 'Claude';
  if (key === 'gemini') return 'Gemini';
  return 'Other';
};

const AiControlPlaneMenu: React.FC<AiControlPlaneMenuProps> = ({
  aiConfig,
  modelParams,
  onModelParamsChange,
  connectionState,
  onConfigChange,
  onConnect,
  onDisconnect,
  llmTimeoutMs,
  onLLMTimeoutMsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showAgentToken, setShowAgentToken] = useState(false);
  const [showProxyKey, setShowProxyKey] = useState(false);
  const [showProxyManagementKey, setShowProxyManagementKey] = useState(false);
  const [showProxySettings, setShowProxySettings] = useState(connectionState.status !== 'connected');
  const [showCliproxyUsageDetails, setShowCliproxyUsageDetails] = useState(false);
  const [showCliproxySubscriptions, setShowCliproxySubscriptions] = useState(false);
  const [showCliproxyQuotas, setShowCliproxyQuotas] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ state: 'unknown' | 'online' | 'offline'; message?: string }>({ state: 'unknown' });
  const [versionInfo, setVersionInfo] = useState<{
    agentVersion?: string;
    codexDetected?: boolean;
    codexVersion?: string;
    geminiDetected?: boolean;
    geminiVersion?: string;
  }>({});
  const cliproxyInfo = useCliproxyManagementInfo({
    enabled: aiConfig.provider === 'cliproxy' && (isOpen || connectionState.status === 'connected'),
    endpoint: aiConfig.proxyEndpoint || '',
    proxyKey: aiConfig.proxyKey,
    managementKey: aiConfig.proxyManagementKey,
  });
  const { quotas: cliproxyQuotas, refresh: refreshCliproxyQuotas } = useCliproxyQuotas({
    enabled: aiConfig.provider === 'cliproxy' && isOpen && showCliproxyQuotas,
    endpoint: aiConfig.proxyEndpoint || '',
    managementKey: aiConfig.proxyManagementKey || '',
    authFiles: cliproxyInfo.cliproxyAuthFiles ?? [],
    showAll: true,
    pageSize: 3,
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusText = () => {
    if (connectionState.status === 'disconnected') return 'AI: Not connected';
    if (connectionState.status === 'connecting') return 'AI: Connecting...';
    if (connectionState.status === 'failed') return 'AI: Connection Failed';
    if (!aiConfig.selectedModelId) return 'AI: Connected · Select model';

    const model = connectionState.availableModels.find((m) => m?.id === aiConfig.selectedModelId);
    const modelName = model ? model.name : aiConfig.selectedModelId;
    const contextLabel = model?.contextLength ? ` (${formatContextLength(model.contextLength)})` : '';
    const providerName =
      aiConfig.provider === 'openrouter'
        ? 'OpenRouter'
        : aiConfig.provider === 'agent'
          ? 'Mermaid Agent'
          : 'Proxy';
    const viaLabel = (() => {
      if (aiConfig.provider !== 'cliproxy') return '';
      const files = cliproxyInfo.cliproxyAuthFiles ?? [];
      if (files.length === 0) return '';
      const isActive = (file: { status?: string; disabled?: boolean; unavailable?: boolean }) => {
        if (file.disabled || file.unavailable) return false;
        const status = typeof file.status === 'string' ? file.status.trim().toLowerCase() : '';
        return status === 'active' || status === 'ready';
      };
      const providers = new Set(
        files
          .filter((f) => !f.runtimeOnly && isActive(f))
          .map((f) => (typeof f.provider === 'string' ? f.provider.trim().toLowerCase() : ''))
          .filter(Boolean),
      );
      if (providers.size === 0) return '';

      const family = getModelFamilyKey({ id: aiConfig.selectedModelId, vendor: model?.vendor ?? null });
      const relevant = family === 'gemini'
        ? ['gemini-cli', 'antigravity']
        : family === 'gpt'
          ? ['codex', 'antigravity']
          : family === 'claude'
            ? ['antigravity']
            : [];
      const present = relevant.length > 0 ? relevant.filter((p) => providers.has(p)) : Array.from(providers.values());
      if (present.length === 0) return '';
      return ` · via: ${present.join('+')}`;
    })();

    return `AI: ${providerName} · ${modelName}${contextLabel}${viaLabel}`;
  };

  const getStatusTone = () => {
    if (connectionState.status === 'connected') return 'text-emerald-500';
    if (connectionState.status === 'failed') return 'text-rose-500';
    if (connectionState.status === 'connecting') return 'text-amber-500';
    return 'text-slate-400 dark:text-slate-500';
  };

  const updateConfig = useCallback((updates: Partial<AIConfig>) => {
    onConfigChange((prev) => ({ ...prev, ...updates }));
  }, [onConfigChange]);

  const updateSelectedModel = useCallback((modelId: string) => {
    onConfigChange((prev) => ({
      ...prev,
      selectedModelId: modelId,
      selectedModelIdByProvider: {
        ...prev.selectedModelIdByProvider,
        [prev.provider]: modelId,
      },
    }));
  }, [onConfigChange]);

  const formatContextLength = (value?: number) => {
    if (!value || value <= 0) return '';
    if (value >= 1_000_000) {
      const rounded = Math.round(value / 1_000_000);
      return `${rounded}m`;
    }
    const rounded = Math.round(value / 1000);
    return `${rounded}k`;
  };

  const normalizeCliVersion = (value: string | undefined): string | null => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return null;
    const match = trimmed.match(/\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z_.-]+)?\b/);
    if (!match?.[0]) return trimmed;
    const v = match[0];
    return v.startsWith('v') ? v : `v${v}`;
  };

  const formatCliStatus = (label: string, detected: boolean | undefined, version: string | undefined): string => {
    if (detected === false) return `${label} (missing)`;
    const v = normalizeCliVersion(version);
    return `${label} ${v ?? '(unknown)'}`;
  };

  const isOpenRouter = aiConfig.provider === 'openrouter';
  const isAgent = aiConfig.provider === 'agent';
  const isCliproxy = aiConfig.provider === 'cliproxy';
  const filtersByProvider = aiConfig.filtersByProvider ?? DEFAULT_AI_CONFIG.filtersByProvider;
  const openRouterFilters = filtersByProvider.openrouter;
  const proxyFilters = isOpenRouter ? null : (isAgent ? filtersByProvider.agent : filtersByProvider.cliproxy);
  const timeoutSeconds = Math.max(5, Math.min(300, Math.round(llmTimeoutMs / 1000)));
  const statusToneClass = getStatusTone();
  const reasoningEffort =
    typeof modelParams?.['reasoning_effort'] === 'string'
      ? (modelParams['reasoning_effort'] as string)
      : 'auto';
  const selectedModel = aiConfig.selectedModelId
    ? connectionState.availableModels.find((m) => m?.id === aiConfig.selectedModelId)
    : undefined;
  const isGeminiModel =
    selectedModel?.vendor === 'google' ||
    /^gemini[:/]/i.test(aiConfig.selectedModelId) ||
    /\bgoogle\/gemini\b/i.test(aiConfig.selectedModelId);
  const showReasoningControl = isAgent && !isGeminiModel;

  const updateOpenRouterFilters = (updates: Partial<OpenRouterFilters>) => {
    onConfigChange((prev) => {
      return {
        ...prev,
        filtersByProvider: {
          ...prev.filtersByProvider,
          openrouter: {
            ...(prev.filtersByProvider?.openrouter ?? {}),
            ...updates,
          },
        },
      };
    });
  };

  const updateProxyFilters = (updates: Partial<CliproxyFilters>) => {
    onConfigChange((prev) => {
      const provider = prev.provider === 'agent' ? 'agent' : 'cliproxy';
      return {
        ...prev,
        filtersByProvider: {
          ...prev.filtersByProvider,
          [provider]: {
            ...(prev.filtersByProvider?.[provider] ?? {}),
            ...updates,
          },
        },
      };
    });
  };

  const switchProvider = (provider: AIConfig['provider']) => {
    if (aiConfig.provider === provider) return;
    onDisconnect();
    const storedModelId = aiConfig.selectedModelIdByProvider?.[provider] ?? '';
    updateConfig({ provider, selectedModelId: storedModelId });
  };

  const updateReasoningEffort = useCallback((value: string) => {
    onModelParamsChange((prev) => {
      const next: ModelParams = { ...(prev ?? {}) };
      if (value === 'auto') {
        delete next['reasoning_effort'];
      } else {
        next['reasoning_effort'] = value;
      }
      return Object.keys(next).length === 0 ? null : next;
    });
  }, [onModelParamsChange]);

  useEffect(() => {
    const current = typeof modelParams?.['reasoning_effort'] === 'string'
      ? (modelParams['reasoning_effort'] as string)
      : null;
    if (!current) return;
    if (showReasoningControl) return;
    updateReasoningEffort('auto');
  }, [modelParams, showReasoningControl, updateReasoningEffort]);

  const baseFilteredModels = connectionState.availableModels.filter((m) => {
    if (!m) return false;
    if (isOpenRouter) {
      if (openRouterFilters.freeOnly && !m.isFree) return false;
      if (openRouterFilters.minContextWindow > 0 && (m.contextLength ?? 0) < openRouterFilters.minContextWindow) return false;
    }
    return true;
  });

  const vendorCounts = new Map<string, number>();
  if (isOpenRouter) {
    baseFilteredModels.forEach((model) => {
      if (!model || !model.vendor) return;
      vendorCounts.set(model.vendor, (vendorCounts.get(model.vendor) ?? 0) + 1);
    });
  }

  const familyCandidates = new Set<'gpt' | 'claude' | 'gemini' | 'other'>();
  if (!isOpenRouter) {
    baseFilteredModels.forEach((model) => {
      if (!model) return;
      familyCandidates.add(getModelFamilyKey(model));
    });
  }

  const vendorOptions = Array.from(vendorCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, count]) => ({ vendor, count }));

  if (isOpenRouter && openRouterFilters.vendor && !vendorCounts.has(openRouterFilters.vendor)) {
    vendorOptions.unshift({ vendor: openRouterFilters.vendor, count: 0 });
  }

  const familyOptions = Array.from(familyCandidates.values())
    .sort((a, b) => getModelFamilyLabel(a).localeCompare(getModelFamilyLabel(b)))
    .map((family) => {
      const count = baseFilteredModels.filter((model) => model && getModelFamilyKey(model) === family).length;
      return { family, label: getModelFamilyLabel(family), count };
    });

  if (!isOpenRouter && proxyFilters?.family) {
    const active = proxyFilters.family.trim().toLowerCase() as 'gpt' | 'claude' | 'gemini' | 'other';
    if (active && !familyCandidates.has(active)) {
      familyOptions.unshift({ family: active, label: getModelFamilyLabel(active), count: 0 });
    }
  }

  const familyPills = [...familyOptions].sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));

  const filteredModels = baseFilteredModels.filter((m) => {
    if (!m) return false;
    if (isOpenRouter) {
      if (openRouterFilters.vendor && m.vendor !== openRouterFilters.vendor) return false;
      return true;
    }

    const filterFamily = (proxyFilters?.family ?? '').trim().toLowerCase();
    if (filterFamily && getModelFamilyKey(m) !== filterFamily) return false;

    return true;
  });

  useEffect(() => {
    if (!isAgent) return;
    if (!isOpen) return;
    let cancelled = false;

    const endpoint = aiConfig.agentEndpoint?.trim();
    const checkHealth = async (base: string) => {
      try {
        const response = await fetch(`${base}/api/health`);
        if (cancelled) return;
        if (!response.ok) {
          setAgentStatus({ state: 'offline', message: `HTTP ${response.status}` });
          return;
        }
        const json = await response.json().catch(() => null);
        if (json && typeof json === 'object') {
          const data = json as Record<string, unknown>;
          const agentVersion = typeof data.agent_version === 'string' ? data.agent_version : undefined;
          const codexDetected = typeof data.codex_detected === 'boolean' ? data.codex_detected : undefined;
          const codexVersion = typeof data.codex_version === 'string' ? data.codex_version : undefined;
          const geminiDetected = typeof data.gemini_detected === 'boolean' ? data.gemini_detected : undefined;
          const geminiVersion = typeof data.gemini_version === 'string' ? data.gemini_version : undefined;
          setVersionInfo((prev) => ({ ...prev, agentVersion, codexDetected, codexVersion, geminiDetected, geminiVersion }));
        }
        setAgentStatus({ state: 'online' });
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Unavailable';
        setAgentStatus({ state: 'offline', message });
      }
    };

    const run = async () => {
      if (!endpoint) {
        setAgentStatus({ state: 'unknown' });
        setVersionInfo((prev) => ({ ...prev, agentVersion: undefined, codexVersion: undefined, geminiVersion: undefined }));
        return;
      }
      const base = normalizeCliproxyBase(endpoint);
      await checkHealth(base);
      const interval = window.setInterval(() => void checkHealth(base), 5000);
      return () => {
        window.clearInterval(interval);
      };
    };

    const teardownPromise = run();
    return () => {
      cancelled = true;
      void teardownPromise.then((teardown) => teardown?.());
    };
  }, [aiConfig.agentEndpoint, isAgent, isOpen]);

  const handleToggleMenu = () => {
    const nextOpen = !isOpen;
    if (nextOpen && aiConfig.provider === 'cliproxy' && connectionState.status !== 'connected') {
      setShowProxySettings(true);
    }
    setIsOpen(nextOpen);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={handleToggleMenu}
        variant="default"
        className="px-3"
      >
        {connectionState.status === 'connected' ? <Wifi size={14} className={statusToneClass} /> : <WifiOff size={14} className={statusToneClass} />}
        <span className="truncate max-w-[320px] text-[10px] ml-1">{getStatusText()}</span>
        <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-400">
          <Timer size={12} className="opacity-80" />
          {timeoutSeconds}s
        </span>
        <ChevronDown size={14} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[400px] bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Provider</label>
            <RadioGroup>
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'openrouter'}
                onChange={() => switchProvider('openrouter')}
                label="OpenRouter"
              />
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'agent'}
                onChange={() => switchProvider('agent')}
                label="Mermaid Agent"
              />
              <RadioOption
                name="provider"
                checked={aiConfig.provider === 'cliproxy'}
                onChange={() => switchProvider('cliproxy')}
                label="My Proxy"
              />
            </RadioGroup>
          </div>

          <form
            autoComplete="off"
            onSubmit={(event) => event.preventDefault()}
            className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-700"
          >
            {isOpenRouter ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API Key</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="openrouter-secret"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showOpenRouterKey ? 'none' : 'disc' }}
                      value={aiConfig.openRouterKey}
                      onChange={(e) => updateConfig({ openRouterKey: e.target.value })}
                      placeholder="sk-or-..."
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowOpenRouterKey((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showOpenRouterKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showOpenRouterKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : isAgent ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                  <Input
                    type="text"
                    autoComplete="off"
                    name="agent-endpoint"
                    value={aiConfig.agentEndpoint}
                    onChange={(e) => updateConfig({ agentEndpoint: e.target.value })}
                    placeholder="http://127.0.0.1:8787"
                    size="md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Agent Token</label>
                  <div className="relative">
                    <Input
                      type="text"
                      autoComplete="new-password"
                      name="agent-token"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      style={{ WebkitTextSecurity: showAgentToken ? 'none' : 'disc' }}
                      value={aiConfig.agentToken || ''}
                      onChange={(e) => updateConfig({ agentToken: e.target.value })}
                      placeholder="test"
                      size="md"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowAgentToken((prev) => !prev)}
                      className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={showAgentToken ? 'Hide agent token' : 'Show agent token'}
                    >
                      {showAgentToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                  </div>
                </div>
                <div
                  className={`text-[11px] flex items-center gap-1 ${
                    agentStatus.state === 'online'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : agentStatus.state === 'offline'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span className="inline-block h-2 w-2 rounded-full border border-current" />
                  Agent {agentStatus.state === 'unknown' ? 'unknown' : agentStatus.state}
                  {agentStatus.message ? ` · ${agentStatus.message}` : ''}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowProxySettings((prev) => !prev)}
                  className="w-full flex items-center justify-between text-left"
                  aria-expanded={showProxySettings}
                >
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Proxy settings</span>
                  <ChevronDown size={14} className={`transition-transform ${showProxySettings ? 'rotate-180' : ''}`} />
                </button>

                {!showProxySettings ? (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Endpoint: <span className="font-mono">{aiConfig.proxyEndpoint?.trim() ? aiConfig.proxyEndpoint.trim() : '(not set)'}</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                      <Input
                        type="text"
                        autoComplete="off"
                        name="proxy-endpoint"
                        value={aiConfig.proxyEndpoint}
                        onChange={(e) => updateConfig({ proxyEndpoint: e.target.value })}
                        placeholder="http://localhost:8317"
                        size="md"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Proxy Key</label>
                      <div className="relative">
                        <Input
                          type="text"
                          autoComplete="new-password"
                          name="proxy-secret"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          style={{ WebkitTextSecurity: showProxyKey ? 'none' : 'disc' }}
                          value={aiConfig.proxyKey || ''}
                          onChange={(e) => updateConfig({ proxyKey: e.target.value })}
                          placeholder="test"
                          size="md"
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowProxyKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={showProxyKey ? 'Hide proxy key' : 'Show proxy key'}
                        >
                          {showProxyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Management Key</label>
                      <div className="relative">
                        <Input
                          type="text"
                          autoComplete="new-password"
                          name="proxy-management-secret"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          style={{ WebkitTextSecurity: showProxyManagementKey ? 'none' : 'disc' }}
                          value={aiConfig.proxyManagementKey || ''}
                          onChange={(e) => updateConfig({ proxyManagementKey: e.target.value })}
                          placeholder="X-Management-Key"
                          size="md"
                          className="pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowProxyManagementKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={showProxyManagementKey ? 'Hide management key' : 'Show management key'}
                        >
                          {showProxyManagementKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between">
              <span
                className={`text-xs font-medium flex items-center gap-1 ${
                  connectionState.status === 'connected'
                    ? 'text-green-600 dark:text-green-400'
                    : connectionState.status === 'failed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {connectionState.status === 'connected' && <Check size={12} />}
                {connectionState.status === 'failed' && <X size={12} />}
                Status: {connectionState.status}
                {connectionState.error && <span className="ml-1 text-red-500">({connectionState.error})</span>}
              </span>

              {connectionState.status !== 'connected' ? (
                <Button
                  onClick={onConnect}
                  disabled={connectionState.status === 'connecting'}
                  className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {connectionState.status === 'connecting' && <Loader2 size={12} className="animate-spin" />}
                  Test connection
                </Button>
              ) : (
                <Button
                  onClick={onDisconnect}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut size={12} /> Disconnect
                </Button>
              )}
            </div>

            {(isAgent || isCliproxy) && connectionState.status === 'connected' && (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-col gap-1">
                {isAgent && (
                  <div>
                    Agent {normalizeCliVersion(versionInfo.agentVersion) ?? '(unknown)'} ·{' '}
                    {formatCliStatus('Codex CLI', versionInfo.codexDetected, versionInfo.codexVersion)} ·{' '}
                    {formatCliStatus('Gemini CLI', versionInfo.geminiDetected, versionInfo.geminiVersion)}
                  </div>
                )}
                {isCliproxy && (
                  <div className="space-y-1">
                    <div>
                      cliproxyapi:{' '}
                      {cliproxyInfo.cliproxyapiLatestVersion
                        ? `v${cliproxyInfo.cliproxyapiLatestVersion.replace(/^v/i, '')}`
                        : (cliproxyInfo.cliproxyapiVersion ?? '(unknown)')}
                      {cliproxyInfo.cliproxyUsageSummary ? ` · usage ${cliproxyInfo.cliproxyUsageSummary}` : ''}
                      {cliproxyInfo.cliproxyManagementStatus ? ` · mgmt ${cliproxyInfo.cliproxyManagementStatus}` : ''}
                    </div>
                    {Array.isArray(cliproxyInfo.cliproxyAuthFiles) ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxySubscriptions((prev) => !prev)}
                        >
                          {showCliproxySubscriptions ? 'Hide subscriptions' : 'Show subscriptions'}
                        </button>
                        {showCliproxySubscriptions && (
                          <div className="mt-1 flex flex-col gap-1">
                            {cliproxyInfo.cliproxyAuthFiles.length === 0 ? (
                              <div className="text-slate-400">No auth files</div>
                            ) : (
                              cliproxyInfo.cliproxyAuthFiles
                                .slice(0, 8)
                                .map((file) => {
                                  const isOk = file.status === 'ready' && !file.disabled && !file.unavailable;
                                  const tone = isOk
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : file.disabled
                                      ? 'text-slate-500 dark:text-slate-400'
                                      : 'text-amber-600 dark:text-amber-400';
                                  const label = file.email || file.label || file.name || file.id;
                                  const status = file.disabled ? 'disabled' : file.unavailable ? 'unavailable' : (file.status ?? 'unknown');
                                  return (
                                    <div key={file.id} className="flex items-center justify-between gap-2 font-mono tabular-nums">
                                      <span className="truncate">{file.provider}: {label}</span>
                                      <span className={tone}>{status}</span>
                                    </div>
                                  );
                                })
                            )}
                            {cliproxyInfo.cliproxyAuthFiles.length > 8 ? (
                              <div className="text-slate-400">…and {cliproxyInfo.cliproxyAuthFiles.length - 8} more</div>
                            ) : null}
                            {cliproxyInfo.cliproxyAuthStatus ? (
                              <div className="text-amber-600 dark:text-amber-400">auth {cliproxyInfo.cliproxyAuthStatus}</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {cliproxyInfo.cliproxyAuthFiles?.length ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxyQuotas((prev) => !prev)}
                        >
                          {showCliproxyQuotas ? 'Hide quotas' : 'Show quotas'}
                        </button>
                        {showCliproxyQuotas && (
                          <div className="mt-1 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2 text-slate-400">
                              <span />
                              <button
                                type="button"
                                className="hover:underline"
                                onClick={refreshCliproxyQuotas}
                              >
                                Refresh
                              </button>
                            </div>
                            {cliproxyQuotas.status === 'loading' ? (
                              <div className="text-slate-400">Loading quota...</div>
                            ) : cliproxyQuotas.status === 'error' ? (
                              <div className="text-amber-600 dark:text-amber-400">quota {cliproxyQuotas.error}</div>
                            ) : null}

                            <div className="flex flex-col gap-2">
                              {(() => {
                                const files = (cliproxyInfo.cliproxyAuthFiles ?? []).filter((f) => f.provider === 'codex' && !f.runtimeOnly);
                                if (files.length === 0) return (
                                  <div className="text-slate-400">Codex Quota: no auth files</div>
                                );
	                                const bestByWindowId = new Map<string, {
	                                  label: string;
	                                  remainingPercent: number | null;
	                                  resetLabel: string;
	                                  eligibleCount: number;
	                                  remainingSum: number | null;
	                                }>();
	                                files.forEach((file) => {
	                                  const quota = cliproxyQuotas.codex?.[file.id];
	                                  const windows = quota?.windows ?? [];
	                                  const weeklyWindow = windows.find((w) => w?.id === 'secondary') ?? null;
	                                  const weeklyUsedPercent = weeklyWindow?.usedPercent ?? null;
	                                  const weeklyRemainingPercent =
	                                    weeklyUsedPercent === null ? null : Math.max(0, Math.min(100, 100 - weeklyUsedPercent));
	                                  const weeklyExhausted = weeklyRemainingPercent === 0;
	                                  windows.forEach((w) => {
	                                    if (!w?.id) return;
	                                    if (w.id === 'primary' && weeklyExhausted) return;
	                                    const usedPercent = w.usedPercent;
	                                    const remainingPercent =
	                                      usedPercent === null ? null : Math.max(0, Math.min(100, 100 - usedPercent));
	                                    const prev = bestByWindowId.get(w.id);
	                                    const eligibleCount = (prev?.eligibleCount ?? 0) + 1;
	                                    const remainingSum =
	                                      typeof remainingPercent === 'number'
	                                        ? (prev?.remainingSum ?? 0) + remainingPercent
	                                        : prev?.remainingSum ?? null;
	                                    if (!prev) {
	                                      bestByWindowId.set(w.id, { label: w.label, remainingPercent, resetLabel: w.resetLabel, eligibleCount, remainingSum });
	                                      return;
	                                    }
	                                    if (remainingPercent === null) {
	                                      bestByWindowId.set(w.id, { ...prev, eligibleCount, remainingSum });
	                                      return;
	                                    }
	                                    if (prev.remainingPercent === null || remainingPercent > prev.remainingPercent) {
	                                      bestByWindowId.set(w.id, { label: w.label, remainingPercent, resetLabel: w.resetLabel, eligibleCount, remainingSum });
	                                      return;
	                                    }
	                                    bestByWindowId.set(w.id, { ...prev, eligibleCount, remainingSum });
	                                  });
	                                });

	                                const ordered = ['primary', 'secondary', 'code-review']
	                                  .map((id) => bestByWindowId.get(id))
	                                  .filter(Boolean) as Array<{
	                                    label: string;
	                                    remainingPercent: number | null;
	                                    resetLabel: string;
	                                    eligibleCount: number;
	                                    remainingSum: number | null;
	                                  }>;

                                return (
                                  <div className="flex flex-col gap-2">
                                    <div className="text-slate-500 dark:text-slate-400">Codex Quota</div>
                                    <div className="rounded border border-slate-200 dark:border-slate-700 p-2">
                                      {ordered.length ? (
                                        <div className="flex flex-col gap-1">
	                                          {ordered.map((w) => {
	                                            const remainingSum = w.remainingSum;
	                                            const eligibleCount = w.eligibleCount ?? 1;
	                                            const percent = remainingSum;
	                                            const poolPercent = percent === null
	                                              ? null
	                                              : Math.max(0, Math.min(100, (percent / Math.max(1, eligibleCount * 100)) * 100));
	                                            const tone = poolPercent === null
	                                              ? 'bg-slate-200 dark:bg-slate-700'
	                                              : poolPercent >= 60
	                                                ? 'bg-emerald-500'
	                                                : poolPercent >= 20
	                                                  ? 'bg-amber-500'
	                                                  : 'bg-rose-500';
	                                            return (
	                                              <div key={w.label} className="flex flex-col gap-0.5">
	                                                <div className="flex items-center justify-between gap-2">
	                                                  <span className="truncate">{w.label}</span>
	                                                  <span className="font-mono tabular-nums text-slate-400">{percent === null ? '-' : `${Math.round(percent)}%`} · {w.resetLabel}</span>
	                                                </div>
	                                                <div className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
	                                                  <div
	                                                    className={`h-full ${tone}`}
	                                                    style={{ width: `${poolPercent === null ? 0 : poolPercent}%` }}
	                                                  />
	                                                </div>
	                                              </div>
	                                            );
	                                          })}
                                        </div>
                                      ) : (
                                        <div className="text-slate-400">No quota data</div>
                                      )}
                                      <div className="mt-1 text-[10px] text-slate-400">{files.length} subscriptions</div>
                                    </div>
                                  </div>
                                );
                              })()}

	                              {(() => {
	                                const files = (cliproxyInfo.cliproxyAuthFiles ?? []).filter((f) => f.provider === 'gemini-cli' && !f.runtimeOnly);
	                                if (files.length === 0) return (
	                                  <div className="text-slate-400">Gemini CLI Quota: no auth files</div>
	                                );
	                                const pooledByItemId = new Map<string, { label: string; remainingSum: number | null; eligibleCount: number; resetLabel: string }>();
	                                files.forEach((file) => {
	                                  const quota = cliproxyQuotas.geminiCli?.[file.id];
	                                  const items = quota?.items ?? [];
	                                  items.forEach((it) => {
	                                    if (!it?.id) return;
	                                    const percent = typeof it.remainingPercent === 'number' ? Math.max(0, Math.min(100, it.remainingPercent)) : null;
	                                    const prev = pooledByItemId.get(it.id);
	                                    const eligibleCount = (prev?.eligibleCount ?? 0) + 1;
	                                    const remainingSum =
	                                      typeof percent === 'number'
	                                        ? (prev?.remainingSum ?? 0) + percent
	                                        : prev?.remainingSum ?? null;
	                                    const resetLabel = prev?.resetLabel && prev.resetLabel !== '-' ? prev.resetLabel : it.resetLabel;
	                                    pooledByItemId.set(it.id, {
	                                      label: it.label,
	                                      remainingSum,
	                                      eligibleCount,
	                                      resetLabel,
	                                    });
	                                  });
	                                });
	                                const bestItems = Array.from(pooledByItemId.values()).sort((a, b) => a.label.localeCompare(b.label));
	                                return (
	                                  <div className="flex flex-col gap-2">
	                                    <div className="text-slate-500 dark:text-slate-400">Gemini CLI Quota</div>
	                                    <div className="rounded border border-slate-200 dark:border-slate-700 p-2">
	                                      {bestItems.length ? (
	                                        <div className="flex flex-col gap-1">
	                                          {bestItems.map((it) => {
	                                            const percent = it.remainingSum;
	                                            const eligibleCount = it.eligibleCount ?? 1;
	                                            const poolPercent = percent === null
	                                              ? null
	                                              : Math.max(0, Math.min(100, (percent / Math.max(1, eligibleCount * 100)) * 100));
	                                            const tone = poolPercent === null
	                                              ? 'bg-slate-200 dark:bg-slate-700'
	                                              : poolPercent >= 60
	                                                ? 'bg-emerald-500'
	                                                : poolPercent >= 20
	                                                  ? 'bg-amber-500'
	                                                  : 'bg-rose-500';
	                                            return (
	                                              <div key={it.label} className="flex flex-col gap-0.5">
	                                                <div className="flex items-center justify-between gap-2">
	                                                  <span className="truncate">{it.label}</span>
	                                                  <span className="font-mono tabular-nums text-slate-400">{percent === null ? '-' : `${Math.round(percent)}%`} · {it.resetLabel}</span>
	                                                </div>
	                                                <div className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
	                                                  <div
	                                                    className={`h-full ${tone}`}
	                                                    style={{ width: `${poolPercent === null ? 0 : poolPercent}%` }}
	                                                  />
	                                                </div>
	                                              </div>
	                                            );
	                                          })}
                                        </div>
                                      ) : (
                                        <div className="text-slate-400">No quota data</div>
                                      )}
                                      <div className="mt-1 text-[10px] text-slate-400">{files.length} subscriptions</div>
                                    </div>
                                  </div>
                                );
                              })()}

	                              {(() => {
	                                const files = (cliproxyInfo.cliproxyAuthFiles ?? []).filter((f) => f.provider === 'antigravity' && !f.runtimeOnly);
	                                if (files.length === 0) return (
	                                  <div className="text-slate-400">Antigravity Quota: no auth files</div>
	                                );
	                                const pooledByItemId = new Map<string, { label: string; remainingSum: number | null; eligibleCount: number; resetLabel: string }>();
	                                files.forEach((file) => {
	                                  const quota = cliproxyQuotas.antigravity?.[file.id];
	                                  const items = quota?.items ?? [];
	                                  items.forEach((it) => {
	                                    if (!it?.id) return;
	                                    const percent = typeof it.remainingPercent === 'number' ? Math.max(0, Math.min(100, it.remainingPercent)) : null;
	                                    const prev = pooledByItemId.get(it.id);
	                                    const eligibleCount = (prev?.eligibleCount ?? 0) + 1;
	                                    const remainingSum =
	                                      typeof percent === 'number'
	                                        ? (prev?.remainingSum ?? 0) + percent
	                                        : prev?.remainingSum ?? null;
	                                    const resetLabel = prev?.resetLabel && prev.resetLabel !== '-' ? prev.resetLabel : it.resetLabel;
	                                    pooledByItemId.set(it.id, {
	                                      label: it.label,
	                                      remainingSum,
	                                      eligibleCount,
	                                      resetLabel,
	                                    });
	                                  });
	                                });
	                                const bestItems = Array.from(pooledByItemId.values()).sort((a, b) => a.label.localeCompare(b.label));
	                                return (
	                                  <div className="flex flex-col gap-2">
	                                    <div className="text-slate-500 dark:text-slate-400">Antigravity Quota</div>
	                                    <div className="rounded border border-slate-200 dark:border-slate-700 p-2">
	                                      {bestItems.length ? (
	                                        <div className="flex flex-col gap-1">
	                                          {bestItems.map((it) => {
	                                            const percent = it.remainingSum;
	                                            const eligibleCount = it.eligibleCount ?? 1;
	                                            const poolPercent = percent === null
	                                              ? null
	                                              : Math.max(0, Math.min(100, (percent / Math.max(1, eligibleCount * 100)) * 100));
	                                            const tone = poolPercent === null
	                                              ? 'bg-slate-200 dark:bg-slate-700'
	                                              : poolPercent >= 60
	                                                ? 'bg-emerald-500'
	                                                : poolPercent >= 20
	                                                  ? 'bg-amber-500'
	                                                  : 'bg-rose-500';
	                                            return (
	                                              <div key={it.label} className="flex flex-col gap-0.5">
	                                                <div className="flex items-center justify-between gap-2">
	                                                  <span className="truncate">{it.label}</span>
	                                                  <span className="font-mono tabular-nums text-slate-400">{percent === null ? '-' : `${Math.round(percent)}%`} · {it.resetLabel}</span>
	                                                </div>
	                                                <div className="h-1.5 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
	                                                  <div
	                                                    className={`h-full ${tone}`}
	                                                    style={{ width: `${poolPercent === null ? 0 : poolPercent}%` }}
	                                                  />
	                                                </div>
	                                              </div>
	                                            );
	                                          })}
                                        </div>
                                      ) : (
                                        <div className="text-slate-400">No quota data</div>
                                      )}
                                      <div className="mt-1 text-[10px] text-slate-400">{files.length} subscriptions</div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>

                            {cliproxyQuotas.updatedAt ? (
                              <div className="text-slate-400">updated {formatMonthDayTime(new Date(cliproxyQuotas.updatedAt))}</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {cliproxyInfo.cliproxyUsage?.requestsByDay?.length ? (
                      <div className="text-[10px] leading-tight">
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                          onClick={() => setShowCliproxyUsageDetails((prev) => !prev)}
                        >
                          {showCliproxyUsageDetails ? 'Hide usage details' : 'Show usage details'}
                        </button>
                        {showCliproxyUsageDetails && (
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="font-mono tabular-nums">
                              req/day:{' '}
                              {cliproxyInfo.cliproxyUsage.requestsByDay
                                .map((item) => `${item.day.slice(5)}=${item.requests}`)
                                .join(' ')}
                            </div>
                            {cliproxyInfo.cliproxyUsage.tokensByDay?.length ? (
                              <div className="font-mono tabular-nums">
                                tok/day:{' '}
                                {cliproxyInfo.cliproxyUsage.tokensByDay
                                  .map((item) => `${item.day.slice(5)}=${item.tokens}`)
                                  .join(' ')}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </form>

          {connectionState.status === 'connected' && (
            <div className="mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Model</label>
                <Button
                  onClick={() => setShowFilters(!showFilters)}
                  variant="ghost"
                  className="h-auto px-1 py-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Filter size={10} /> {showFilters ? 'Hide filters' : 'Filters'}
                </Button>
              </div>

              {showFilters && (
                <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs grid grid-cols-2 gap-2 border border-slate-100 dark:border-slate-700 dark:text-slate-300">
	                  {!isOpenRouter && familyOptions.length > 0 && (
	                    <div className="col-span-2">
	                      <label className="block text-[10px] uppercase text-slate-400 mb-1">Family</label>
	                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => updateProxyFilters({ family: '' })}
                          className={`px-2 py-1 rounded border text-[11px] ${
                            !(proxyFilters?.family ?? '')
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          All ({baseFilteredModels.length})
                        </button>
                        {familyPills.map(({ family, label, count }) => {
                          const selected = (proxyFilters?.family ?? '') === family;
                          return (
                            <button
                              key={family}
                              type="button"
                              onClick={() => updateProxyFilters({ family })}
                              className={`px-2 py-1 rounded border text-[11px] ${
                                selected
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`}
                            >
                              {label} ({count})
                            </button>
                          );
                        })}
	                      </div>
	                    </div>
	                  )}
	                  {isOpenRouter && (
	                    <div className="col-span-2">
	                      <label className="block text-[10px] uppercase text-slate-400 mb-1">Vendor</label>
                      <Select
                        value={openRouterFilters.vendor}
                        onChange={(e) => updateOpenRouterFilters({ vendor: e.target.value })}
                        size="sm"
                      >
                        <option value="">
                          All vendors ({baseFilteredModels.length})
                        </option>
                        {vendorOptions.map(({ vendor, count }) => (
                          <option key={vendor} value={vendor}>
                            {vendor} ({count})
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {isOpenRouter && (
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase text-slate-400 mb-1">Min Context Window</label>
                      <Select
                        value={openRouterFilters.minContextWindow}
                        onChange={(e) => updateOpenRouterFilters({ minContextWindow: Number(e.target.value) })}
                        size="sm"
                      >
                        <option value="0">Any size</option>
                        <option value="32000">32k+</option>
                        <option value="64000">64k+</option>
                        <option value="128000">128k+</option>
                        <option value="200000">200k+</option>
                        <option value="1000000">1M+</option>
                      </Select>
                    </div>
                  )}
                  {isOpenRouter && (
                    <>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={openRouterFilters.freeOnly}
                          onChange={(e) => updateOpenRouterFilters({ freeOnly: e.target.checked })}
                        />
                        Free only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={openRouterFilters.testedOnly}
                          onChange={(e) => updateOpenRouterFilters({ testedOnly: e.target.checked })}
                        />
                        Tested only
                      </label>
                    </>
                  )}
                </div>
              )}

              <Select
                value={aiConfig.selectedModelId}
                onChange={(e) => updateSelectedModel(e.target.value)}
                size="md"
                className="p-2"
              >
                <option value="" disabled>Select a model...</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.contextLength ? `(${formatContextLength(m.contextLength)})` : ''} {m.isFree ? '(Free)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {showReasoningControl && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <label className="text-xs text-slate-500 dark:text-slate-400">Reasoning</label>
              <Select
                value={reasoningEffort}
                onChange={(e) => updateReasoningEffort(e.target.value)}
                size="sm"
                className="w-[160px]"
              >
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="xhigh">XHigh</option>
              </Select>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <label className="text-xs text-slate-500 dark:text-slate-400">Timeout (s)</label>
            <Input
              type="number"
              min={5}
              max={300}
              value={timeoutSeconds}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (Number.isNaN(parsed)) return;
                const clamped = Math.max(5, Math.min(300, Math.floor(parsed)));
                onLLMTimeoutMsChange(clamped * 1000);
              }}
              size="md"
              className="w-24"
            />
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 text-center">
            Your API key is stored locally in your browser. Requests go directly to your provider.
          </div>
        </div>
      )}
    </div>
  );
};

export default AiControlPlaneMenu;
