import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2, MessageSquare } from 'lucide-react';
import { Message, DiagramType } from '../types';

interface ChatColumnProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  onClear: () => void;
  isProcessing: boolean;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  mermaidStatus: 'empty' | 'valid' | 'invalid' | 'edited';
}

const ChatColumn: React.FC<ChatColumnProps> = ({
  messages,
  onSendMessage,
  onClear,
  isProcessing,
  diagramType,
  onDiagramTypeChange,
  mermaidStatus
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm text-center px-4">
             <MessageSquare size={32} className="mb-2 opacity-50" />
             <p>Describe your system or process here.</p>
             <p className="text-xs mt-1">"User logs in, then checks balance..."</p>
          </div>
        ) : (
          <>
            {messages.length > 5 && (
              <div className="text-center">
                 <span className="text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">Earlier messages collapsed</span>
              </div>
            )}
            {messages.slice(-5).map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  className={`max-w-[90%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
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
          <button 
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isProcessing}
            className="absolute bottom-2 right-2 p-1.5 bg-blue-600 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="flex justify-between items-center mt-2">
           <button 
             onClick={onClear} 
             className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
             title="Clear chat history"
            >
             <Trash2 size={12} /> Clear spec
           </button>
           <div className="text-[10px] font-medium">
             {mermaidStatus === 'edited' ? (
                <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  ⚠ Spec ignored (manual override)
                </span>
             ) : (
                <span className="text-green-600 dark:text-green-500 flex items-center gap-1">
                  ✓ Used for next compile
                </span>
             )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default ChatColumn;
