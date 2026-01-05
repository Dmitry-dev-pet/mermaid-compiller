import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, MessageSquare, Play, Plus, Trash2 } from 'lucide-react';
import { LLMRequestPreview, Message, PromptPreviewMode, PromptTokenCounts } from '../types';
import ChatProjects from './ChatProjects';
import { MODE_BUTTON_DISABLED, MODE_UI } from '../utils/uiModes';
import './chat-markdown.css';
import ChatMarkdownTabs from './chat/ChatMarkdownTabs';
import ChatStatusGroup from './chat/ChatStatusGroup';
import { parseNotebookBuildMessage } from './chat/chatMessageUtils';

interface ChatColumnProps {
  messages: Message[];
  onChat: (text: string) => void;
  onBuild: (text?: string) => void;
  onClear: () => void;
  onNewProject: () => void;
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
    language?: string,
    intentText?: string
  ) => void;
  intentText?: string;
  diagramType: import('../types').DiagramType;
  onDiagramTypeChange: (type: import('../types').DiagramType) => void;
  detectedDiagramType: import('../types').DiagramType | null;
  onPreviewPrompt: (mode: PromptPreviewMode, input: string) => Promise<LLMRequestPreview>;
  buildDocsSelectionKey: string;
  promptPreviewKey: string;
  onOpenNotebookBlock?: (index: number) => void;
  isNotebookChatMode?: boolean;
  onBackToNotebookMainChat?: () => void;
  projects: React.ComponentProps<typeof ChatProjects>['projects'];
  activeProjectId: React.ComponentProps<typeof ChatProjects>['activeProjectId'];
  onOpenProject: (sessionId: string) => void | Promise<void>;
  onRenameProject: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteProject: (sessionId: string) => void | Promise<void>;
  onUndoDeleteProject: (sessionId: string) => void;
  onPreviewProjectSnapshot: (sessionId: string) => Promise<void>;
  onClearProjectPreview: () => void;
  deleteUndoMs: number;
  notebookBuildCount: number | null;
  onNotebookBuildCountChange: (count: number | null) => void;
}

const ChatColumn: React.FC<ChatColumnProps> = ({
  messages,
  onChat,
  onBuild,
  onClear,
  onNewProject,
  isProcessing,
  hasIntent,
  onSetPromptPreview,
  diagramType,
  onDiagramTypeChange,
  detectedDiagramType,
  onPreviewPrompt,
  buildDocsSelectionKey,
  promptPreviewKey,
  onOpenNotebookBlock,
  isNotebookChatMode = false,
  onBackToNotebookMainChat,
  projects,
  activeProjectId,
  onOpenProject,
  onRenameProject,
  onDeleteProject,
  onUndoDeleteProject,
  onPreviewProjectSnapshot,
  onClearProjectPreview,
  deleteUndoMs,
  notebookBuildCount,
  onNotebookBuildCountChange,
  intentText,
}) => {
  const [input, setInput] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessagesCountRef = useRef(messages.length);
  const previewRequestRef = useRef(0);
  const previewTimerRef = useRef<number | null>(null);
  const lastMessageTimestamp = messages[messages.length - 1]?.timestamp ?? 0;
  const estimateTokens = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return Math.max(1, Math.ceil(trimmed.length / 4));
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    const prevCount = prevMessagesCountRef.current;
    const nextCount = messages.length;
    prevMessagesCountRef.current = nextCount;

    // When chat resets (new project / clear), avoid smooth scrolling artifacts.
    if (nextCount < prevCount) {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTo({ top: 0, behavior: 'auto' });
      }
      isAtBottomRef.current = true;
      return;
    }

    if (isAtBottomRef.current) scrollToBottom('smooth');
  }, [messages.length]);

  const onMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const thresholdPx = 64;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
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

  const shouldRenderMarkdown = (message: Message, isStatus: boolean) => {
    if (message.role !== 'assistant' || isStatus) return false;
    const text = message.content.trim();
    if (!text) return false;
    return /(^|\n)#{1,6}\s+/.test(text) || /^Intent:\s*/i.test(text);
  };

  const isStatusMessage = useCallback((message: Message) => {
    if (message.role !== 'assistant') return false;
    if (!message.content) return false;
    const content = message.content.replace(/^\[notebook-block:\d+\]\s*/i, '').trim();
    return /^(Build|Chat|Fix|Analyze|Recompile|Notebook|Planner|Notebook block|Сборка|Чат|Исправление|Анализ|Пересборка|Ноутбук|Планировщик)(:|\s|\n)/i
      .test(content);
  }, []);

  const lastStatusIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (isStatusMessage(messages[i])) return i;
    }
    return -1;
  }, [isStatusMessage, messages]);

  const renderItems = useMemo(() => {
    const items: Array<
      | { kind: 'message'; message: Message }
      | { kind: 'statusGroup'; messages: Message[] }
    > = [];
    let currentGroup: Message[] | null = null;
    for (const message of messages) {
      if (isStatusMessage(message)) {
        if (!currentGroup) {
          currentGroup = [];
          items.push({ kind: 'statusGroup', messages: currentGroup });
        }
        currentGroup.push(message);
      } else {
        currentGroup = null;
        items.push({ kind: 'message', message });
      }
    }
    return items;
  }, [isStatusMessage, messages]);

  const getStatusStyle = useCallback((mode?: Message['mode']) => {
    const base =
      'text-slate-500 dark:text-slate-400 font-mono text-[11px] leading-snug tracking-tight';
    const accent = (() => {
      switch (mode) {
        case 'build':
          return '';
        case 'chat':
          return '';
        case 'fix':
          return '';
        case 'analyze':
          return '';
        case 'system':
          return '';
        default:
          return '';
      }
    })();
    return `${base} ${accent}`;
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
      const intentMessage = preview.messages.find((message) => /^Intent:\s*/i.test(message.content.trim()));
      const resolvedIntent = intentMessage
        ? intentMessage.content.replace(/^Intent:\s*/i, '').trim()
        : intentText?.trim();
      onSetPromptPreview(
        mode,
        title,
        redacted,
        raw,
        tokenCounts,
        preview.systemPrompt,
        preview.systemPromptRedacted,
        preview.language,
        resolvedIntent
      );
    } catch (error: unknown) {
      if (requestId !== previewRequestRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      const errorText = `Error: ${message}`;
      onSetPromptPreview(mode, title, errorText, errorText);
    }
  }, [formatRequestPreview, intentText, onPreviewPrompt, onSetPromptPreview]);

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

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
        <ChatProjects
          projects={projects}
          activeProjectId={activeProjectId}
          onNewProject={onNewProject}
          onOpenProject={onOpenProject}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
          onUndoDeleteProject={onUndoDeleteProject}
          onPreviewProjectSnapshot={onPreviewProjectSnapshot}
          onClearProjectPreview={onClearProjectPreview}
          deleteUndoMs={deleteUndoMs}
          diagramType={diagramType}
          onDiagramTypeChange={onDiagramTypeChange}
          detectedDiagramType={detectedDiagramType}
          notebookBuildCount={notebookBuildCount}
          onNotebookBuildCountChange={onNotebookBuildCountChange}
        />

      {isNotebookChatMode && onBackToNotebookMainChat && (
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>Чат диаграммы</span>
          <button
            type="button"
            onClick={onBackToNotebookMainChat}
            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeft size={12} />
            Назад в основной чат
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={onMessagesScroll} className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm text-center px-4">
             <MessageSquare size={32} className="mb-2 opacity-50" />
             <p>Describe your system or process here.</p>
             <p className="text-xs mt-1">"User logs in, then checks balance..."</p>
          </div>
        ) : (
          <>
            {renderItems.map((item, index) => {
              if (item.kind === 'statusGroup') {
                const isLatestGroup = index === renderItems.length - 1;
                return (
                  <ChatStatusGroup
                    key={`status-${index}`}
                    messages={item.messages}
                    isProcessing={isProcessing}
                    isLatestGroup={isLatestGroup}
                    onOpenNotebookBlock={onOpenNotebookBlock}
                  />
                );
              }

              const msg = item.message;
              const isErrorMessage =
                msg.role === 'assistant' &&
                /^(Error|Build failed|Analysis failed|Fix failed|Generation failed|Error generating diagram|Error analyzing diagram)(?:\s*\(.*?\))?:/.test(msg.content);
              const notebookBuildMeta = parseNotebookBuildMessage(msg);
              const isStatus = isStatusMessage(msg);
              const statusStyle = isStatus ? getStatusStyle(msg.mode) : '';
              const messageText = notebookBuildMeta ? notebookBuildMeta.text : msg.content;
              const isMarkdown = shouldRenderMarkdown(msg, isStatus);
              const isLatest = msg.id === messages[messages.length - 1]?.id;
              const isLatestStatus = isStatus && messages[lastStatusIndex]?.id === msg.id;
              const maxWidthClass = 'max-w-full';
              const paddingClass = msg.role === 'user' ? 'px-0 py-0' : 'px-0 py-0';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`${maxWidthClass} ${isStatus ? 'px-0 py-0' : paddingClass} rounded-md text-sm whitespace-pre-wrap break-words ${
                      msg.role === 'user'
                        ? 'bg-slate-200/10 dark:bg-slate-100/5 border border-slate-200/10 dark:border-white/5 text-slate-200 dark:text-slate-200 rounded-full shadow-none px-3 py-1'
                        : isErrorMessage
                          ? 'bg-transparent text-red-700 dark:text-red-200 rounded-none shadow-none font-mono text-[12px] leading-relaxed'
                          : isStatus
                            ? `${statusStyle} rounded-none ${isLatestStatus ? 'text-slate-700 dark:text-slate-200' : ''}`
                            : `bg-transparent border-0 shadow-none text-slate-900 dark:text-slate-100 rounded-none ${isLatest ? 'text-slate-950 dark:text-white' : ''}`
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 whitespace-pre-wrap break-words">
                        {isMarkdown ? (
                          <ChatMarkdownTabs rawText={messageText} isLatest={isLatest} />
                        ) : (
                          messageText
                        )}
                      </div>
                      {notebookBuildMeta && typeof onOpenNotebookBlock === 'function' && (
                        <button
                          type="button"
                          onClick={() => onOpenNotebookBlock?.(notebookBuildMeta.blockIndex)}
                          className="shrink-0 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200"
                          title="Open diagram"
                        >
                          <ArrowUpRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="sr-only">
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
                className={`px-2.5 py-1.5 text-xs rounded-md disabled:opacity-80 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
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
                className={`px-2.5 py-1.5 text-xs rounded-md disabled:opacity-80 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  (!input.trim() && !hasIntent) || isProcessing
                    ? MODE_BUTTON_DISABLED
                    : MODE_UI.build.button
                }`}
                title={input.trim() ? 'Build notebook from this prompt' : 'Build notebook from intent'}
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
