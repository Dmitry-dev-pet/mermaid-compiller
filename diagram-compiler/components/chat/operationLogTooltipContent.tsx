import React from 'react';
import { DIAGRAM_TYPES } from '../../utils/diagramTypes';

const buildDiagramTypeRegex = () => {
  const escaped = (DIAGRAM_TYPES as readonly string[])
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
};

const DIAGRAM_TYPE_RE = buildDiagramTypeRegex();

const renderHighlightedDiagramTypes = (line: string) => {
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
  return (
    <>
      {lines.map((line, index) => {
        if (line.trim().length === 0) {
          return <div key={`line-${index}`} className="h-3" />;
        }
        const selectionMatch = line.match(/^\s*selection\s*:\s*(.+)\s*$/i);
        if (selectionMatch) {
          return (
            <div key={`line-${index}`} className="whitespace-pre-wrap">
              <span className="text-[var(--control-muted-text)]">selection:</span>{' '}
              <span className="font-mono text-[11px] text-blue-600 dark:text-blue-300">
                {selectionMatch[1]}
              </span>
            </div>
          );
        }
        return (
          <div key={`line-${index}`} className="whitespace-pre-wrap">
            {renderHighlightedDiagramTypes(line)}
          </div>
        );
      })}
    </>
  );
};

export default OperationLogTooltipContent;
