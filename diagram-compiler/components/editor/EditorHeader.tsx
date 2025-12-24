import React from 'react';
import { Bookmark, Check, Copy, PenTool, RefreshCw } from 'lucide-react';
import { AUTO_FIX_MAX_ATTEMPTS } from '../../constants';
import { EditorTab, MermaidState } from '../../types';

interface EditorHeaderProps {
  mermaidState: MermaidState;
  isMarkdown: boolean;
  markdownValidCount: number;
  markdownInvalidCount: number;
  isProcessing: boolean;
  isAIReady: boolean;
  analyzeLanguage: string;
  onAnalyzeLanguageChange: (lang: string) => void;
  onAnalyze: () => void;
  onFixSyntax: () => void;
  canFix: boolean;
  onSnapshot: () => void;
  canSnapshot: boolean;
  onCopy: () => void;
  copied: boolean;
  activeTab: EditorTab;
  onActiveTabChange: (tab: EditorTab) => void;
  isMarkdownMermaidTab: boolean;
  isBuildDocsTab: boolean;
}

const EditorHeader: React.FC<EditorHeaderProps> = ({
  mermaidState,
  isMarkdown,
  markdownValidCount,
  markdownInvalidCount,
  isProcessing,
  isAIReady,
  analyzeLanguage,
  onAnalyzeLanguageChange,
  onAnalyze,
  onFixSyntax,
  canFix,
  onSnapshot,
  canSnapshot,
  onCopy,
  copied,
  activeTab,
  onActiveTabChange,
  isMarkdownMermaidTab,
  isBuildDocsTab,
}) => {
  return (
    <div className="h-24 p-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col flex-1 min-w-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs font-mono w-full">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-slate-500 dark:text-slate-400">Status:</span>
            {isMarkdown && <span className="text-blue-600 dark:text-blue-400 font-bold">📄 Markdown</span>}
            {isMarkdown && markdownValidCount + markdownInvalidCount > 0 && (
              <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <span>Blocks:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-green-700" />
                  <span>{markdownValidCount}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-red-700" />
                  <span>{markdownInvalidCount}</span>
                </span>
              </span>
            )}
            {!isMarkdown && mermaidState.status === 'valid' && (
              <span
                className="inline-flex h-3 w-3 rounded-full bg-green-500 ring-1 ring-green-700"
                title="Valid diagram"
              />
            )}
            {!isMarkdown && mermaidState.status === 'invalid' && (
              <span
                className="inline-flex h-3 w-3 rounded-full bg-red-500 ring-1 ring-red-700"
                title={`Invalid diagram${mermaidState.errorLine ? ` (Line ${mermaidState.errorLine})` : ''}`}
              />
            )}
            {mermaidState.status === 'empty' && <span className="text-slate-400">Empty</span>}
            {!isMarkdown && mermaidState.status === 'edited' && (
              <span className="text-amber-600 dark:text-amber-400">⚠ Edited</span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 font-sans justify-self-end">
            <button
              onClick={onAnalyze}
              disabled={!isAIReady || !mermaidState.code.trim() || isProcessing}
              className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shrink-0 whitespace-nowrap"
              title="Explain this diagram in chat"
            >
              <PenTool size={10} /> Analyze
            </button>

            <select
              value={analyzeLanguage}
              onChange={(e) => onAnalyzeLanguageChange(e.target.value)}
              className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 cursor-pointer shrink-0"
              title="Analyze language"
              disabled={isProcessing}
            >
              <option value="auto">Auto</option>
              <option value="English">EN</option>
              <option value="Russian">RU</option>
            </select>

            <button
              onClick={onFixSyntax}
              disabled={!isAIReady || isProcessing || !canFix}
              className={`px-2 py-1 text-[10px] font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shrink-0 whitespace-nowrap ${
                canFix
                  ? 'text-white bg-amber-600 hover:bg-amber-700'
                  : 'text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-500'
              }`}
              title={`Attempt to fix syntax errors (up to ${AUTO_FIX_MAX_ATTEMPTS} tries)`}
            >
              <RefreshCw size={10} className={isProcessing ? 'animate-spin' : ''} /> Fix ({AUTO_FIX_MAX_ATTEMPTS})
            </button>

            <button
              onClick={onSnapshot}
              disabled={!canSnapshot}
              className={`px-2 py-1 text-[10px] font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shrink-0 whitespace-nowrap ${
                canSnapshot
                  ? 'text-white bg-slate-700 hover:bg-slate-800'
                  : 'text-slate-400 bg-slate-200 dark:bg-slate-700 dark:text-slate-500'
              }`}
              title={isMarkdownMermaidTab ? 'Save current diagram state to history' : 'Save current diagram state to history'}
            >
              <Bookmark size={10} /> Snapshot
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

            <button
              onClick={onCopy}
              className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 transition-colors"
              title={
                isMarkdownMermaidTab
                  ? 'Copy mermaid block'
                  : isBuildDocsTab
                  ? 'Copy docs'
                  : 'Copy code'
              }
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          <span>
            Source:{' '}
            {mermaidState.source === 'user'
              ? 'User'
              : mermaidState.source === 'compiled'
              ? 'Compiled'
              : 'User (Override)'}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <button
            type="button"
            onClick={() => onActiveTabChange('code')}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              activeTab === 'code' || activeTab === 'markdown_mermaid'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Code
          </button>
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>
          <button
            type="button"
            onClick={() => onActiveTabChange('build_docs')}
            className={`px-2 py-0.5 text-[10px] rounded border ${
              activeTab === 'build_docs'
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Build docs files"
          >
            Build Docs
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorHeader;
