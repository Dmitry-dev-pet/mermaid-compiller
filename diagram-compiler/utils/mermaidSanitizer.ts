import type { DiagramType } from '../types';

const sanitizeArrowSyntax = (code: string) => {
  // Mermaid flowchart/state diagrams use `-->` / `<--`. LLMs sometimes emit `->` / `<-`.
  // Convert only the "single dash" variants, avoiding valid arrows like `-->`, `-.->`, `==>`,
  // and sequence arrows like `->>`.
  return code
    .replace(/(?<![-.=])<-(?!-)/g, '<--')
    .replace(/(?<![-.=])->(?!>)/g, '-->');
};

const sanitizeFlowchartLabels = (code: string) => {
  if (!code.trim().startsWith('flowchart')) return code;
  const replaceParens = (value: string) => {
    const withQuotes = value.replace(/"/g, "'");
    const withGroups = withQuotes.replace(/\(([^)]*)\)/g, (_match, inner) => {
      const trimmed = String(inner ?? '').trim();
      return trimmed ? ` — ${trimmed}` : '';
    });
    const withoutLoose = withGroups.replace(/[()]/g, '');
    return withoutLoose
      .replace(/\s*—\s*/g, ' — ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  let next = sanitizeArrowSyntax(code);
  next = next.replace(/\|([^|\n]*)\|/g, (match, label) => `|${replaceParens(label)}|`);
  next = next.replace(/\[([^\]\n]*)\]/g, (match, label) => `[${replaceParens(label)}]`);
  next = next.replace(/\{([^}\n]*)\}/g, (match, label) => `{${replaceParens(label)}}`);
  return next;
};

export const sanitizeMermaidByType = (diagramType: DiagramType, code: string) => {
  if (diagramType === 'auto') {
    const trimmed = code.trimStart();
    if (trimmed.startsWith('flowchart')) return sanitizeFlowchartLabels(code);
    if (/^stateDiagram/i.test(trimmed)) return sanitizeArrowSyntax(code);
    if (trimmed.startsWith('erDiagram')) return sanitizeMermaidByType('er', code);
    return code;
  }
  if (diagramType === 'flowchart') {
    return sanitizeFlowchartLabels(code);
  }
  if (diagramType === 'state') {
    return sanitizeArrowSyntax(code);
  }
  if (diagramType === 'er') {
    const lines = code.split(/\r?\n/);
    let inEntity = false;
    const sanitized = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.endsWith('{')) {
        inEntity = true;
        return line;
      }
      if (trimmed.startsWith('}')) {
        inEntity = false;
        return line;
      }
      if (!inEntity) return line;
      const match = line.match(/^(\s*)([A-Za-zА-Яа-я0-9_]+)\s+"([^"]+)"\s*$/);
      if (!match) return line;
      const [, indent, type, rawValue] = match;
      const normalized = rawValue
        .replace(/[:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\s-]+/g, '_')
        .replace(/[^A-Za-zА-Яа-я0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      const attr = normalized || 'attr';
      return `${indent}${type} ${attr}`;
    });
    return sanitized.join('\n');
  }
  return code;
};

export const formatMermaidErrorLine = (errorMessage: string, maxLength = 200) => {
  const lines = errorMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return '';
  if (lines.length === 1) return lines[0].slice(0, maxLength);
  const first = lines[0].endsWith(':') ? lines[0].slice(0, -1) : lines[0];
  const combined = `${first}: ${lines[1]}`.trim();
  return combined.slice(0, maxLength);
};
