type FrontmatterRange = {
  start: number;
  end: number;
};

const getLeadingWhitespace = (value: string): string => {
  return value.match(/^\s*/)?.[0] ?? '';
};

const stripInlineComment = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) return trimmed;
  const match = value.match(/^(.*?)\s+#/);
  return (match ? match[1] : value).trim();
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

const formatYamlScalar = (value: string | number | boolean): string => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  // Keep hex colors and most tokens stable by quoting strings.
  return `'${String(value).replace(/'/g, "''")}'`;
};

const updateConfigObjectBlock = (
  lines: string[],
  key: string,
  value: Record<string, string | number | boolean> | null
): { lines: string[] } => {
  const configIndex = lines.findIndex((line) => /^\s*config\s*:\s*$/.test(line));
  if (configIndex === -1) {
    if (value === null) return { lines };
    const entryLines = Object.entries(value).map(([k, v]) => `    ${k}: ${formatYamlScalar(v)}`);
    return {
      lines: [...lines, 'config:', `  ${key}:`, ...entryLines],
    };
  }

  const configLine = lines[configIndex] ?? '';
  const configIndent = getLeadingWhitespace(configLine);
  const configIndentLength = configIndent.length;

  let configBlockEnd = configIndex + 1;
  while (configBlockEnd < lines.length) {
    const line = lines[configBlockEnd] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (trimmed.length > 0 && indentLength <= configIndentLength) break;
    configBlockEnd += 1;
  }

  const keyRegex = new RegExp(`^${key}\\s*:\\s*$`);
  const nextLines = lines.slice();

  // Remove existing block.
  for (let i = configIndex + 1; i < configBlockEnd; i += 1) {
    const line = nextLines[i] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (indentLength > configIndentLength && keyRegex.test(trimmed)) {
      const blockIndentLength = indentLength;
      let end = i + 1;
      while (end < configBlockEnd) {
        const nextLine = nextLines[end] ?? '';
        const nextTrimmed = nextLine.trim();
        const nextIndentLength = getLeadingWhitespace(nextLine).length;
        if (nextTrimmed.length > 0 && nextIndentLength <= blockIndentLength) break;
        end += 1;
      }
      nextLines.splice(i, end - i);
      configBlockEnd -= end - i;
      break;
    }
  }

  if (value === null) return { lines: nextLines };

  const keyIndent = `${configIndent}  `;
  const childIndent = `${configIndent}    `;
  const sortedEntries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const blockLines = [
    `${keyIndent}${key}:`,
    ...sortedEntries.map(([k, v]) => `${childIndent}${k}: ${formatYamlScalar(v)}`),
  ];

  // Insert at end of config block, before trailing blanks.
  let insertIndex = configBlockEnd;
  while (insertIndex > configIndex + 1 && (nextLines[insertIndex - 1]?.trim() ?? '') === '') {
    insertIndex -= 1;
  }
  nextLines.splice(insertIndex, 0, ...blockLines);
  return { lines: nextLines };
};

const stripEmptyConfigBlock = (lines: string[]): string[] => {
  const configIndex = lines.findIndex((line) => /^\s*config\s*:\s*$/.test(line));
  if (configIndex === -1) return lines;

  const configLine = lines[configIndex] ?? '';
  const configIndentLength = getLeadingWhitespace(configLine).length;

  let configBlockEnd = configIndex + 1;
  while (configBlockEnd < lines.length) {
    const line = lines[configBlockEnd] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (trimmed.length > 0 && indentLength <= configIndentLength) break;
    configBlockEnd += 1;
  }

  const hasEntries = lines
    .slice(configIndex + 1, configBlockEnd)
    .some((line) => line.trim().length > 0);
  if (hasEntries) return lines;

  return [...lines.slice(0, configIndex), ...lines.slice(configBlockEnd)];
};

export const extractFrontmatterThemeVariables = (
  code: string
): Record<string, string | number | boolean> | null => {
  const lines = code.split(/\r?\n/);
  const range = findFrontmatterRange(lines);
  if (!range) return null;

  const frontmatterLines = lines.slice(range.start + 1, range.end);
  const configIndex = frontmatterLines.findIndex((line) => /^\s*config\s*:\s*$/.test(line));
  if (configIndex === -1) return null;

  const configLine = frontmatterLines[configIndex] ?? '';
  const configIndentLength = getLeadingWhitespace(configLine).length;

  let configBlockEnd = configIndex + 1;
  while (configBlockEnd < frontmatterLines.length) {
    const line = frontmatterLines[configBlockEnd] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (trimmed.length > 0 && indentLength <= configIndentLength) break;
    configBlockEnd += 1;
  }

  let themeVarsIndex: number | null = null;
  let themeVarsIndentLength = 0;
  for (let i = configIndex + 1; i < configBlockEnd; i += 1) {
    const line = frontmatterLines[i] ?? '';
    const trimmed = line.trim();
    const indentLength = getLeadingWhitespace(line).length;
    if (indentLength > configIndentLength && /^themeVariables\s*:\s*$/.test(trimmed)) {
      themeVarsIndex = i;
      themeVarsIndentLength = indentLength;
      break;
    }
  }
  if (themeVarsIndex === null) return null;

  const vars: Record<string, string | number | boolean> = {};
  for (let i = themeVarsIndex + 1; i < configBlockEnd; i += 1) {
    const line = frontmatterLines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) continue;
    const indentLength = getLeadingWhitespace(line).length;
    if (indentLength <= themeVarsIndentLength) break;
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)?$/);
    if (!match?.[1]) continue;
    const raw = stripInlineComment(match[2] ?? '');
    const token = stripQuotes(raw);
    if (!token) continue;
    if (token === 'true') vars[match[1]] = true;
    else if (token === 'false') vars[match[1]] = false;
    else if (/^-?\d+(\.\d+)?$/.test(token)) vars[match[1]] = Number(token);
    else vars[match[1]] = token;
  }

  return Object.keys(vars).length ? vars : null;
};

export const setFrontmatterThemeVariables = (
  code: string,
  variables: Record<string, string | number | boolean> | null
): string => {
  const lines = code.split(/\r?\n/);
  const range = findFrontmatterRange(lines);
  if (!range) {
    if (variables === null) return code;
    let leadingBlankCount = 0;
    while (leadingBlankCount < lines.length && (lines[leadingBlankCount]?.trim() ?? '') === '') {
      leadingBlankCount += 1;
    }
    const leadingBlank = lines.slice(0, leadingBlankCount);
    const rest = lines.slice(leadingBlankCount);
    const inner = updateConfigObjectBlock([], 'themeVariables', variables).lines;
    const frontmatter = ['---', ...inner, '---'];
    return [...frontmatter, ...leadingBlank, ...rest].join('\n');
  }

  const frontmatterLines = lines.slice(range.start + 1, range.end);
  const updatedRaw = updateConfigObjectBlock(frontmatterLines, 'themeVariables', variables);
  const updated = { lines: stripEmptyConfigBlock(updatedRaw.lines) };
  const hasContent = updated.lines.some((line) => line.trim().length > 0);
  if (!hasContent) {
    const nextLines = [...lines.slice(0, range.start), ...lines.slice(range.end + 1)];
    return nextLines.join('\n');
  }
  const nextLines = [...lines.slice(0, range.start + 1), ...updated.lines, ...lines.slice(range.end)];
  return nextLines.join('\n');
};

export const removeFrontmatterThemeVariables = (code: string): string => {
  return setFrontmatterThemeVariables(code, null);
};
