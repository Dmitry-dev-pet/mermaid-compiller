import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { FileText, MessageSquare, Play, Plus, Trash2 } from 'lucide-react';
import { DiagramType, LLMRequestPreview, Message, PromptPreviewMode, PromptTokenCounts } from '../types';
import type { DiagramMarker } from '../hooks/core/useHistory';
import { DIAGRAM_TYPE_LABELS } from '../utils/diagramTypeMeta';
import ChatProjects from './ChatProjects';
import { MODE_BUTTON_DISABLED, MODE_UI } from '../utils/uiModes';

interface ChatColumnProps {
  messages: Message[];
  onChat: (text: string) => void;
  onBuild: (text?: string) => void;
  onClear: () => void;
  onNewProject: () => void;
  onNewMarkdownNotebook: (args?: { blocks?: number }) => void;
  isProcessing: boolean;
  hasIntent: boolean;
  onSetPromptPreview: (
    mode: PromptPreviewMode,
    title: string,
    redactedContent: string,
    rawContent: string,
    tokenCounts?: PromptTokenCounts,
    systemPrompt?: string,
    systemPromptRedacted?: string,
    language?: string
  ) => void;
  diagramType: DiagramType;
  onDiagramTypeChange: (type: DiagramType) => void;
  detectedDiagramType: DiagramType | null;
  onPreviewPrompt: (mode: PromptPreviewMode, input: string) => Promise<LLMRequestPreview>;
  buildDocsSelectionKey: string;
  promptPreviewKey: string;
  diagramMarkers?: DiagramMarker[];
  diagramStepAnchors?: Record<string, string>;
  selectedStepId?: string | null;
  onSelectDiagramStep?: (stepId: string) => void | Promise<void>;
  projects: React.ComponentProps<typeof ChatProjects>['projects'];
  activeProjectId: React.ComponentProps<typeof ChatProjects>['activeProjectId'];
  onOpenProject: (sessionId: string) => void | Promise<void>;
  onRenameProject: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteProject: (sessionId: string) => void | Promise<void>;
  onUndoDeleteProject: (sessionId: string) => void;
  deleteUndoMs: number;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
  messages,
  onChat,
  onBuild,
  onClear,
  onNewProject,
  onNewMarkdownNotebook,
  isProcessing,
  hasIntent,
  onSetPromptPreview,
  diagramType,
  onDiagramTypeChange,
  detectedDiagramType,
  onPreviewPrompt,
  diagramMarkers = [],
  diagramStepAnchors = {},
  selectedStepId = null,
  buildDocsSelectionKey,
  promptPreviewKey,
  onSelectDiagramStep,
  projects,
  activeProjectId,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onUndoDeleteProject,
  deleteUndoMs
}) => {
  const [input, setInput] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const messageElsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const isAtBottomRef = useRef(true);
  const previewRequestRef = useRef(0);
  const previewTimerRef = useRef<number | null>(null);
  const lastMessageTimestamp = messages[messages.length - 1]?.timestamp ?? 0;
  const estimateTokens = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.max(1, Math.ceil(trimmed.length / 4));
  };

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
                ? 'Snapshot'
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

  const formatMessagesForPreview = useCallback((previewMessages: Message[]) => {
    if (previewMessages.length === 0) return '(no messages)';
    return previewMessages
      .map((message) => {
        const roleLabel = message.role.toUpperCase();
        const content = message.content.trim() || '(empty)';
        return `[${roleLabel}] ${content}`;
      })
      .join('\n\n');
  }, []);

  const parseDocsContext = useCallback((docsContext: string) => {
    const lines = docsContext.split(/\r?\n/);
    const entries: Array<{ fileName: string; tokens: number }> = [];
    let currentPath = '';
    let buffer: string[] = [];
    const flush = () => {
      if (!currentPath) return;
      const content = buffer.join('\n');
      const tokensMatch = currentPath.match(/\(~(\d+)\s+tok\)/);
      const tokens = tokensMatch?.[1] ? Number(tokensMatch[1]) : estimateTokens(content);
      const fileName = currentPath.replace(/\s+\(~\d+\s+tok\)\s*$/, '').trim();
      entries.push({ fileName, tokens: Number.isFinite(tokens) ? tokens : 0 });
      currentPath = '';
      buffer = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^--- (.+) ---$/);
      if (match) {
        flush();
        currentPath = match[1];
        buffer = [];
        continue;
      }
      if (currentPath) buffer.push(line);
    }
    flush();

    return entries;
  }, []);

  const formatRequestPreview = useCallback(
    (preview: LLMRequestPreview, options: { redactDocs: boolean }) => {
      const docsEntries = parseDocsContext(preview.docsContext);
      const docsTotalTokens = docsEntries.reduce((sum, entry) => sum + entry.tokens, 0);
      const docsSummaryBlock = docsEntries.length
        ? docsEntries.map((entry) => `--- ${entry.fileName} --- (~${entry.tokens} tok)`).join('\n')
        : '';
      const systemPromptValue =
        options.redactDocs && preview.docsContext && docsSummaryBlock
          ? preview.systemPrompt.replace(preview.docsContext, docsSummaryBlock)
          : preview.systemPrompt;
      const hasDocs = docsEntries.length > 0;
      const metaLines =
        preview.mode === 'build'
          ? [`Mode: ${preview.mode}`, `Diagram type: ${preview.diagramType}`, `Language: ${preview.language}`]
          : [];
      const lines = [
        preview.error ? `Error: ${preview.error}` : '',
        hasDocs ? `Docs files: ${docsEntries.map((entry) => `${entry.fileName} (~${entry.tokens} tok)`).join(', ')}` : '',
        hasDocs ? `Docs tokens total: ~${docsTotalTokens} tok` : '',
        ...metaLines,
        '',
        '--- System Prompt ---',
        systemPromptValue.trim() || '(empty)',
        '',
        '--- Messages ---',
        formatMessagesForPreview(preview.messages),
      ].filter((line) => line !== '');
      return lines.join('\n');
    },
    [formatMessagesForPreview, parseDocsContext]
  );

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

    if (!hasIntent) return;
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

  const updatePromptPreview = useCallback(async (mode: PromptPreviewMode, promptInput: string, requestId: number) => {
    const title =
      mode === 'chat'
        ? 'LLM request (Chat)'
        : mode === 'build'
          ? 'LLM request (Build)'
          : mode === 'analyze'
            ? 'LLM request (Analyze)'
            : 'LLM request (Fix)';
    try {
      const preview = await onPreviewPrompt(mode, promptInput);
      if (requestId !== previewRequestRef.current) return;
      const systemTokens = estimateTokens(preview.systemPrompt);
      const messagesTokens = preview.messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
      const tokenCounts: PromptTokenCounts = {
        system: systemTokens,
        messages: messagesTokens,
        total: systemTokens + messagesTokens,
      };
      const redacted = formatRequestPreview(preview, { redactDocs: true });
      const raw = formatRequestPreview(preview, { redactDocs: false });
      onSetPromptPreview(
        mode,
        title,
        redacted,
        raw,
        tokenCounts,
        preview.systemPrompt,
        preview.systemPromptRedacted,
        preview.language
      );
    } catch (error: unknown) {
      if (requestId !== previewRequestRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      const errorText = `Error: ${message}`;
      onSetPromptPreview(mode, title, errorText, errorText);
    }
  }, [formatRequestPreview, onPreviewPrompt, onSetPromptPreview]);

  useEffect(() => {
    const requestId = ++previewRequestRef.current;
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      void updatePromptPreview('chat', input, requestId);
      void updatePromptPreview('build', input, requestId);
      void updatePromptPreview('analyze', input, requestId);
      void updatePromptPreview('fix', input, requestId);
    }, 250);

    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
      }
    };
  }, [
    buildDocsSelectionKey,
    diagramType,
    hasIntent,
    input,
    lastMessageTimestamp,
    messages.length,
    onPreviewPrompt,
    promptPreviewKey,
    updatePromptPreview,
  ]);

  const detectedLabel = detectedDiagramType ? DIAGRAM_TYPE_LABELS[detectedDiagramType] ?? detectedDiagramType : null;
  const selectedLabel = DIAGRAM_TYPE_LABELS[diagramType] ?? diagramType;
  const isDetectedMatch = !!detectedDiagramType && detectedDiagramType === diagramType;
  const assistantModeStyles = {
    chat: MODE_UI.chat.bubble,
    build: MODE_UI.build.bubble,
    fix: MODE_UI.fix.bubble,
    analyze: MODE_UI.analyze.bubble,
    system: MODE_UI.system.bubble,
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
      {/* Type Selector */}
      <div className="h-24 p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-center">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Diagram type</label>
        <select 
          value={diagramType}
          onChange={(e) => onDiagramTypeChange(e.target.value as DiagramType)}
          className="w-full text-sm p-1.5 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="architecture">Architecture</option>
          <option value="block">Block</option>
          <option value="c4">C4 (experimental)</option>
          <option value="class">Class Diagram</option>
          <option value="er">Entity Relationship</option>
          <option value="sequence">Sequence Diagram</option>
          <option value="flowchart">Flowchart</option>
          <option value="gantt">Gantt</option>
          <option value="gitGraph">Git Graph</option>
          <option value="kanban">Kanban</option>
          <option value="mindmap">Mindmap</option>
          <option value="packet">Packet</option>
          <option value="pie">Pie</option>
          <option value="quadrantChart">Quadrant Chart</option>
          <option value="radar">Radar</option>
          <option value="requirementDiagram">Requirement Diagram</option>
          <option value="sankey">Sankey</option>
          <option value="state">State Diagram</option>
          <option value="timeline">Timeline</option>
          <option value="treemap">Treemap</option>
          <option value="userJourney">User Journey</option>
          <option value="xychart">XY Chart</option>
          <option value="zenuml">ZenUML</option>
        </select>
        {detectedLabel && (
          <div
            className={`mt-1 text-[11px] ${
              isDetectedMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            По коду: {detectedLabel}
            {!isDetectedMatch ? ` (выбрано: ${selectedLabel})` : ''}
          </div>
        )}
      </div>

      <ChatProjects
        projects={projects}
        activeProjectId={activeProjectId}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
        onRenameProject={onRenameProject}
        onDeleteProject={onDeleteProject}
        onUndoDeleteProject={onUndoDeleteProject}
        deleteUndoMs={deleteUndoMs}
      />

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
	                      m.isSelected
	                        ? 'bg-blue-600 text-white border-blue-600'
	                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
	                    }`}
	                    title={`Step #${m.stepIndex + 1} • ${m.label}`}
	                  >
	                    #{m.stepIndex + 1} {m.label}
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
            {messages.map((msg) => {
              const isErrorMessage =
                msg.role === 'assistant' &&
                /^(Error|Build failed|Analysis failed|Fix failed|Generation failed|Error generating diagram|Error analyzing diagram)(?:\s*\(.*?\))?:/.test(msg.content);
              const assistantStyle = assistantModeStyles[msg.mode ?? 'chat'] ?? MODE_UI.chat.bubble;
              return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div 
                  ref={(el) => {
                    messageElsRef.current[msg.id] = el;
                  }}
                  className={`max-w-[90%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words transition-shadow ${
                    focusedMessageId === msg.id ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900' : ''
                  } ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none shadow-sm' 
                      : isErrorMessage
                        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-bl-none shadow-sm font-mono text-[12px] leading-relaxed'
                        : `${assistantStyle} rounded-bl-none shadow-sm`
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 px-1">
                  {msg.role === 'user' ? 'You' : 'Assistant'}
                </span>
              </div>
            );
            })}
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

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onNewProject}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                title="Новый проект (сброс чата, диаграммы и истории)"
                type="button"
              >
                <Plus size={12} /> Новый проект
              </button>
              <button
                onClick={() => onNewMarkdownNotebook({ blocks: 3 })}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
                title="Открыть Markdown-ноутбук проекта с описаниями и множеством Mermaid-схем (смотри вкладку Markdown; блоки редактируются во вкладках Mermaid 1, Mermaid 2, ...)"
                type="button"
              >
                <FileText size={12} /> MD notebook
              </button>
              <button
                onClick={onClear}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 flex items-center gap-1 transition-colors"
                title="Clear chat history"
                type="button"
              >
                <Trash2 size={12} /> Clear spec
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                Enter: Chat • Ctrl/Cmd+Enter: Build
              </span>
              <button
                onClick={() => handleSubmit('chat')}
                disabled={!input.trim() || isProcessing}
                className={`px-2.5 py-1.5 text-xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  !input.trim() || isProcessing
                    ? MODE_BUTTON_DISABLED
                    : MODE_UI.chat.button
                }`}
                title="Chat (text only)"
              >
                <MessageSquare size={14} /> Chat
              </button>
              <button
                onClick={() => handleSubmit('build')}
                disabled={(!input.trim() && !hasIntent) || isProcessing}
                className={`px-2.5 py-1.5 text-xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  (!input.trim() && !hasIntent) || isProcessing
                    ? MODE_BUTTON_DISABLED
                    : MODE_UI.build.button
                }`}
                title={input.trim() ? 'Build diagram from this prompt' : 'Build diagram from intent'}
              >
                <Play size={14} /> Build
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ChatColumn;
