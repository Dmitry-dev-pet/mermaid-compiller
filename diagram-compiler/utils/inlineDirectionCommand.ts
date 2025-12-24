type MermaidDirection = 'TB' | 'TD' | 'LR' | 'RL' | 'BT';

type ExtractedDirectionCommand = {
  codeWithoutCommand: string;
  direction: MermaidDirection | null;
};

const DIRECTION_COMMAND_RE = /^\s*%%\{\s*direction\s*:\s*(TB|TD|LR|RL|BT)\s*\}%%\s*$/i;

const normalizeDirection = (raw: string): MermaidDirection | null => {
  const token = raw.trim().toUpperCase();
  if (token === 'TB') return 'TB';
  if (token === 'TD') return 'TD';
  if (token === 'LR') return 'LR';
  if (token === 'RL') return 'RL';
  if (token === 'BT') return 'BT';
  return null;
};

export const extractInlineDirectionCommand = (code: string): ExtractedDirectionCommand => {
  const lines = code.split(/\r?\n/);
  const kept: string[] = [];

  let foundDirection: MermaidDirection | null = null;
  let index = 0;
  let consumedFrontmatter = false;

  // Only scan leading directives region (same rule as other Mermaid directives).
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      kept.push(line);
      index += 1;
      continue;
    }

    if (!consumedFrontmatter && trimmed === '---') {
      kept.push(line);
      index += 1;
      while (index < lines.length) {
        kept.push(lines[index] ?? '');
        if ((lines[index]?.trim() ?? '') === '---') {
          index += 1;
          break;
        }
        index += 1;
      }
      consumedFrontmatter = true;
      continue;
    }

    const match = trimmed.match(DIRECTION_COMMAND_RE);
    if (match?.[1]) {
      const nextDirection = normalizeDirection(match[1]);
      if (nextDirection) foundDirection = nextDirection;
      index += 1;
      continue;
    }

    if (!trimmed.startsWith('%%{')) break;

    // Keep any other directive as-is.
    kept.push(line);
    while (index < lines.length && !(lines[index] ?? '').includes('}%%')) {
      index += 1;
      if (index < lines.length) kept.push(lines[index] ?? '');
    }
    index += 1;
  }

  const codeWithoutCommand = [...kept, ...lines.slice(index)].join('\n');
  const detected = foundDirection ?? detectDirectionFromBody(codeWithoutCommand);
  const normalized = normalizeDirectionForCode(codeWithoutCommand, detected);

  return { codeWithoutCommand, direction: normalized };
};

export const setInlineDirectionCommand = (code: string, direction: MermaidDirection | null): string => {
  const extracted = extractInlineDirectionCommand(code);
  const lines = extracted.codeWithoutCommand.split(/\r?\n/);
  const i = findDiagramHeaderIndex(lines);

  if (i >= lines.length) return extracted.codeWithoutCommand;

  const header = lines[i] ?? '';

  if (isFlowchartHeader(header)) {
    lines[i] = direction ? rewriteFlowchartHeaderDirection(header, direction) : stripFlowchartHeaderDirection(header);
    return lines.join('\n');
  }

  if (!supportsDirectionStatement(header)) return extracted.codeWithoutCommand;

  const normalizedDirection = direction ? normalizeDirectionForStatement(direction) : null;
  const dirLine = normalizedDirection ? `  direction ${normalizedDirection}` : '';

  let j = i + 1;
  while (j < lines.length) {
    const trimmed = (lines[j]?.trim() ?? '');
    if (trimmed.length === 0 || trimmed.startsWith('%%')) {
      j += 1;
      continue;
    }
    break;
  }

  if (j < lines.length && (lines[j]?.trim() ?? '').toLowerCase().startsWith('direction ')) {
    if (normalizedDirection) {
      lines[j] = dirLine;
    } else {
      lines.splice(j, 1);
    }
  } else if (normalizedDirection) {
    lines.splice(i + 1, 0, dirLine);
  }

  return lines.join('\n');
};

const findDiagramHeaderIndex = (lines: string[]): number => {
  let index = 0;
  let consumedFrontmatter = false;

  while (index < lines.length) {
    const trimmed = (lines[index]?.trim() ?? '');
    if (trimmed.length === 0) {
      index += 1;
      continue;
    }

    if (!consumedFrontmatter && trimmed === '---') {
      index += 1;
      while (index < lines.length) {
        if ((lines[index]?.trim() ?? '') === '---') {
          index += 1;
          break;
        }
        index += 1;
      }
      consumedFrontmatter = true;
      continue;
    }

    if (!trimmed.startsWith('%%{')) return index;

    // Skip multi-line directives (and keep scanning).
    while (index < lines.length && !(lines[index] ?? '').includes('}%%')) {
      index += 1;
    }
    if (index < lines.length) index += 1;
  }

  return index;
};

const supportsDirectionStatement = (headerLine: string): boolean => {
  const head = headerLine.trim();
  return (
    head === 'classDiagram' ||
    head === 'stateDiagram' ||
    head === 'stateDiagram-v2' ||
    head === 'erDiagram' ||
    head === 'requirementDiagram'
  );
};

const normalizeDirectionForStatement = (direction: MermaidDirection): MermaidDirection => {
  return direction === 'TD' ? 'TB' : direction;
};

const isFlowchartHeader = (headerLine: string): boolean => {
  const head = headerLine.trim();
  return head === 'flowchart' || head.startsWith('flowchart ') || head === 'graph' || head.startsWith('graph ');
};

const stripFlowchartHeaderDirection = (headerLine: string): string => {
  const leadingWhitespace = headerLine.match(/^\s*/)?.[0] ?? '';
  const tokens = headerLine.trim().split(/\s+/);
  const keyword = tokens[0]?.toLowerCase();
  if (keyword !== 'flowchart' && keyword !== 'graph') return headerLine;

  const second = tokens[1]?.toUpperCase() ?? '';
  const isOrientation = second === 'TB' || second === 'TD' || second === 'LR' || second === 'RL' || second === 'BT';
  const next = isOrientation ? [tokens[0] ?? 'flowchart', ...tokens.slice(2)] : tokens;

  return `${leadingWhitespace}${next.join(' ')}`.trimEnd();
};

const rewriteFlowchartHeaderDirection = (headerLine: string, direction: MermaidDirection): string => {
  const leadingWhitespace = headerLine.match(/^\s*/)?.[0] ?? '';
  const tokens = headerLine.trim().split(/\s+/);
  const keyword = tokens[0]?.toLowerCase();
  if (keyword !== 'flowchart' && keyword !== 'graph') return headerLine;

  const next: string[] = [tokens[0] ?? 'flowchart'];
  const second = tokens[1]?.toUpperCase() ?? '';
  const isOrientation = second === 'TB' || second === 'TD' || second === 'LR' || second === 'RL' || second === 'BT';

  if (isOrientation) {
    next.push(direction);
    next.push(...tokens.slice(2));
  } else {
    next.push(direction);
    next.push(...tokens.slice(1));
  }

  return `${leadingWhitespace}${next.join(' ')}`.trimEnd();
};

const detectDirectionFromBody = (code: string): MermaidDirection | null => {
  const lines = code.split(/\r?\n/);
  const i = findDiagramHeaderIndex(lines);
  if (i >= lines.length) return null;

  const header = lines[i] ?? '';
  if (isFlowchartHeader(header)) {
    const tokens = header.trim().split(/\s+/);
    const token = tokens[1] ?? '';
    return normalizeDirection(token) ?? null;
  }

  if (!supportsDirectionStatement(header)) return null;

  let j = i + 1;
  while (j < lines.length) {
    const trimmed = (lines[j]?.trim() ?? '');
    if (trimmed.length === 0 || trimmed.startsWith('%%')) {
      j += 1;
      continue;
    }
    if (trimmed.toLowerCase().startsWith('direction ')) {
      const token = trimmed.split(/\s+/)[1] ?? '';
      const normalized = normalizeDirection(token);
      return normalized ? normalizeDirectionForStatement(normalized) : null;
    }
    break;
  }

  return null;
};

const normalizeDirectionForCode = (code: string, direction: MermaidDirection | null): MermaidDirection | null => {
  if (!direction) return null;
  const lines = code.split(/\r?\n/);
  const i = findDiagramHeaderIndex(lines);
  if (i >= lines.length) return direction;

  const header = lines[i] ?? '';
  if (isFlowchartHeader(header)) return direction;
  if (supportsDirectionStatement(header)) return normalizeDirectionForStatement(direction);
  return direction;
};

export const applyInlineDirectionCommand = (
  code: string,
): { code: string; direction: MermaidDirection | null } => {
  const extracted = extractInlineDirectionCommand(code);
  if (!extracted.direction) return { code, direction: null };

  const lines = extracted.codeWithoutCommand.split(/\r?\n/);
  const i = findDiagramHeaderIndex(lines);

  if (i >= lines.length) return { code: extracted.codeWithoutCommand, direction: extracted.direction };

  const header = lines[i] ?? '';
  if (isFlowchartHeader(header)) {
    lines[i] = rewriteFlowchartHeaderDirection(header, extracted.direction);
    return { code: lines.join('\n'), direction: extracted.direction };
  }

  if (!supportsDirectionStatement(header)) return { code: extracted.codeWithoutCommand, direction: extracted.direction };

  const normalizedDirection = normalizeDirectionForStatement(extracted.direction);
  const dirLine = `  direction ${normalizedDirection}`;

  // Find first non-empty line after header.
  let j = i + 1;
  while (j < lines.length && (lines[j]?.trim() ?? '') === '') j += 1;

  if (j < lines.length && (lines[j]?.trim() ?? '').toLowerCase().startsWith('direction ')) {
    lines[j] = dirLine;
  } else {
    lines.splice(i + 1, 0, dirLine);
  }

  return { code: lines.join('\n'), direction: normalizedDirection };
};

export type { MermaidDirection };
