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
  const [agentStatus, setAgentStatus] = useState<{ state: 'unknown' | 'online' | 'offline'; message?: string }>({ state: 'unknown' });
  const [versionInfo, setVersionInfo] = useState<{
    agentVersion?: string;
    codexDetected?: boolean;
    codexVersion?: string;
    geminiDetected?: boolean;
    geminiVersion?: string;
    cliproxyapiVersion?: string;
    cliproxyapiLatestVersion?: string;
  }>({});

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
    return `AI: ${providerName} · ${modelName}${contextLabel}`;
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

  const isOpenRouter = aiConfig.provider === 'openrouter';
  const isAgent = aiConfig.provider === 'agent';
  const isCliproxy = aiConfig.provider === 'cliproxy';
  const filtersByProvider = aiConfig.filtersByProvider ?? DEFAULT_AI_CONFIG.filtersByProvider;
  const activeFilters = isOpenRouter
    ? filtersByProvider.openrouter
    : isAgent
      ? filtersByProvider.agent
      : filtersByProvider.cliproxy;
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

  const updateFilters = (updates: Partial<OpenRouterFilters & CliproxyFilters>) => {
    onConfigChange((prev) => {
      const provider = prev.provider;
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
      const openRouterFilters = aiConfig.filtersByProvider.openrouter;
      if (openRouterFilters.freeOnly && !m.isFree) return false;
      if (openRouterFilters.minContextWindow > 0 && (m.contextLength ?? 0) < openRouterFilters.minContextWindow) return false;
    }
    return true;
  });

  const vendorCounts = new Map<string, number>();
  baseFilteredModels.forEach((model) => {
    if (!model || !model.vendor) return;
    vendorCounts.set(model.vendor, (vendorCounts.get(model.vendor) ?? 0) + 1);
  });

  const vendorOptions = Array.from(vendorCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, count]) => ({ vendor, count }));

  if (activeFilters.vendor && !vendorCounts.has(activeFilters.vendor)) {
    vendorOptions.unshift({ vendor: activeFilters.vendor, count: 0 });
  }

  const filteredModels = baseFilteredModels.filter((m) => {
    if (activeFilters.vendor && m.vendor !== activeFilters.vendor) return false;
    return true;
  });

  useEffect(() => {
    if (connectionState.status !== 'connected') return;
    if (filteredModels.length !== 1) return;
    const onlyModelId = filteredModels[0]?.id;
    if (!onlyModelId) return;
    if (aiConfig.selectedModelId === onlyModelId) return;
    updateSelectedModel(onlyModelId);
  }, [aiConfig.selectedModelId, connectionState.status, filteredModels, updateSelectedModel]);

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
      const base = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
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

  useEffect(() => {
    if (!isCliproxy) return;
    if (!isOpen) return;
    let cancelled = false;

    const headers: Record<string, string> = {};
    if (aiConfig.proxyKey) {
      headers.Authorization = `Bearer ${aiConfig.proxyKey}`;
      headers['X-Management-Key'] = aiConfig.proxyKey;
    }

    const normalizeVersionString = (value: string): string => {
      const trimmed = value.trim();
      if (!trimmed) return trimmed;
      if (/^v\d+\.\d+\.\d+/.test(trimmed)) return trimmed;
      if (/^\d+\.\d+\.\d+/.test(trimmed)) return `v${trimmed}`;
      return trimmed;
    };

    const parseVersionFromJson = (value: unknown): string | undefined => {
      if (!value || typeof value !== 'object') return undefined;
      const data = value as Record<string, unknown>;
      if (typeof data.version === 'string') return normalizeVersionString(data.version);
      if (typeof data.app_version === 'string') return normalizeVersionString(data.app_version);
      if (typeof data.cliproxyapi_version === 'string') return normalizeVersionString(data.cliproxyapi_version);
      if (typeof data.build_version === 'string') return normalizeVersionString(data.build_version);
      if (typeof data.server_version === 'string') return normalizeVersionString(data.server_version);
      return undefined;
    };

    const parseVersionFromHeaders = (headers: Headers): string | undefined => {
      const candidates = [
        headers.get('x-cliproxyapi-version'),
        headers.get('x-app-version'),
        headers.get('x-server-version'),
        headers.get('x-version'),
        headers.get('server'),
        headers.get('x-powered-by'),
      ]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      for (const candidate of candidates) {
        const direct = candidate.trim();
        if (!direct) continue;
        const match = direct.match(/(?:CLIProxyAPI|cli-proxy-api|cliproxyapi)[^0-9v]*v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z_.-]+)?)/i);
        if (match?.[1]) return normalizeVersionString(match[1]);
        const semver = direct.match(/\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z_.-]+)?\b/);
        if (semver?.[0]) return normalizeVersionString(semver[0]);
      }
      return undefined;
    };

    const fetchVersion = async () => {
      const endpoint = aiConfig.proxyEndpoint?.trim();
      if (!endpoint) {
        setVersionInfo((prev) => ({ ...prev, cliproxyapiVersion: undefined, cliproxyapiLatestVersion: undefined }));
        return;
      }
      const base = endpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const detectPaths = [
        '/api/health',
        '/health',
        '/api/version',
        '/version',
        '/api/status',
        '/status',
        '/api/info',
        '/info',
        '/api/meta',
        '/meta',
        '/v1/models',
        '/models',
        '/api/models',
      ];
      let detectedVersion: string | undefined;
      for (const path of detectPaths) {
        try {
          const response = await fetch(`${base}${path}`, { headers });
          if (cancelled) return;
          if (!response.ok) continue;
          const headerVersion = parseVersionFromHeaders(response.headers);
          if (headerVersion) {
            detectedVersion = headerVersion;
            break;
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await response.json().catch(() => null);
            const version = parseVersionFromJson(json);
            if (version) {
              detectedVersion = version;
              break;
            }
            continue;
          }
          const text = (await response.text().catch(() => '')).trim();
          if (text) {
            const line = normalizeVersionString(text.split('\n')[0] ?? '');
            if (line) {
              detectedVersion = line;
              break;
            }
          }
        } catch {
          // ignore and try next
        }
      }

      let latestVersion: string | undefined;
      if (aiConfig.proxyKey) {
        try {
          const response = await fetch(`${base}/v0/management/latest-version`, { headers });
          if (!cancelled && response.ok) {
            const json = await response.json().catch(() => null);
            latestVersion = parseVersionFromJson(json);
          }
        } catch {
          // ignore
        }
      }

      if (cancelled) return;
      setVersionInfo((prev) => ({
        ...prev,
        cliproxyapiVersion: detectedVersion,
        cliproxyapiLatestVersion: latestVersion,
      }));
    };

    fetchVersion();
    return () => {
      cancelled = true;
    };
  }, [aiConfig.proxyEndpoint, aiConfig.proxyKey, isCliproxy, isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
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
                    Agent: {versionInfo.agentVersion ?? '(unknown)'} · CLI: codex{' '}
                    {versionInfo.codexDetected === false ? '(missing)' : (versionInfo.codexVersion ?? '(unknown)')} · gemini{' '}
                    {versionInfo.geminiDetected === false ? '(missing)' : (versionInfo.geminiVersion ?? '(unknown)')}
                  </div>
                )}
                {isCliproxy && (
                  <div>
                    cliproxyapi: {versionInfo.cliproxyapiVersion ?? '(unknown)'}
                    {versionInfo.cliproxyapiLatestVersion ? ` · latest ${versionInfo.cliproxyapiLatestVersion}` : ''}
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
                  <div className="col-span-2">
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Vendor</label>
                    <Select
                      value={activeFilters.vendor}
                      onChange={(e) => updateFilters({ vendor: e.target.value })}
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
                  {isOpenRouter && (
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase text-slate-400 mb-1">Min Context Window</label>
                      <Select
                        value={activeFilters.minContextWindow}
                        onChange={(e) => updateFilters({ minContextWindow: Number(e.target.value) })}
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
                          checked={aiConfig.filtersByProvider.openrouter.freeOnly}
                          onChange={(e) => updateFilters({ freeOnly: e.target.checked })}
                        />
                        Free only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={aiConfig.filtersByProvider.openrouter.testedOnly}
                          onChange={(e) => updateFilters({ testedOnly: e.target.checked })}
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
