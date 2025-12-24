type FrontmatterRange = {
  start: number;
  end: number;
};

const getLeadingWhitespace = (value: string): string => {
  return value.match(/^\s*/)?.[0] ?? '';
};

const stripInlineComment = (value: string): string => {
  const index = value.indexOf('#');
  return (index >= 0 ? value.slice(0, index) : value).trim();
};

const stripQuotes = (value: string): string => {
  return value.replace(/^['"]|['"]$/g, '').trim();
};

const findFrontmatterRange = (lines: string[]): FrontmatterRange | null => {
  let index = 0;
  while (index < lines.length && (lines[index]?.trim() ?? '') === '') index += 1;
  if ((lines[index]?.trim() ?? '') !== '---') return null;

  const start = index;
  index += 1;
  while (index < lines.length) {
    if ((lines[index]?.trim() ?? '') === '---') {
      return { start, end: index };
    }
    index += 1;
  }
  return null;
};

const updateConfigBlock = (
  lines: string[],
  key: string,
  value: string | null
): { lines: string[]; previousValue: string | null } => {
  const configIndex = lines.findIndex((line) => /^\s*config\s*:\s*$/.test(line));
  if (configIndex === -1) {
    if (value === null) return { lines, previousValue: null };
    return {
      lines: [...lines, 'config:', `  ${key}: ${value}`],
      previousValue: null,
    };
  }

  const configLine = lines[configIndex] ?? '';
  const configIndent = getLeadingWhitespace(configLine);
  const configIndentLength = configIndent.length;

  let blockEnd = configIndex + 1;
  while (blockEnd < lines.length) {
    const line = lines[blockEnd] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (trimmed.length > 0 && indentLength <= configIndentLength) break;
    blockEnd += 1;
  }

  const blockLines = lines.slice(configIndex + 1, blockEnd);
  let previousValue: string | null = null;

  const entryIndent = (() => {
    for (const line of blockLines) {
      if (line.trim().length === 0) continue;
      const indent = getLeadingWhitespace(line);
      if (indent.length > configIndentLength) return indent;
    }
    return `${configIndent}  `;
  })();

  const keyRegex = new RegExp(`^${key}\\s*:\\s*(.+)?$`);
  const nextBlockLines: string[] = [];
  for (const line of blockLines) {
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (indentLength > configIndentLength) {
      const match = trimmed.match(keyRegex);
      if (match) {
        const raw = stripInlineComment(match[1] ?? '');
        const normalized = stripQuotes(raw);
        if (normalized && !previousValue) previousValue = normalized;
        continue;
      }
    }
    nextBlockLines.push(line);
  }

  if (value !== null) {
    const entryLine = `${entryIndent}${key}: ${value}`;
    let insertIndex = nextBlockLines.length;
    while (insertIndex > 0 && nextBlockLines[insertIndex - 1]?.trim() === '') {
      insertIndex -= 1;
    }
    nextBlockLines.splice(insertIndex, 0, entryLine);
  }

  const hasEntries = nextBlockLines.some((line) => line.trim().length > 0);
  if (!hasEntries) {
    return {
      lines: [...lines.slice(0, configIndex), ...lines.slice(blockEnd)],
      previousValue,
    };
  }

  return {
    lines: [
      ...lines.slice(0, configIndex + 1),
      ...nextBlockLines,
      ...lines.slice(blockEnd),
    ],
    previousValue,
  };
};

export const updateFrontmatterConfigKey = (
  code: string,
  key: string,
  value: string | null
): { code: string; previousValue: string | null } => {
  const lines = code.split(/\r?\n/);
  const range = findFrontmatterRange(lines);
  if (!range) {
    if (value === null) return { code, previousValue: null };
    let leadingBlankCount = 0;
    while (leadingBlankCount < lines.length && (lines[leadingBlankCount]?.trim() ?? '') === '') {
      leadingBlankCount += 1;
    }
    const leadingBlank = lines.slice(0, leadingBlankCount);
    const rest = lines.slice(leadingBlankCount);
    const frontmatter = ['---', 'config:', `  ${key}: ${value}`, '---'];
    return {
      code: [...frontmatter, ...leadingBlank, ...rest].join('\n'),
      previousValue: null,
    };
  }

  const frontmatterLines = lines.slice(range.start + 1, range.end);
  const update = updateConfigBlock(frontmatterLines, key, value);
  const hasContent = update.lines.some((line) => line.trim().length > 0);
  if (!hasContent) {
    const nextLines = [...lines.slice(0, range.start), ...lines.slice(range.end + 1)];
    return { code: nextLines.join('\n'), previousValue: update.previousValue };
  }

  const nextLines = [...lines.slice(0, range.start + 1), ...update.lines, ...lines.slice(range.end)];

  return { code: nextLines.join('\n'), previousValue: update.previousValue };
};

export const extractFrontmatterConfigValue = (
  code: string,
  key: string
): string | null => {
  const lines = code.split(/\r?\n/);
  const range = findFrontmatterRange(lines);
  if (!range) return null;
  const frontmatterLines = lines.slice(range.start + 1, range.end);
  const update = updateConfigBlock(frontmatterLines, key, null);
  return update.previousValue;
};

export const removeFrontmatterConfigKey = (
  code: string,
  key: string
): { code: string; previousValue: string | null } => {
  return updateFrontmatterConfigKey(code, key, null);
};
