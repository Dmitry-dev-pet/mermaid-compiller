import React, { useMemo, useRef, useEffect, useState } from 'react';
import { MessageSquare, Play, Trash2 } from 'lucide-react';
import { Message, DiagramType } from '../types';
import type { DiagramMarker } from '../hooks/useHistory';

interface ChatColumnProps {
  messages: Message[];
  onChat: (text: string) => void;
  onBuild: (text?: string) => void;
  onClear: () => void;
  isProcessing: boolean;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  mermaidStatus: 'empty' | 'valid' | 'invalid' | 'edited';
  diagramMarkers?: DiagramMarker[];
  diagramStepAnchors?: Record<string, string>;
  selectedStepId?: string | null;
  onSelectDiagramStep?: (stepId: string) => void | Promise<void>;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
  messages,
  onChat,
  onBuild,
  onClear,
  isProcessing,
  diagramType,
  onDiagramTypeChange,
  mermaidStatus,
  diagramMarkers = [],
  diagramStepAnchors = {},
  selectedStepId = null,
  onSelectDiagramStep
}) => {
  const [input, setInput] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const hasChatContext = messages.some((m) => m.id !== 'init' && m.role === 'user' && m.content.trim().length > 0);
  const messageElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const isAtBottomRef = useRef(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isAtBottomRef.current) scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const t = window.setTimeout(() => setFocusedMessageId(null), 1600);
    return () => window.clearTimeout(t);
  }, [focusedMessageId]);

  const scrollToMessage = (messageId: string) => {
    const el = messageElsRef.current[messageId];
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedMessageId(messageId);
    return true;
  };

  const onMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const thresholdPx = 64;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
  };

  const markersUi = useMemo(() => {
    return diagramMarkers.map((m) => {
      const isSelected = m.stepId === selectedStepId;
      const label =
        m.type === 'build'
          ? 'Build'
          : m.type === 'fix'
            ? 'Fix'
            : m.type === 'recompile'
              ? 'Run'
              : m.type === 'manual_edit'
                ? 'Edit'
                : m.type === 'seed'
                  ? 'Seed'
                  : m.type;

      return { ...m, isSelected, label };
    });
  }, [diagramMarkers, selectedStepId]);

  const handleMarkerClick = (stepId: string) => {
    onSelectDiagramStep?.(stepId);
    const anchor = diagramStepAnchors[stepId];
    if (anchor) {
      requestAnimationFrame(() => scrollToMessage(anchor));
    } else {
      requestAnimationFrame(() => scrollToBottom());
    }
  };

  const handleSubmit = (mode: 'chat' | 'build', e?: React.FormEvent) => {
    e?.preventDefault();
    if (isProcessing) return;

    if (mode === 'chat') {
      if (!input.trim()) return;
      onChat(input);
      setInput('');
      return;
    }

    const prompt = input.trim();
    if (prompt) {
      onBuild(prompt);
      setInput('');
      return;
    }

    if (!hasChatContext) return;
    onBuild(undefined);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit('build');
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit('chat');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
      {/* Type Selector */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Diagram type</label>
        <select 
          value={diagramType}
          onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
          className="w-full text-sm p-1.5 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="sequence">Sequence Diagram</option>
          <option value="flowchart">Flowchart</option>
          <option value="er">Entity Relationship</option>
        </select>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={onMessagesScroll} className="flex-1 overflow-y-auto p-4 space-y-4">
        {diagramMarkers.length > 0 && (
          <div className="sticky top-0 -mt-4 -mx-4 px-4 py-2 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200/70 dark:border-slate-800/70 z-10">
            <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Diagram renders
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {markersUi.map((m) => {
                return (
                  <button
                    key={m.stepId}
                    type="button"
                    onClick={() => handleMarkerClick(m.stepId)}
                    className={`shrink-0 px-2 py-1 rounded-full text-[10px] border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                    title={`Step #${m.stepIndex + 1} • ${label}`}
                  >
                    #{m.stepIndex + 1} {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm text-center px-4">
             <MessageSquare size={32} className="mb-2 opacity-50" />
             <p>Describe your system or process here.</p>
             <p className="text-xs mt-1">"User logs in, then checks balance..."</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  ref={(el) => {
                    messageElsRef.current[msg.id] = el;
                  }}
                  className={`max-w-[90%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap transition-shadow ${
                    focusedMessageId === msg.id ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900' : ''
                  } ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none shadow-sm' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
              </div>
            ))}
            {isProcessing && (
              <div className="flex items-start">
                <div className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-2 rounded-lg rounded-bl-none text-xs flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type specification..."
            className="w-full resize-none rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 max-h-32 min-h-[80px]"
          />
        </div>
        <div className="flex justify-between items-center mt-2">
           <button 
             onClick={onClear} 
             className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
             title="Clear chat history"
            >
             <Trash2 size={12} /> Clear spec
           </button>
           <div className="flex items-center gap-2">
             <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
               Enter: Chat • Ctrl/Cmd+Enter: Build
             </span>
             <button
               onClick={() => handleSubmit('chat')}
               disabled={!input.trim() || isProcessing}
               className="px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors inline-flex items-center gap-1.5"
               title="Chat (text only)"
             >
               <MessageSquare size={14} /> Chat
             </button>
             <button
               onClick={() => handleSubmit('build')}
               disabled={(!input.trim() && !hasChatContext) || isProcessing}
               className="px-2.5 py-1.5 text-xs rounded-md bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5"
               title={input.trim() ? 'Build diagram from this prompt' : 'Build diagram from chat context'}
             >
               <Play size={14} /> Build
             </button>
           </div>
           <div className="text-[10px] font-medium">
             {mermaidStatus === 'edited' ? (
                <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  ⚠ Diagram manually edited
                </span>
             ) : (
                <span className="text-green-600 dark:text-green-500 flex items-center gap-1">
                  ✓ Used for next build
                </span>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default ChatColumn;
