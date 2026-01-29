import React, { useRef, useEffect } from 'react';
import { ExternalLink } from 'lucide-react';
import { AIConfig, ConnectionState, ModelParams, ThemePresetId } from '../types';
import PanelHeader from './ui/PanelHeader';
import { Button } from './ui/Button';
import AiControlPlaneMenu from './header/AiControlPlaneMenu';
import ThemeMenu from './header/ThemeMenu';

interface HeaderProps {
  aiConfig: AIConfig;
  modelParams: ModelParams | null;
  onModelParamsChange: React.Dispatch<React.SetStateAction<ModelParams | null>>;
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
  projectsHeader?: React.ReactNode;
}

const DEFAULT_DOCS_URL = 'https://<user>.github.io/mermaid-langgraph/';

const HeaderNotebookSlot: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  if (!children) return null;
  return <div className="flex-1 min-w-0">{children}</div>;
};

const Header: React.FC<HeaderProps> = ({ 
  aiConfig, 
  modelParams,
  onModelParamsChange,
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
  projectsHeader,
}) => {
  const headerRef = useRef<HTMLElement>(null);

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

  const docsUrl = (import.meta.env.VITE_DOCS_URL ?? DEFAULT_DOCS_URL).trim();
  const openDocs = () => {
    if (!docsUrl) return;
    window.open(docsUrl, '_blank', 'noopener,noreferrer');
  };

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
        {projectsHeader && <div className="flex-1 min-w-0">{projectsHeader}</div>}
      </div>

      <div className="h-full w-1 bg-transparent" aria-hidden="true" />

      <div className="min-w-0">
        <HeaderNotebookSlot>{notebookTabs}</HeaderNotebookSlot>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-slate-500 dark:text-slate-400 font-medium pl-3">
        <AiControlPlaneMenu
          aiConfig={aiConfig}
          modelParams={modelParams}
          onModelParamsChange={onModelParamsChange}
          connectionState={connectionState}
          onConfigChange={onConfigChange}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          llmTimeoutMs={llmTimeoutMs}
          onLLMTimeoutMsChange={onLLMTimeoutMsChange}
        />
        <ThemeMenu theme={theme} onThemeChange={onThemeChange} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openDocs}
          className="gap-1"
          title={docsUrl}
        >
          <ExternalLink size={12} className="opacity-80" />
          Docs
        </Button>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Privacy</span>
        <span className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200">Donate</span>
      </div>
    </PanelHeader>
  );
};

export default Header;
