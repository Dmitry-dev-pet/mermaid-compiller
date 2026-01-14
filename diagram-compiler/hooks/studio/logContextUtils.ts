import type { Message } from '../../types';
import type { OperationEvent, OperationPhase } from '../../types';

type DocsSelectionSummary = {
  includedPaths: string[];
};

export const joinLogDetailLines = (...lines: Array<string | null | undefined>) => {
  return lines
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .join('\n');
};

const estimateTokensFromChars = (chars: number) => {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 4));
};

const formatSize = (value: number) => {
  if (value < 1000) return `${value}`;
  return `${(value / 1000).toFixed(1)}k`;
};

const parseDocsContextSections = (docsContext: string) => {
  const lines = docsContext.split(/\r?\n/);
  const map = new Map<string, number>();
  let currentPath: string | null = null;
  let currentSize = 0;
  const flush = () => {
    if (!currentPath) return;
    map.set(currentPath, currentSize);
  };
  for (const line of lines) {
    const header = line.match(/^---\s+(.+?)\s+---\s*$/);
    if (header) {
      flush();
      currentPath = header[1]?.trim() ?? null;
      currentSize = 0;
      continue;
    }
    if (!currentPath) continue;
    currentSize += line.length + 1; // keep newline contribution stable
  }
  flush();
  return map;
};

export const summarizeMessagesForLog = (messages: Message[]) => {
  const chars = messages.reduce((total, msg) => total + (msg.content?.length ?? 0), 0);
  return { count: messages.length, chars, tokens: estimateTokensFromChars(chars) };
};

const formatMessagesLineForLog = (messages: Message[], count: number) => {
  const ids = new Set(messages.map((msg) => msg.id));
  const hasIntent = ids.has('diagram-intent');
  const hasDiagram = ids.has('diagram-context');
  if (hasIntent) {
    return hasDiagram ? 'intent + diagram' : 'intent';
  }

  const nonDiagramMessages = messages.filter((msg) => msg.id !== 'diagram-context');
  const lastUserIndex = (() => {
    for (let i = nonDiagramMessages.length - 1; i >= 0; i -= 1) {
      if (nonDiagramMessages[i]?.role === 'user') return i;
    }
    return -1;
  })();

  const parts: string[] = [];
  if (lastUserIndex >= 0) {
    parts.push('prompt');
    if (nonDiagramMessages.length > 1) parts.push('history');
  } else if (nonDiagramMessages.length > 0) {
    parts.push('history');
  }
  if (hasDiagram) parts.push('diagram');

  if (parts.length) return parts.join(' + ');
  return `msgs×${count}`;
};

export const formatDocsDetailForLog = (args: {
  docsContext: string;
  selectionSummary?: DocsSelectionSummary | null;
  prefix?: string;
}) => {
  const prefix = args.prefix ?? 'docs';
  const sections = parseDocsContextSections(args.docsContext);
  const selectionPaths = args.selectionSummary?.includedPaths?.length
    ? args.selectionSummary.includedPaths
    : Array.from(sections.keys());

  if (selectionPaths.length === 0) {
    // When no docs are actually selected, treat docs as empty for logging purposes.
    // (This keeps counts consistent and avoids confusing "0 files, N tok" rows.)
    return '';
  }

  const items = selectionPaths.map((path) => {
    const name = path.split('/').pop() || path;
    const chars = sections.get(path) ?? 0;
    return { name, tokens: estimateTokensFromChars(chars) };
  });
  const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);
  const label = selectionPaths.length === 1 ? 'file' : 'files';
  const list = items.map((item) => `${item.name} (${formatSize(item.tokens)})`).join(', ');
  return `${prefix} (${selectionPaths.length} ${label}, ${formatSize(totalTokens)} tok): ${list}`;
};

const summarizeDocsTokensAndNamesForLog = (args: {
  docsContext: string;
  selectionSummary?: DocsSelectionSummary | null;
}) => {
  const sections = parseDocsContextSections(args.docsContext);
  const selectionPaths = args.selectionSummary?.includedPaths?.length
    ? args.selectionSummary.includedPaths
    : Array.from(sections.keys());

  if (selectionPaths.length === 0) {
    return { files: [] as string[], tokens: 0 };
  }

  const items = selectionPaths.map((path) => {
    const name = path.split('/').pop() || path;
    const chars = sections.get(path) ?? 0;
    return { name, tokens: estimateTokensFromChars(chars) };
  });
  const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);
  return { files: items.map((item) => item.name), tokens: totalTokens };
};

export const formatMessageBlockForLog = (message: Message, index: number) => {
  const label = `[${index + 1}] ${message.role}${message.id ? ` (${message.id})` : ''}`;
  return `${label}\n${message.content}`;
};

export const buildContextTooltipForLog = (args: {
  systemPrompt: string;
  messages: Message[];
  docsDetail: string;
}) => {
  const messageBlocks = args.messages.map(formatMessageBlockForLog).join('\n\n');
  const docsBlock = args.docsDetail.trim().length > 0 ? args.docsDetail : '(none)';
  return [
    'System prompt:',
    args.systemPrompt,
    '',
    'Messages:',
    messageBlocks,
    '',
    'Docs:',
    docsBlock,
  ].join('\n');
};

export const buildDocsTooltipForLog = (docsDetail: string) => `Docs:\n${docsDetail.trim().length > 0 ? docsDetail : '(none)'}`;

export const buildContextEventForLog = (args: {
  phase: OperationPhase;
  contextScope: OperationEvent['contextScope'];
  selectionLine?: string;
  systemPrompt: string;
  messages: Message[];
  docsContext: string;
  selectionSummary?: DocsSelectionSummary | null;
  docsPrefix?: string;
}) => {
  const docsDetail = formatDocsDetailForLog({
    docsContext: args.docsContext,
    selectionSummary: args.selectionSummary,
    prefix: args.docsPrefix,
  });
  const msgSummary = summarizeMessagesForLog(args.messages);
  const docsSummary = summarizeDocsTokensAndNamesForLog({
    docsContext: args.docsContext,
    selectionSummary: args.selectionSummary,
  });
  const totalTokens = msgSummary.tokens + docsSummary.tokens;

  const logDocsLines =
    docsSummary.files.length > 0
      ? ['docs:', ...docsSummary.files].join('\n')
      : '';
  const messagesLine = formatMessagesLineForLog(args.messages, msgSummary.count);
  const detail = joinLogDetailLines(
    args.selectionLine,
    messagesLine,
    logDocsLines
  );
  return {
    phase: args.phase,
    level: 'info' as const,
    title: 'Контекст',
    detail,
    metrics: totalTokens > 0 ? { tokens: totalTokens } : undefined,
    tooltipMessages: buildContextTooltipForLog({
      systemPrompt: args.systemPrompt,
      messages: args.messages,
      docsDetail,
    }),
    tooltipDocs: buildDocsTooltipForLog(docsDetail),
    kind: 'context' as const,
    contextScope: args.contextScope,
  };
};
