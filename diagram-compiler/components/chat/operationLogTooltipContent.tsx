import React from 'react';
import { DIAGRAM_TYPES } from '../../utils/diagramTypes';

type Section = 'system' | 'messages' | 'docs' | 'other';
type RenderItem =
  | { kind: 'spacer'; key: string }
  | { kind: 'header'; key: string; text: string; section: Section }
  | { kind: 'line'; key: string; text: string; section: Section }
  | { kind: 'selection'; key: string; value: string; section: Section };

const buildDiagramTypeRegex = () => {
  const escaped = (DIAGRAM_TYPES as readonly string[])
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
};

const DIAGRAM_TYPE_RE = buildDiagramTypeRegex();

const renderHighlightedDiagramTypes = (line: string) => {
  DIAGRAM_TYPE_RE.lastIndex = 0;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = DIAGRAM_TYPE_RE.exec(line))) {
    const start = match.index ?? 0;
    const end = start + (match[0]?.length ?? 0);
    if (start > lastIndex) parts.push(line.slice(lastIndex, start));
    parts.push(
      <span
        key={`dt-${start}`}
        className="font-mono text-[11px] text-blue-600 dark:text-blue-300"
      >
        {line.slice(start, end)}
      </span>
    );
    lastIndex = end;
  }
  if (lastIndex < line.length) parts.push(line.slice(lastIndex));
  return parts.length ? parts : line;
};

export const OperationLogTooltipContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split(/\r?\n/);
  const items: RenderItem[] = [];
  let section: Section = 'other';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const key = `line-${index}`;

    if (line.trim().length === 0) {
      items.push({ kind: 'spacer', key });
      continue;
    }

    const sectionHeaderMatch = line.match(/^(System prompt|Messages|Docs):\s*$/i);
    if (sectionHeaderMatch) {
      const header = sectionHeaderMatch[1]?.toLowerCase() ?? '';
      section = header === 'system prompt'
        ? 'system'
        : header === 'messages'
          ? 'messages'
          : header === 'docs'
            ? 'docs'
            : 'other';
      items.push({ kind: 'header', key, text: line, section });
      continue;
    }

    const selectionMatch = line.match(/^\s*selection\s*:\s*(.+)\s*$/i);
    if (selectionMatch) {
      items.push({ kind: 'selection', key, value: selectionMatch[1] ?? '', section });
      continue;
    }

    items.push({ kind: 'line', key, text: line, section });
  }

  return (
    <>
      {items.map((item) => {
        if (item.kind === 'spacer') {
          return <div key={item.key} className="h-3" />;
        }
        if (item.kind === 'header') {
          return (
            <div
              key={item.key}
              className="uppercase tracking-wide text-[10px] text-[var(--control-muted-text)]"
            >
              {item.text}
            </div>
          );
        }
        if (item.kind === 'selection') {
          return (
            <div key={item.key} className="whitespace-pre-wrap">
              <span className="text-[var(--control-muted-text)]">selection:</span>{' '}
              <span className="font-mono text-[11px] text-blue-600 dark:text-blue-300">
                {item.value}
              </span>
            </div>
          );
        }
        return (
          <div key={item.key} className="whitespace-pre-wrap">
            {item.section === 'system' ? renderHighlightedDiagramTypes(item.text) : item.text}
          </div>
        );
      })}
    </>
  );
};

export default OperationLogTooltipContent;
