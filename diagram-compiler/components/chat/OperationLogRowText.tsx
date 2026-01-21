import React from 'react';
import type { DocsMode } from '../../types';
import type { OperationLogTextRow } from './operationLogUtils';
import OperationLogTooltip from './OperationLogTooltip';

type Props = {
  row: OperationLogTextRow;
  pinnedTooltip: string | null;
  setPinnedTooltip: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenBuildDocsFile?: (fileName: string, mode: DocsMode, options?: { blockIndex?: number | null }) => void;
};

const normalizeFileLabel = (value: string) => {
  const trimmed = value.trim();
  const withoutSize = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return withoutSize || trimmed;
};

const resolveDocsMode = (row: OperationLogTextRow): DocsMode => {
  return row.contextScope === 'planner'
    ? 'plan'
    : row.contextScope === 'chat'
      ? 'chat'
      : row.contextScope === 'analyze'
        ? 'analyze'
        : row.contextScope === 'fix'
          ? 'fix'
          : row.contextScope === 'summary'
            ? 'build'
          : 'build';
};

const OperationLogRowText: React.FC<Props> = ({
  row,
  pinnedTooltip,
  setPinnedTooltip,
  onOpenBuildDocsFile,
}) => {
  const docsMode = resolveDocsMode(row);

  const renderFileButton = (label: string) => {
    return (
      <button
        type="button"
        className="underline decoration-dotted hover:text-[var(--control-text)]"
        onClick={(eventClick) => {
          if (!onOpenBuildDocsFile) return;
          eventClick.preventDefault();
          eventClick.stopPropagation();
          onOpenBuildDocsFile(normalizeFileLabel(label), docsMode, {
            blockIndex: typeof row.blockIndex === 'number' ? row.blockIndex : null,
          });
        }}
        title="Открыть в Prompts"
      >
        {label}
      </button>
    );
  };

  const lines = row.text.split('\n');
  const renderLine = (line: string, index: number) => {
    const messageMatch = row.tooltipMessages
      ? line.match(/^(.*?)(messages:\s.*)$/i)
      : null;
    if (messageMatch && row.tooltipMessages) {
      const [, prefix, messageText] = messageMatch;
      const tooltipId = `${row.id}-messages`;
      return (
        <span key={`line-${index}`} className="inline-flex items-center gap-1">
          {prefix ? <span>{prefix}</span> : null}
          <OperationLogTooltip
            tooltipId={tooltipId}
            content={row.tooltipMessages}
            pinnedTooltip={pinnedTooltip}
            setPinnedTooltip={setPinnedTooltip}
          >
            <span className="underline decoration-dotted">{messageText}</span>
          </OperationLogTooltip>
        </span>
      );
    }

    const isSelectionLine = /^selection:\s*/i.test(line.trim());
    const isDocsFileLine = /^[A-Za-z0-9_.-]+\.(?:md|mdx)\s*(?:\([^)]*\)\s*)?$/i.test(line.trim());
    const docsHeaderMatch = row.tooltipDocs
      ? line.trim().match(/^(.*?\bdocs\b)\s*:\s*$/i)
      : null;
    if (docsHeaderMatch && row.tooltipDocs) {
      const tooltipId = `${row.id}-docs-header`;
      return (
        <OperationLogTooltip
          tooltipId={tooltipId}
          content={row.tooltipDocs}
          pinnedTooltip={pinnedTooltip}
          setPinnedTooltip={setPinnedTooltip}
        >
          <span className="underline decoration-dotted">{line}</span>
        </OperationLogTooltip>
      );
    }

    const docsMatch = line.match(/^(.*?\bdocs\b.*?:\s*)(.+)$/i);
    if (!docsMatch) {
      const trimmed = line.trim();
      if (/^[A-Za-z0-9_.-]+\.(?:md|mdx)\s*$/i.test(trimmed)) {
        return renderFileButton(trimmed);
      }
      if (/^[A-Za-z0-9_.-]+\.(?:md|mdx)\s*\([^)]*\)\s*$/i.test(trimmed)) {
        return renderFileButton(trimmed);
      }
      if (row.tooltipMessages && !row.tooltipDocs && !isSelectionLine && !isDocsFileLine) {
        const tooltipId = `${row.id}-messages`;
        return (
          <OperationLogTooltip
            tooltipId={tooltipId}
            content={row.tooltipMessages}
            pinnedTooltip={pinnedTooltip}
            setPinnedTooltip={setPinnedTooltip}
          >
            <span className="underline decoration-dotted">{line}</span>
          </OperationLogTooltip>
        );
      }
      return <span key={`line-${index}`}>{line}</span>;
    }

    const [, prefix, files] = docsMatch;
    const tooltipId = `${row.id}-docs-${index}`;
    const fileParts = files
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      <span key={`line-${index}`} className="inline-flex flex-wrap items-center gap-1">
        <span>{prefix}</span>
        <span className="inline-flex flex-wrap items-center gap-1">
          {fileParts.length ? (
            <OperationLogTooltip
              tooltipId={tooltipId}
              content={row.tooltipDocs ?? ''}
              pinnedTooltip={pinnedTooltip}
              setPinnedTooltip={setPinnedTooltip}
            >
              <span className="inline-flex flex-wrap items-center gap-1">
                {fileParts.map((part) => (
                  <span key={part}>{renderFileButton(part)}</span>
                ))}
              </span>
            </OperationLogTooltip>
          ) : (
            renderFileButton(files)
          )}
        </span>
      </span>
    );
  };

  return (
    <>
      {lines.map((line, index) => (
        <div key={`line-${index}`} className="whitespace-pre-wrap">
          {renderLine(line, index)}
        </div>
      ))}
    </>
  );
};

export default OperationLogRowText;
