import React from "react";
import { Button } from "../ui/Button";
import type { DocsMode } from "../../types";
import type { OperationLogTextRow } from "./operationLogUtils";
import OperationLogTooltip from "./OperationLogTooltip";
import { PROMPTS_VIRTUAL_SYSTEM_PATH } from "../../utils/promptsVirtualPaths";

type Props = {
  row: OperationLogTextRow;
  pinnedTooltip: string | null;
  setPinnedTooltip: React.Dispatch<React.SetStateAction<string | null>>;
  onOpenBuildDocsFile?: (
    fileName: string,
    mode: DocsMode,
    options?: { blockIndex?: number | null },
  ) => void;
};

const normalizeFileLabel = (value: string) => {
  const trimmed = value.trim();
  const withoutSize = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return withoutSize || trimmed;
};

const resolveDocsMode = (row: OperationLogTextRow): DocsMode => {
  return row.contextScope === "planner"
    ? "plan"
    : row.contextScope === "chat"
      ? "chat"
      : row.contextScope === "analyze"
        ? "analyze"
        : row.contextScope === "fix"
          ? "fix"
          : row.contextScope === "summary"
            ? "build"
            : "build";
};

const OperationLogRowText: React.FC<Props> = ({
  row,
  pinnedTooltip,
  setPinnedTooltip,
  onOpenBuildDocsFile,
}) => {
  const docsMode = resolveDocsMode(row);
  const problemLines = row.text.includes("\n") ? row.text.split("\n") : [];
  const hasProblemIndex = problemLines.some((line) =>
    /^#\d+\s*\(line\s+\d+\)/i.test(line),
  );
  const hasBeforeAfter =
    problemLines.some((line) => /^(Before|До):/i.test(line)) &&
    problemLines.some((line) => /^(After|После):/i.test(line));
  const problemMatch = hasProblemIndex && hasBeforeAfter;
  const afterLine = problemMatch
    ? (problemLines.find((line) => /^(After|После):/i.test(line)) ?? "")
    : "";
  const afterValue = afterLine.replace(/^(After|После):\s*/i, "");

  const resolveDiffRange = (before: string, after: string) => {
    if (!before || !after) return null;
    if (before === after) return null;
    const max = Math.min(before.length, after.length);
    let start = 0;
    while (start < max && before[start] === after[start]) start += 1;
    let endBefore = before.length - 1;
    let endAfter = after.length - 1;
    while (
      endBefore >= start &&
      endAfter >= start &&
      before[endBefore] === after[endAfter]
    ) {
      endBefore -= 1;
      endAfter -= 1;
    }
    if (endBefore < start) return null;
    return { start, end: endBefore + 1 };
  };

  const resolveNonAsciiRanges = (value: string) => {
    const ranges: Array<{ start: number; end: number }> = [];
    let currentStart: number | null = null;
    for (let i = 0; i < value.length; i += 1) {
      const isNonAscii = value.charCodeAt(i) > 127;
      if (isNonAscii && currentStart === null) currentStart = i;
      if (!isNonAscii && currentStart !== null) {
        ranges.push({ start: currentStart, end: i });
        currentStart = null;
      }
    }
    if (currentStart !== null)
      ranges.push({ start: currentStart, end: value.length });
    return ranges;
  };

  const renderHighlightedValue = (
    value: string,
    diffRange: { start: number; end: number } | null,
  ) => {
    if (!value) return value;
    const ranges = diffRange ? [diffRange] : [];
    const asciiRanges = resolveNonAsciiRanges(value);
    const merged = [...ranges, ...asciiRanges].sort(
      (a, b) => a.start - b.start,
    );
    if (!merged.length) return value;
    const parts: Array<{ text: string; highlight: boolean }> = [];
    let cursor = 0;
    merged.forEach((range) => {
      if (range.start > cursor) {
        parts.push({
          text: value.slice(cursor, range.start),
          highlight: false,
        });
      }
      parts.push({
        text: value.slice(range.start, range.end),
        highlight: true,
      });
      cursor = Math.max(cursor, range.end);
    });
    if (cursor < value.length) {
      parts.push({ text: value.slice(cursor), highlight: false });
    }
    return (
      <>
        {parts.map((part, index) => (
          <span
            key={`hl-${index}`}
            className={part.highlight ? "px-0.5 rounded-sm" : ""}
            style={
              part.highlight
                ? {
                    backgroundColor: "rgba(245, 158, 11, 0.35)",
                    borderBottom: "1px solid rgba(245, 158, 11, 0.7)",
                    paddingBottom: "1px",
                  }
                : undefined
            }
          >
            {part.text}
          </span>
        ))}
      </>
    );
  };

  const renderFileButton = (label: string) => {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-auto px-0 py-0 underline decoration-dotted hover:text-[var(--control-text)]"
        onClick={(eventClick) => {
          if (!onOpenBuildDocsFile) return;
          eventClick.preventDefault();
          eventClick.stopPropagation();
          onOpenBuildDocsFile(normalizeFileLabel(label), docsMode, {
            blockIndex:
              typeof row.blockIndex === "number" ? row.blockIndex : null,
          });
        }}
        title="Открыть в Prompts"
      >
        {label}
      </Button>
    );
  };

  const lines = row.text.split("\n");
  const renderLine = (line: string, index: number) => {
    const trimmedLine = line.trim();
    if (/^prompt$/i.test(trimmedLine) && onOpenBuildDocsFile) {
      return (
        <Button
          key={`line-${index}`}
          type="button"
          variant="ghost"
          className="h-auto px-0 py-0 underline decoration-dotted hover:text-[var(--control-text)]"
          onClick={(eventClick) => {
            eventClick.preventDefault();
            eventClick.stopPropagation();
            onOpenBuildDocsFile(PROMPTS_VIRTUAL_SYSTEM_PATH, docsMode, {
              blockIndex:
                typeof row.blockIndex === "number" ? row.blockIndex : null,
            });
          }}
          title="Открыть system prompt в Prompts"
        >
          {trimmedLine}
        </Button>
      );
    }

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
    if (/^(Before|До):/i.test(line)) {
      const prefixMatch = line.match(/^(Before|До):\s*/i);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const localValue = line.replace(/^(Before|До):\s*/i, "");
      const diff = afterValue ? resolveDiffRange(localValue, afterValue) : null;
      const highlighted = renderHighlightedValue(localValue, diff);
      return (
        <span key={`line-${index}`}>
          {prefix}
          {highlighted}
        </span>
      );
    }
    if (/^(After|После):/i.test(line)) {
      const prefixMatch = line.match(/^(After|После):\s*/i);
      const prefix = prefixMatch ? prefixMatch[0] : "";
      const localValue = line.replace(/^(After|После):\s*/i, "");
      return (
        <span key={`line-${index}`}>
          {prefix}
          {localValue}
        </span>
      );
    }
    const isDocsFileLine =
      /^[A-Za-z0-9_.-]+\.(?:md|mdx)\s*(?:\([^)]*\)\s*)?$/i.test(line.trim());
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
      if (
        row.tooltipMessages &&
        !row.tooltipDocs &&
        !isSelectionLine &&
        !isDocsFileLine
      ) {
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
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    return (
      <span
        key={`line-${index}`}
        className="inline-flex flex-wrap items-center gap-1"
      >
        <span>{prefix}</span>
        <span className="inline-flex flex-wrap items-center gap-1">
          {fileParts.length ? (
            <OperationLogTooltip
              tooltipId={tooltipId}
              content={row.tooltipDocs ?? ""}
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
