export type FlowchartLinkStylePresetId = 'none' | 'thin' | 'normal' | 'thick' | 'accent' | 'custom';

const HEADER_RE = /^(flowchart|graph)\b/i;

const PRESETS: Record<Exclude<FlowchartLinkStylePresetId, 'custom'>, string | null> = {
  none: null,
  thin: 'stroke-width:1px',
  normal: 'stroke-width:2px',
  thick: 'stroke-width:4px',
  accent: 'stroke:#3b82f6,stroke-width:2px',
};

const normalizeStyleValue = (value: string) => {
  return value
    .trim()
    .replace(/;+$/, '')
    .replace(/\s+/g, '')
    .toLowerCase();
};

const isFlowchartDiagram = (code: string): boolean => {
  const lines = code.split(/\r?\n/);
  let index = 0;
  let consumedFrontmatter = false;

  while (index < lines.length) {
    const trimmed = (lines[index] ?? '').trim();

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

const LINK_STYLE_RE = /^\s*linkStyle\s+default\s+(.+?)\s*;?\s*$/i;

export const extractFlowchartLinkStylePreset = (code: string): FlowchartLinkStylePresetId | null => {
  if (!code.trim()) return null;
  if (!isFlowchartDiagram(code)) return null;

  const lines = code.split(/\r?\n/);
  let index = 0;
  let consumedFrontmatter = false;
  let inDirective = false;
  let foundValue: string | null = null;

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

    const match = trimmed.match(LINK_STYLE_RE);
    if (match?.[1]) {
      foundValue = match[1];
      break;
    }

    index += 1;
  }

  if (!foundValue) return 'none';

  const normalized = normalizeStyleValue(foundValue);
  for (const [id, preset] of Object.entries(PRESETS)) {
    if (!preset) continue;
    if (normalizeStyleValue(preset) === normalized) return id as FlowchartLinkStylePresetId;
  }
  return 'custom';
};

export const setFlowchartLinkStylePreset = (code: string, presetId: FlowchartLinkStylePresetId): string => {
  if (!code.trim()) return code;
  if (!isFlowchartDiagram(code)) return code;

  const preset = PRESETS[presetId as Exclude<FlowchartLinkStylePresetId, 'custom'>] ?? null;
  const lines = code.split(/\r?\n/);
  const next: string[] = [];
  let index = 0;
  let consumedFrontmatter = false;
  let inDirective = false;
  let didApply = false;
  let headerIndexInNext: number | null = null;

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

    if (headerIndexInNext === null && HEADER_RE.test(trimmed)) {
      headerIndexInNext = next.length;
      next.push(line);
      index += 1;
      continue;
    }

    if (LINK_STYLE_RE.test(trimmed)) {
      if (preset) {
        next.push(`linkStyle default ${preset};`);
        didApply = true;
      }
      index += 1;
      continue;
    }

    next.push(line);
    index += 1;
  }

  if (!didApply && preset) {
    const insertAfter = headerIndexInNext !== null ? headerIndexInNext + 1 : 0;
    next.splice(insertAfter, 0, `linkStyle default ${preset};`);
  }

  return next.join('\n');
};

