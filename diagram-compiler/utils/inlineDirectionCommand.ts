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

  // Only scan leading directives region (same rule as other Mermaid directives).
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      kept.push(line);
      index += 1;
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

  return { codeWithoutCommand: [...kept, ...lines.slice(index)].join('\n'), direction: foundDirection };
};

export const setInlineDirectionCommand = (code: string, direction: MermaidDirection | null): string => {
  const extracted = extractInlineDirectionCommand(code);
  if (!direction) return extracted.codeWithoutCommand;

  const lines = extracted.codeWithoutCommand.split(/\r?\n/);
  let insertAt = 0;
  while (insertAt < lines.length && (lines[insertAt]?.trim() ?? '') === '') insertAt += 1;
  return [...lines.slice(0, insertAt), `%%{direction: ${direction}}%%`, ...lines.slice(insertAt)].join('\n');
};

const findDiagramHeaderIndex = (lines: string[]): number => {
  let index = 0;

  while (index < lines.length) {
    const trimmed = (lines[index]?.trim() ?? '');
    if (trimmed.length === 0) {
      index += 1;
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
  return head === 'classDiagram' || head === 'stateDiagram' || head === 'stateDiagram-v2';
};

const isFlowchartHeader = (headerLine: string): boolean => {
  const head = headerLine.trim();
  return head === 'flowchart' || head.startsWith('flowchart ') || head === 'graph' || head.startsWith('graph ');
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

  const dirLine = `  direction ${extracted.direction}`;

  // Find first non-empty line after header.
  let j = i + 1;
  while (j < lines.length && (lines[j]?.trim() ?? '') === '') j += 1;

  if (j < lines.length && (lines[j]?.trim() ?? '').toLowerCase().startsWith('direction ')) {
    lines[j] = dirLine;
  } else {
    lines.splice(i + 1, 0, dirLine);
  }

  return { code: lines.join('\n'), direction: extracted.direction };
};

export type { MermaidDirection };
