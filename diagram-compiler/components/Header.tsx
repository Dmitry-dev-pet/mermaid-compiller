import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X, Wifi, WifiOff, Loader2, Filter, LogOut, Moon, Sun } from 'lucide-react';
import { AIConfig, ConnectionState } from '../types';
import { MERMAID_VERSION } from '../constants';

interface HeaderProps {
  aiConfig: AIConfig;
  connectionState: ConnectionState;
  onConfigChange: (newConfig: AIConfig) => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  aiConfig, 
  connectionState, 
  onConfigChange, 
  onConnect, 
  onDisconnect,
  theme,
  onToggleTheme
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    const providerName = aiConfig.provider === 'openrouter' ? 'OpenRouter' : 'Proxy';
    return `AI: ${providerName} · ${modelName}`;
  };

  const getStatusColor = () => {
    if (connectionState.status === 'connected') return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-800';
    if (connectionState.status === 'failed') return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-800';
    return 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700';
  };

  const updateConfig = (updates: Partial<AIConfig>) => {
    onConfigChange({ ...aiConfig, ...updates });
  };

  const filteredModels = connectionState.availableModels.filter(m => {
    if (aiConfig.filters.freeOnly && !m.isFree) return false;
    if (aiConfig.filters.context8k && (m.contextLength || 0) < 8000) return false;
    return true;
  });

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm shrink-0 z-50 relative h-12 transition-colors">
      <div className="flex items-center gap-6">
        <h1 className="font-bold text-lg tracking-tight text-slate-800 dark:text-slate-100">Diagram Compiler</h1>
        
        {/* AI Control Plane Trigger */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-2 px-3 py-1 rounded-md border text-sm font-medium transition-colors ${getStatusColor()} dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300`}
          >
            {connectionState.status === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="truncate max-w-[200px]">{getStatusText()}</span>
            <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

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
                      onChange={() => updateConfig({ provider: 'openrouter' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">OpenRouter</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer dark:text-slate-300">
                    <input 
                      type="radio" 
                      name="provider" 
                      checked={aiConfig.provider === 'cliproxy'}
                      onChange={() => updateConfig({ provider: 'cliproxy' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm">My Proxy</span>
                  </label>
                </div>
              </div>

              {/* Connection Settings */}
              <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-700">
                {aiConfig.provider === 'openrouter' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">API Key</label>
                      <input 
                        type="password" 
                        value={aiConfig.openRouterKey}
                        onChange={(e) => updateConfig({ openRouterKey: e.target.value })}
                        placeholder="sk-or-..."
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                     <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Endpoint</label>
                      <input 
                        type="text" 
                        value={aiConfig.proxyEndpoint}
                        onChange={(e) => updateConfig({ proxyEndpoint: e.target.value })}
                        placeholder="http://localhost:8317"
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Proxy Key</label>
                      <input 
                        type="password" 
                        value={aiConfig.proxyKey || ''}
                        onChange={(e) => updateConfig({ proxyKey: e.target.value })}
                        placeholder="test"
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
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
              </div>

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
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={aiConfig.filters.freeOnly} onChange={e => updateConfig({ filters: {...aiConfig.filters, freeOnly: e.target.checked} })} />
                        Free only
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={aiConfig.filters.context8k} onChange={e => updateConfig({ filters: {...aiConfig.filters, context8k: e.target.checked} })} />
                        Context &ge; 8k
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={aiConfig.filters.testedOnly} onChange={e => updateConfig({ filters: {...aiConfig.filters, testedOnly: e.target.checked} })} />
                        Tested only
                      </label>
                    </div>
                  )}

                  <select 
                    value={aiConfig.selectedModelId}
                    onChange={(e) => updateConfig({ selectedModelId: e.target.value })}
                    className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="" disabled>Select a model...</option>
                    {filteredModels.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.isFree ? '(Free)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 text-center">
                Your API key is stored locally in your browser. Requests go directly to your provider.
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-slate-400 font-mono group relative cursor-help">
          Mermaid {MERMAID_VERSION}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
             Syntax version used for validation & rendering.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-medium">
        <button 
          onClick={onToggleTheme}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Privacy</span>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Donate</span>
      </div>
    </header>
  );
};

export default Header;
