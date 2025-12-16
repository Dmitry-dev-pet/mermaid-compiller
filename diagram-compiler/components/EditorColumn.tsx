import React, { useRef } from 'react';
import { Play, Check, Copy, PenTool, RefreshCw } from 'lucide-react';
import { MermaidState } from '../types';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/themes/prism.css';
import './syntax-dark.css';

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
  onRecompile: () => void;
  isAIReady: boolean;
  isProcessing: boolean;
  language: string;
  onLanguageChange: (lang: string) => void;
}

const EditorColumn: React.FC<EditorColumnProps> = ({
  mermaidState,
  onChange,
  onAnalyze,
  onFixSyntax,
  onRecompile,
  isAIReady,
  isProcessing,
  language,
  onLanguageChange
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  // Sync scrolling
  const handleScroll = () => {
    if (scrollContainerRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollContainerRef.current.scrollTop;
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(mermaidState.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineCount = mermaidState.code.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(lineCount, 1) }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-r border-slate-200 dark:border-slate-800">
      {/* Toolbar / Actions */}
      <div className="p-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 dark:text-slate-400">Status:</span>
            {mermaidState.status === 'valid' && <span className="text-green-600 dark:text-green-400 font-bold">✅ Valid</span>}
            {mermaidState.status === 'invalid' && <span className="text-red-600 dark:text-red-400 font-bold">❌ Invalid (Line {mermaidState.errorLine})</span>}
            {mermaidState.status === 'empty' && <span className="text-slate-400">Empty</span>}
            {mermaidState.status === 'edited' && <span className="text-amber-600 dark:text-amber-400">⚠ Edited</span>}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
            <span>Source: {mermaidState.source === 'user' ? 'User' : mermaidState.source === 'compiled' ? 'Compiled' : 'User (Override)'}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 cursor-pointer"
              title="Select AI Language"
            >
              <option value="auto">Auto</option>
              <option value="English">EN</option>
              <option value="Russian">RU</option>
            </select>

            <button 
              onClick={onAnalyze}
              disabled={!isAIReady || !mermaidState.code.trim() || isProcessing}
              className="px-2 py-1 text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Explain this diagram in chat"
            >
              <PenTool size={10} /> Analyze
            </button>

            <button 
              onClick={onFixSyntax}
              disabled={!isAIReady || mermaidState.isValid || isProcessing}
              className="px-2 py-1 text-[10px] font-medium text-white bg-amber-600 hover:bg-amber-700 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Attempt to fix syntax errors"
            >
               <RefreshCw size={10} className={isProcessing ? "animate-spin" : ""} /> Fix
            </button>

            <button 
              onClick={onRecompile}
              disabled={!isAIReady || isProcessing}
              className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm"
              title="Regenerate from Spec"
            >
              <Play size={10} fill="currentColor" /> Run
            </button>

            <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

            <button 
              onClick={handleCopy}
              className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 transition-colors" 
              title="Copy code"
            >
              {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
            </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative flex overflow-hidden group">
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
              highlight={code => highlight(code, languages.mermaid, 'mermaid')}
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
      </div>
    </div>
  );
};

export default EditorColumn;
