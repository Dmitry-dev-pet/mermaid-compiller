export type FlowchartArrowStyle = 'normal' | 'thick' | 'dotted';
export type FlowchartEdgeEndCap = 'arrow' | 'none' | 'circle' | 'cross';
export type FlowchartEdgeDirection = 'forward' | 'bidirectional';
export type FlowchartEdgeLength = 1 | 2 | 3;

export type FlowchartEdgeStyle = {
  lineStyle: FlowchartArrowStyle | null;
  endCap: FlowchartEdgeEndCap | null;
  direction: FlowchartEdgeDirection | null;
  length: FlowchartEdgeLength | null;
};

export type FlowchartEdgeStyleUpdate = Partial<{
  lineStyle: FlowchartArrowStyle;
  endCap: FlowchartEdgeEndCap;
  direction: FlowchartEdgeDirection;
  length: FlowchartEdgeLength;
}>;

const HEADER_RE = /^(flowchart|graph)\b/i;

const EDGE_OP_RE =
  /(<--+>[ox]|<==+>[ox]|<-\.+->[ox]|--+>[ox]|==+>[ox]|-\.+->[ox]|o--+o|o--+x|x--+o|x--+x|--+[ox]{2}|--+o|--+x|o--+|x--+|<--+>|<==+>|<-\.+->|--+>|==+>|-\.+->|===+|-\.+-|---+)/g;

const MIDDLE_LABEL_RE =
  /(--|==|-\.)\s+([^\n]+?)\s+(--+>[ox]|==+>[ox]|-\.+->[ox]|--+[ox]{2}|--+o|--+x|--+>|==+>|-\.+->|===+|-\.+-|---+)/g;

const isFlowchartDiagram = (code: string): boolean => {
  const lines = code.split(/\r?\n/);
  let index = 0;
  let consumedFrontmatter = false;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

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

    if (!trimmed.startsWith('%%{')) return HEADER_RE.test(trimmed);

    while (index < lines.length && !(lines[index] ?? '').includes('}%%')) {
      index += 1;
    }
    if (index < lines.length) index += 1;
  }

  return false;
};

const clampLevel = (level: number) => Math.max(1, Math.min(10, level));
const clampLength = (level: number): FlowchartEdgeLength => {
  if (level <= 1) return 1;
  if (level === 2) return 2;
  return 3;
};

const parseArrowOpLevel = (op: string): number => {
  if (!op) return 1;
  if (op.startsWith('==')) {
    const eqCount = (op.match(/^=+/) ?? [''])[0].length;
    return clampLevel(eqCount - 1);
  }
  if (op.includes('.')) {
    const dots = (op.match(/\./g) ?? []).length;
    return clampLevel(dots);
  }
  const dashCount = (op.match(/^-+/) ?? [''])[0].length;
  return clampLevel(dashCount - 1);
};

const parseLineOpLevel = (op: string): number => {
  if (!op) return 1;
  if (op.startsWith('==')) {
    const eqCount = (op.match(/^=+/) ?? [''])[0].length;
    return clampLevel(eqCount - 2);
  }
  if (op.includes('.')) {
    const dots = (op.match(/\./g) ?? []).length;
    return clampLevel(dots);
  }
  const dashCount = (op.match(/^-+/) ?? [''])[0].length;
  return clampLevel(dashCount - 2);
};

const parseCapOpLevel = (op: string): number => {
  if (!op) return 1;
  let value = op;
  if (value.startsWith('o') || value.startsWith('x')) value = value.slice(1);
  if (value.endsWith('o') || value.endsWith('x')) value = value.slice(0, -1);
  const dashCount = (value.match(/^-+/) ?? [''])[0].length;
  return clampLevel(dashCount - 1);
};

const parseEdgeOp = (op: string): {
  lineStyle: FlowchartArrowStyle;
  endCap: FlowchartEdgeEndCap;
  direction: FlowchartEdgeDirection;
  length: FlowchartEdgeLength;
} => {
  let direction: FlowchartEdgeDirection = 'forward';
  let token = op;
  if (token.startsWith('<')) {
    direction = 'bidirectional';
    token = token.slice(1);
  }

  const endChar = token.slice(-1);
  const endCap: FlowchartEdgeEndCap =
    endChar === '>' ? 'arrow' : endChar === 'o' ? 'circle' : endChar === 'x' ? 'cross' : 'none';

  if (endCap === 'circle' || endCap === 'cross') {
    const level = parseCapOpLevel(token);
    return { lineStyle: 'normal', endCap, direction: 'forward', length: clampLength(level) };
  }

  if (endCap === 'arrow') {
    const level = parseArrowOpLevel(token);
    const lineStyle: FlowchartArrowStyle =
      token.startsWith('==') ? 'thick' : token.includes('.') ? 'dotted' : 'normal';
    return { lineStyle, endCap, direction, length: clampLength(level) };
  }

  const level = parseLineOpLevel(token);
  const lineStyle: FlowchartArrowStyle =
    token.startsWith('==') ? 'thick' : token.includes('.') ? 'dotted' : 'normal';
  return { lineStyle, endCap, direction: 'forward', length: clampLength(level) };
};

const buildArrowOp = (style: FlowchartArrowStyle, level: number, direction: FlowchartEdgeDirection): string => {
  const clamped = clampLevel(level);
  const prefix = direction === 'bidirectional' ? '<' : '';
  if (style === 'thick') return `${prefix}${'='.repeat(clamped + 1)}>`;
  if (style === 'dotted') return `${prefix}-${'.'.repeat(clamped)}->`;
  return `${prefix}${'-'.repeat(clamped + 1)}>`;
};

const buildLineOp = (style: FlowchartArrowStyle, level: number): string => {
  const clamped = clampLevel(level);
  if (style === 'thick') return `${'='.repeat(clamped + 2)}`;
  if (style === 'dotted') return `-${'.'.repeat(clamped)}-`;
  return `${'-'.repeat(clamped + 2)}`;
};

const buildCapOp = (cap: FlowchartEdgeEndCap, level: number): string => {
  const clamped = clampLevel(level);
  const suffix = cap === 'circle' ? 'o' : 'x';
  return `${'-'.repeat(clamped + 1)}${suffix}`;
};

const buildLeftOp = (style: FlowchartArrowStyle): string => {
  if (style === 'thick') return '==';
  if (style === 'dotted') return '-.';
  return '--';
};

export const extractFlowchartEdgeStyle = (code: string): FlowchartEdgeStyle | null => {
  if (!code.trim()) return null;
  if (!isFlowchartDiagram(code)) return null;

  const lines = code.split(/\r?\n/);
  let index = 0;
  let consumedFrontmatter = false;
  let inDirective = false;
  const seenStyle = new Set<FlowchartArrowStyle>();
  const seenCap = new Set<FlowchartEdgeEndCap>();
  const seenDir = new Set<FlowchartEdgeDirection>();
  const seenLength = new Set<FlowchartEdgeLength>();

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

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

    if (!inDirective && trimmed.startsWith('%%{')) {
      inDirective = true;
    }
    if (inDirective) {
      if (line.includes('}%%')) inDirective = false;
      index += 1;
      continue;
    }

    EDGE_OP_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EDGE_OP_RE.exec(line)) !== null) {
      const op = match[0] ?? '';
      const parsed = parseEdgeOp(op);
      seenStyle.add(parsed.lineStyle);
      seenCap.add(parsed.endCap);
      seenDir.add(parsed.direction);
      seenLength.add(parsed.length);
    }

    index += 1;
  }

  const lineStyle = seenStyle.size === 1 ? (Array.from(seenStyle)[0] ?? null) : null;
  const endCap = seenCap.size === 1 ? (Array.from(seenCap)[0] ?? null) : null;
  const direction = seenDir.size === 1 ? (Array.from(seenDir)[0] ?? null) : null;
  const length = seenLength.size === 1 ? (Array.from(seenLength)[0] ?? null) : null;

  if (!lineStyle && !endCap && !direction && !length) return null;
  return { lineStyle, endCap, direction, length };
};

export const setFlowchartEdgeStyle = (code: string, update: FlowchartEdgeStyleUpdate): string => {
  if (!code.trim()) return code;
  if (!Object.keys(update).length) return code;
  if (!isFlowchartDiagram(code)) return code;

  const lines = code.split(/\r?\n/);
  const next: string[] = [];
  let index = 0;
  let consumedFrontmatter = false;
  let inDirective = false;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!consumedFrontmatter && trimmed === '---') {
      next.push(line);
      index += 1;
      while (index < lines.length) {
        next.push(lines[index] ?? '');
        if ((lines[index]?.trim() ?? '') === '---') {
          index += 1;
          break;
        }
        index += 1;
      }
      consumedFrontmatter = true;
      continue;
    }

    if (!inDirective && trimmed.startsWith('%%{')) {
      inDirective = true;
    }
    if (inDirective) {
      next.push(line);
      if (line.includes('}%%')) inDirective = false;
      index += 1;
      continue;
    }

    const applyUpdate = (current: ReturnType<typeof parseEdgeOp>) => {
      const lineStyle = update.lineStyle ?? current.lineStyle;
      const endCap = update.endCap ?? current.endCap;
      const length = update.length ?? current.length;
      const direction = update.direction ?? current.direction;

      if (endCap === 'circle' || endCap === 'cross') {
        return {
          lineStyle: 'normal' as FlowchartArrowStyle,
          endCap,
          length,
          direction: 'forward' as FlowchartEdgeDirection,
        };
      }

      return {
        lineStyle,
        endCap,
        length,
        direction: endCap === 'arrow' ? direction : ('forward' as FlowchartEdgeDirection),
      };
    };

    const rewritten = line
      .replace(MIDDLE_LABEL_RE, (_match, _left, label, right) => {
        const parsed = parseEdgeOp(String(right ?? ''));
        const merged = applyUpdate(parsed);
        const nextLeft = buildLeftOp(merged.lineStyle);
        const level = clampLength(merged.length);
        const rawLevel = level === 1 ? 1 : level === 2 ? 2 : 3;
        const nextRight =
          merged.endCap === 'arrow'
            ? buildArrowOp(merged.lineStyle, rawLevel, 'forward')
            : merged.endCap === 'none'
              ? buildLineOp(merged.lineStyle, rawLevel)
              : buildCapOp(merged.endCap, rawLevel);
        return `${nextLeft} ${String(label ?? '').trim()} ${nextRight}`;
      })
      .replace(EDGE_OP_RE, (op) => {
        const parsed = parseEdgeOp(op);
        const merged = applyUpdate(parsed);
        const rawLevel = merged.length === 1 ? 1 : merged.length === 2 ? 2 : 3;
        if (merged.endCap === 'arrow') {
          return buildArrowOp(merged.lineStyle, rawLevel, merged.direction);
        }
        if (merged.endCap === 'none') {
          return buildLineOp(merged.lineStyle, rawLevel);
        }
        return buildCapOp(merged.endCap, rawLevel);
      });

    next.push(rewritten);
    index += 1;
  }

  return next.join('\n');
};

export const extractFlowchartArrowStyle = (code: string): FlowchartArrowStyle | null => {
  const extracted = extractFlowchartEdgeStyle(code);
  return extracted?.lineStyle ?? null;
};

export const setFlowchartArrowStyle = (code: string, style: FlowchartArrowStyle | null): string => {
  if (!style) return code;
  return setFlowchartEdgeStyle(code, { lineStyle: style });
};
