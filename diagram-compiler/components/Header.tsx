import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Check, X, Wifi, WifiOff, Loader2, Filter, LogOut, Moon, Eye, EyeOff, Timer, Palette, Layers } from 'lucide-react';
import { AIConfig, CliproxyFilters, ConnectionState, OpenRouterFilters, ThemePresetId } from '../types';
import { APP_THEME_PRESETS } from '../utils/appTheme';
import { Button } from './ui/Button';
import PanelHeader from './ui/PanelHeader';

interface HeaderProps {
  aiConfig: AIConfig;
  connectionState: ConnectionState;
  onConfigChange: React.Dispatch<React.SetStateAction<AIConfig>>;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  chatColumnWidthPercent: number;
  theme: ThemePresetId;
  onThemeChange: (theme: ThemePresetId) => void;
  llmTimeoutMs: number;
  onLLMTimeoutMsChange: (timeoutMs: number) => void;
  notebookTabs?: React.ReactNode;
}

const HeaderNotebookSlot: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  if (!children) return null;
  return <div className="flex-1 min-w-0">{children}</div>;
};

const Header: React.FC<HeaderProps> = ({ 
  aiConfig, 
  connectionState, 
  onConfigChange, 
  onConnect, 
  onDisconnect,
  chatColumnWidthPercent,
  theme,
  onThemeChange,
  llmTimeoutMs,
  onLLMTimeoutMsChange,
  notebookTabs,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [showProxyKey, setShowProxyKey] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) setIsOpen(false);
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(target)) setIsThemeOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;
    const updateHeaderHeight = () => {
      const height = Math.ceil(headerEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--app-header-height', `${height}px`);
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(headerEl);
    window.addEventListener('resize', updateHeaderHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  // ... (getStatusText, getStatusColor, updateConfig, filteredModels logic remains same)

  const getStatusText = () => {
    if (connectionState.status === 'disconnected') return 'AI: Not connected';
    if (connectionState.status === 'connecting') return 'AI: Connecting...';
    if (connectionState.status === 'failed') return 'AI: Connection Failed';
    if (!aiConfig.selectedModelId) return 'AI: Connected · Select model';
    
    // Find model name
    const model = connectionState.availableModels.find(m => m.id === aiConfig.selectedModelId);
    const modelName = model ? model.name : aiConfig.selectedModelId;
    const contextLabel = model?.contextLength ? ` (${formatContextLength(model.contextLength)})` : '';
    const providerName = aiConfig.provider === 'openrouter' ? 'OpenRouter' : 'Proxy';
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
  const activeFilters = isOpenRouter
    ? aiConfig.filtersByProvider.openrouter
    : aiConfig.filtersByProvider.cliproxy;
  const timeoutSeconds = Math.max(5, Math.min(300, Math.round(llmTimeoutMs / 1000)));
  const themeLabel = APP_THEME_PRESETS.find((p) => p.id === theme)?.label ?? theme;
  const ThemeIcon = useMemo(() => {
    if (theme === 'lightPlus') return Palette;
    if (theme === 'darkPlus') return Moon;
    if (theme === 'abyss') return Layers;
    return Palette;
  }, [theme]);
  const statusToneClass = getStatusTone();

  const updateFilters = (updates: Partial<OpenRouterFilters & CliproxyFilters>) => {
    onConfigChange((prev) => {
      const provider = prev.provider;
      return {
        ...prev,
        filtersByProvider: {
          ...prev.filtersByProvider,
          [provider]: {
            ...prev.filtersByProvider[provider],
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


  const baseFilteredModels = connectionState.availableModels.filter((m) => {
    if (isOpenRouter) {
      const openRouterFilters = aiConfig.filtersByProvider.openrouter;
      if (openRouterFilters.freeOnly && !m.isFree) return false;
      if (openRouterFilters.minContextWindow > 0 && (m.contextLength ?? 0) < openRouterFilters.minContextWindow) return false;
    } else {
      const cliproxyFilters = aiConfig.filtersByProvider.cliproxy;
      if (cliproxyFilters.vendor && m.vendor !== cliproxyFilters.vendor) return false;
    }
    return true;
  });

  const vendorCounts = new Map<string, number>();
  baseFilteredModels.forEach((model) => {
    if (!model.vendor) return;
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

  return (
    <PanelHeader
      as="header"
      ref={headerRef}
      className="fixed top-0 left-0 right-0 grid items-center gap-0 h-12 shrink-0 z-50 transition-colors"
      style={{
        gridTemplateColumns: `minmax(260px, ${chatColumnWidthPercent}%) 0.25rem minmax(0, 1fr) auto`,
      }}
    >
      <div className="flex items-center gap-4 min-w-0 pr-2">
        <h1 className="font-bold text-lg tracking-tight text-slate-800 dark:text-slate-100">Diagram Compiler</h1>
        
        {/* AI Control Plane Trigger */}
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

          {/* Dropdown Panel */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-[400px] bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
              
              {/* Provider Selection */}
              <div className="mb-4">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Provider</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer dark:text-slate-300">
                    <input 
                      type="radio" 
                      name="provider" 
                      checked={aiConfig.provider === 'openrouter'}
                      onChange={() => switchProvider('openrouter')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">OpenRouter</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer dark:text-slate-300">
                    <input 
                      type="radio" 
                      name="provider" 
                      checked={aiConfig.provider === 'cliproxy'}
                      onChange={() => switchProvider('cliproxy')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">My Proxy</span>
                  </label>
                </div>
              </div>

              {/* Connection Settings */}
              <form
                autoComplete="off"
                onSubmit={(event) => event.preventDefault()}
                className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-700"
              >
                {aiConfig.provider === 'openrouter' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API Key</label>
                      <div className="relative">
                        <input 
                          type="text"
                          autoComplete="new-password"
                          name="openrouter-secret"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          style={{ WebkitTextSecurity: showOpenRouterKey ? 'none' : 'disc' }}
                          value={aiConfig.openRouterKey}
                          onChange={(e) => updateConfig({ openRouterKey: e.target.value })}
                          placeholder="sk-or-..."
                          className="w-full px-2 py-1.5 pr-8 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenRouterKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={showOpenRouterKey ? 'Hide API key' : 'Show API key'}
                        >
                          {showOpenRouterKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                     <div>
                     <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                      <input 
                        type="text" 
                        autoComplete="off"
                        name="proxy-endpoint"
                        value={aiConfig.proxyEndpoint}
                        onChange={(e) => updateConfig({ proxyEndpoint: e.target.value })}
                        placeholder="http://localhost:8317"
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Proxy Key</label>
                      <div className="relative">
                        <input 
                          type="text"
                          autoComplete="new-password"
                          name="proxy-secret"
                          data-1p-ignore="true"
                          data-lpignore="true"
                          style={{ WebkitTextSecurity: showProxyKey ? 'none' : 'disc' }}
                          value={aiConfig.proxyKey || ''}
                          onChange={(e) => updateConfig({ proxyKey: e.target.value })}
                          placeholder="test"
                          className="w-full px-2 py-1.5 pr-8 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProxyKey((prev) => !prev)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          aria-label={showProxyKey ? 'Hide proxy key' : 'Show proxy key'}
                        >
                          {showProxyKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-xs font-medium flex items-center gap-1 ${
                    connectionState.status === 'connected' ? 'text-green-600 dark:text-green-400' : 
                    connectionState.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                  }`}>
                    {connectionState.status === 'connected' && <Check size={12} />}
                    {connectionState.status === 'failed' && <X size={12} />}
                    Status: {connectionState.status}
                    {connectionState.error && <span className="ml-1 text-red-500">({connectionState.error})</span>}
                  </span>
                  
                  {connectionState.status !== 'connected' ? (
                    <button 
                      onClick={onConnect}
                      disabled={connectionState.status === 'connecting'}
                      className="px-3 py-1 bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium rounded hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      {connectionState.status === 'connecting' && <Loader2 size={12} className="animate-spin" />}
                      Test connection
                    </button>
                  ) : (
                    <button 
                      onClick={onDisconnect}
                      className="px-3 py-1 text-red-600 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20 rounded flex items-center gap-1"
                    >
                      <LogOut size={12} /> Disconnect
                    </button>
                  )}
                </div>
              </form>

              {/* Model Selection */}
              {connectionState.status === 'connected' && (
                <div className="mb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Model</label>
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
                    >
                      <Filter size={10} /> {showFilters ? 'Hide filters' : 'Filters'}
                    </button>
                  </div>

                  {showFilters && (
                    <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs grid grid-cols-2 gap-2 border border-slate-100 dark:border-slate-700 dark:text-slate-300">
                      <div className="col-span-2">
                        <label className="block text-[10px] uppercase text-slate-400 mb-1">Vendor</label>
                        <select
                          value={activeFilters.vendor}
                          onChange={(e) => updateFilters({ vendor: e.target.value })}
                          className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                          <option value="">
                            All vendors ({baseFilteredModels.length})
                          </option>
                          {vendorOptions.map(({ vendor, count }) => (
                            <option key={vendor} value={vendor}>
                              {vendor} ({count})
                            </option>
                          ))}
                        </select>
                      </div>
                      {isOpenRouter && (
                        <div className="col-span-2">
                          <label className="block text-[10px] uppercase text-slate-400 mb-1">Min Context Window</label>
                          <select
                            value={activeFilters.minContextWindow}
                            onChange={(e) => updateFilters({ minContextWindow: Number(e.target.value) })}
                            className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                          >
                            <option value="0">Any size</option>
                            <option value="32000">32k+</option>
                            <option value="64000">64k+</option>
                            <option value="128000">128k+</option>
                            <option value="200000">200k+</option>
                            <option value="1000000">1M+</option>
                          </select>
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

                  <select 
                    value={aiConfig.selectedModelId}
                    onChange={(e) => updateSelectedModel(e.target.value)}
                    className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="" disabled>Select a model...</option>
                    {filteredModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.contextLength ? `(${formatContextLength(m.contextLength)})` : ''} {m.isFree ? '(Free)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3">
                <label className="text-xs text-slate-500 dark:text-slate-400">Timeout (s)</label>
                <input
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
                  className="w-24 px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 text-center">
                Your API key is stored locally in your browser. Requests go directly to your provider.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="h-full w-1 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

      <div className="min-w-0">
        <HeaderNotebookSlot>{notebookTabs}</HeaderNotebookSlot>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 font-medium pl-3 border-l border-slate-200 dark:border-slate-800">
        <div className="relative" ref={themeDropdownRef}>
          <Button
            type="button"
            onClick={() => setIsThemeOpen((v) => !v)}
            variant="default"
            className="px-3"
            title="Theme"
            aria-haspopup="menu"
            aria-expanded={isThemeOpen}
          >
            <ThemeIcon size={16} className="opacity-80" />
            <span className="text-[10px] font-medium ml-1">Theme</span>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-400 ml-1">{themeLabel}</span>
            <ChevronDown size={14} className={`ml-1 transition-transform ${isThemeOpen ? 'rotate-180' : ''}`} />
          </Button>
          {isThemeOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 z-50"
              role="menu"
              aria-label="Theme"
            >
              {APP_THEME_PRESETS.map((preset) => {
                const isSelected = preset.id === theme;
                const icon =
                  preset.id === 'darkPlus' ? Moon
                    : preset.id === 'abyss' ? Layers
                      : Palette;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onThemeChange(preset.id);
                      setIsThemeOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                    role="menuitem"
                  >
                    <span className="flex items-center gap-2">
                      {React.createElement(icon, { size: 14, className: 'opacity-80' })}
                      <span className="font-medium">{preset.label}</span>
                    </span>
                    {isSelected && <Check size={14} className="opacity-80" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Privacy</span>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Donate</span>
      </div>
    </PanelHeader>
  );
};

export default Header;
