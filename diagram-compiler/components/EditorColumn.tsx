import React, { useEffect, useRef } from 'react';
import { Check, Copy, PenTool, RefreshCw } from 'lucide-react';
import { EditorTab, MermaidState, PromptPreviewMode, PromptPreviewTab, PromptPreviewView } from '../types';
import { AUTO_FIX_MAX_ATTEMPTS } from '../constants';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/themes/prism.css';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import './syntax-dark.css';
import { isMarkdownLike } from '../services/mermaidService';
import type { DocsEntry } from '../services/docsContextService';

// Define minimal Mermaid grammar
languages.mermaid = {
  'comment': /%%.*/,
  'string': {
    pattern: /(["'])(?:(?!\1)[^\\\r\n]|\\.)*\1/,
    greedy: true
  },
  'keyword': /\b(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|subgraph|end|participant|actor|class|style|linkStyle)\b/,
  'arrow': /-->|---|-.->|==>|==|-.|--/,
  'operator': /[|:;]+/,
  'variable': /\b[A-Za-z_][A-Za-z0-9_]*\b/
};

interface EditorColumnProps {
  mermaidState: MermaidState;
  onChange: (code: string) => void;
  onAnalyze: () => void;
  onFixSyntax: () => void;
  isAIReady: boolean;
  isProcessing: boolean;
  analyzeLanguage: string;
  onAnalyzeLanguageChange: (lang: string) => void;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  promptPreviewView: PromptPreviewView;
  onPromptPreviewViewChange: (view: PromptPreviewView) => void;
  activeTab: EditorTab;
  buildDocsEntries: DocsEntry[];
  buildDocsSelection: Record<string, boolean>;
  onToggleBuildDoc: (path: string, isIncluded: boolean) => void;
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
  onActiveTabChange: (tab: EditorTab) => void;
}

const EditorColumn: React.FC<EditorColumnProps> = ({
  mermaidState,
  onChange,
  onAnalyze,
  onFixSyntax,
  isAIReady,
  isProcessing,
  analyzeLanguage,
  onAnalyzeLanguageChange,
  promptPreviewByMode,
  promptPreviewView,
  onPromptPreviewViewChange,
  activeTab,
  buildDocsEntries,
  buildDocsSelection,
  onToggleBuildDoc,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
  onActiveTabChange
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);
  const promptChat = promptPreviewByMode.chat;
  const promptBuild = promptPreviewByMode.build;
  const isPromptChatTab = activeTab === 'prompt_chat';
  const isPromptBuildTab = activeTab === 'prompt_build';
  const isBuildDocsTab = activeTab === 'build_docs';
  const isPromptTab = isPromptChatTab || isPromptBuildTab;
  const activePrompt = activeTab === 'prompt_chat' ? promptChat : activeTab === 'prompt_build' ? promptBuild : null;
  const resolvePromptContent = (prompt: PromptPreviewTab | null) => {
    if (!prompt) return '';
    if (promptPreviewView === 'raw') return prompt.rawContent ?? prompt.content ?? '';
    return prompt.redactedContent ?? prompt.content ?? '';
  };
  const activeBuildDoc = buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  const activeBuildDocName = activeBuildDoc?.path.split('/').pop() || activeBuildDoc?.path || 'Docs';
  const activePromptContent = isPromptChatTab
    ? resolvePromptContent(activePrompt)
    : isPromptBuildTab
      ? resolvePromptContent(activePrompt)
      : isBuildDocsTab
        ? activeBuildDoc?.text || ''
        : '';
  const chatTokens = promptChat?.tokenCounts?.total ?? 0;
  const buildTokens = promptBuild?.tokenCounts?.total ?? 0;
  const formatTokens = (count: number) => (count > 0 ? `~${count} tok` : '0 tok');

  useEffect(() => {
    if (!buildDocsEntries.length) {
      onBuildDocsActivePathChange('');
      return;
    }
    if (buildDocsActivePath && buildDocsEntries.some((entry) => entry.path === buildDocsActivePath)) return;
    onBuildDocsActivePathChange(buildDocsEntries[0]?.path ?? '');
  }, [buildDocsActivePath, buildDocsEntries, onBuildDocsActivePathChange]);

  // Sync scrolling
  const handleScroll = () => {
    if (scrollContainerRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
  };

  const handleCopy = () => {
    const textToCopy = isBuildDocsTab
      ? activeBuildDoc?.text || ''
      : isPromptTab
        ? activePromptContent
        : mermaidState.code;
    if (!textToCopy.trim()) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = mermaidState.code.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);
  const isMarkdown = isMarkdownLike(mermaidState.code);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-r border-slate-200 dark:border-slate-800">
      {/* Toolbar / Actions */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-mono w-full">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400">Status:</span>
              {isMarkdown && <span className="text-blue-600 dark:text-blue-400 font-bold">📄 Markdown</span>}
              {!isMarkdown && mermaidState.status === 'valid' && <span className="text-green-600 dark:text-green-400 font-bold">✅ Valid</span>}
              {!isMarkdown && mermaidState.status === 'invalid' && <span className="text-red-600 dark:text-red-400 font-bold">❌ Invalid (Line {mermaidState.errorLine})</span>}
              {mermaidState.status === 'empty' && <span className="text-slate-400">Empty</span>}
              {!isMarkdown && mermaidState.status === 'edited' && <span className="text-amber-600 dark:text-amber-400">⚠ Edited</span>}
            </div>
            <div className="flex items-center gap-1.5 font-sans ml-auto">
              <button 
                onClick={onAnalyze}
                disabled={!isAIReady || !mermaidState.code.trim() || isProcessing}
                className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title="Explain this diagram in chat"
              >
                <PenTool size={10} /> Analyze
              </button>

              <select
                value={analyzeLanguage}
                onChange={(e) => onAnalyzeLanguageChange(e.target.value)}
                className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 cursor-pointer"
                title="Analyze language"
                disabled={isProcessing}
              >
                <option value="auto">Auto</option>
                <option value="English">EN</option>
                <option value="Russian">RU</option>
              </select>

              <button 
                onClick={onFixSyntax}
                disabled={!isAIReady || mermaidState.isValid || isProcessing || isMarkdown}
                className="px-2 py-1 text-[10px] font-medium text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                title={`Attempt to fix syntax errors (up to ${AUTO_FIX_MAX_ATTEMPTS} tries)`}
              >
                 <RefreshCw size={10} className={isProcessing ? "animate-spin" : ""} /> Fix ({AUTO_FIX_MAX_ATTEMPTS})
              </button>

              <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

              <button 
                onClick={handleCopy}
                className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 transition-colors" 
                title={isBuildDocsTab ? 'Copy docs' : isPromptTab ? 'Copy prompt' : 'Copy code'}
              >
                {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            <span>Source: {mermaidState.source === 'user' ? 'User' : mermaidState.source === 'compiled' ? 'Compiled' : 'User (Override)'}</span>
          </div>
          <div className="flex items-center gap-1 mt-2">
            <button
              type="button"
              onClick={() => onActiveTabChange('code')}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                activeTab === 'code'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              Code
            </button>
            <button
              type="button"
              onClick={() => onActiveTabChange('prompt_chat')}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                activeTab === 'prompt_chat'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={`Prompt preview (Chat) • ${formatTokens(chatTokens)}`}
            >
              Prompt · Chat <span className="ml-1 text-[9px] opacity-80">{formatTokens(chatTokens)}</span>
            </button>
            <button
              type="button"
              onClick={() => onActiveTabChange('prompt_build')}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                activeTab === 'prompt_build'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title={`Prompt preview (Build) • ${formatTokens(buildTokens)}`}
            >
              Prompt · Build <span className="ml-1 text-[9px] opacity-80">{formatTokens(buildTokens)}</span>
            </button>
            <button
              type="button"
              onClick={() => onActiveTabChange('build_docs')}
              className={`px-2 py-0.5 text-[10px] rounded border ${
                activeTab === 'build_docs'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Build docs files"
            >
              Build Docs
            </button>
            {isPromptTab && (
              <div className="flex items-center gap-1 ml-2">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Prompt:</span>
                <button
                  type="button"
                  onClick={() => onPromptPreviewViewChange('redacted')}
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    promptPreviewView === 'redacted'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Redacted
                </button>
                <button
                  type="button"
                  onClick={() => onPromptPreviewViewChange('raw')}
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    promptPreviewView === 'raw'
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title="Raw prompt"
                >
                  Raw
                </button>
              </div>
            )}
          </div>
        </div>
        
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative flex overflow-hidden group">
        {isPromptChatTab ? (
          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]">
            <div className="px-4 py-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                {activePrompt?.title || 'Prompt preview'}
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                {activePrompt?.content || 'No prompt preview available.'}
              </pre>
            </div>
          </div>
        ) : isPromptBuildTab ? (
          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]">
            <div className="px-4 py-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 flex flex-wrap items-center gap-2">
                <span>Docs files:</span>
                {buildDocsEntries.length ? (
                  buildDocsEntries.map((entry) => {
                    const fileName = entry.path.split('/').pop() || entry.path;
                    const isIncluded = buildDocsSelection[entry.path] !== false;
                    return (
                      <button
                        key={entry.path}
                        type="button"
                        onClick={() => {
                          onBuildDocsActivePathChange(entry.path);
                          onActiveTabChange('build_docs');
                        }}
                        className={`text-[11px] underline ${
                          isIncluded
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500 line-through'
                        }`}
                        title={`Open ${entry.path} in Build Docs`}
                      >
                        {fileName}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">(none)</span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                {activePrompt?.title || 'Prompt preview'}
              </div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                {activePrompt?.content || 'No prompt preview available.'}
              </pre>
            </div>
          </div>
        ) : isBuildDocsTab ? (
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-[#282c34]">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-2 py-1">
              {buildDocsEntries.length ? (
                buildDocsEntries.map((entry) => {
                  const fileName = entry.path.split('/').pop() || entry.path;
                  const isActive = entry.path === activeBuildDoc?.path;
                  const isIncluded = buildDocsSelection[entry.path] !== false;
                  return (
                    <button
                      key={entry.path}
                      type="button"
                      onClick={() => onBuildDocsActivePathChange(entry.path)}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium whitespace-nowrap ${
                        isActive
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                      title={entry.path}
                    >
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        onChange={(event) => onToggleBuildDoc(entry.path, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        className="accent-indigo-600"
                      />
                      <span className="truncate max-w-[140px]">{fileName}</span>
                    </button>
                  );
                })
              ) : (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 px-2 py-1">
                  No docs loaded
                </div>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              <div className="px-4 py-3">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  {activeBuildDocName}
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                  {activeBuildDoc?.text || 'No documentation loaded for this type.'}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Line Numbers */}
            <div 
              ref={lineNumbersRef}
              className="w-10 bg-slate-50 dark:bg-[#21252b] border-r border-slate-200 dark:border-[#181a1f] text-right pr-2 pt-4 text-xs font-mono text-slate-400 dark:text-slate-500 select-none overflow-hidden"
            >
              {lineNumbers.map(n => (
                <div key={n} className={`h-5 leading-5 ${n === mermaidState.errorLine ? 'text-red-500 dark:text-red-400 font-bold bg-red-100 dark:bg-red-900/20' : ''}`}>{n}</div>
              ))}
            </div>

            {/* Text Area / Editor */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-auto bg-slate-50 dark:bg-[#282c34]"
            >
                <Editor
                  value={mermaidState.code}
                  onValueChange={onChange}
                  highlight={(code) => highlight(code, isMarkdown ? languages.markdown : languages.mermaid, isMarkdown ? 'markdown' : 'mermaid')}
                  padding={16}
                  textareaClassName="focus:outline-none"
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 12,
                    backgroundColor: 'transparent',
                    minHeight: '100%',
                    lineHeight: '20px', 
                  }}
                />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditorColumn;
