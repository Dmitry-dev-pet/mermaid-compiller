import type { DiagramType } from '../types';

const sanitizeFlowchartLabels = (code: string) => {
  if (!code.trim().startsWith('flowchart')) return code;
  const replaceParens = (value: string) => value.replace(/[()]/g, ' — ').replace(/"/g, "'");
  let next = code;
  next = next.replace(/\|([^|\n]*)\|/g, (match, label) => `|${replaceParens(label)}|`);
  next = next.replace(/\[([^\]\n]*)\]/g, (match, label) => `[${replaceParens(label)}]`);
  next = next.replace(/\{([^}\n]*)\}/g, (match, label) => `{${replaceParens(label)}}`);
  return next;
};

export const sanitizeMermaidByType = (diagramType: DiagramType, code: string) => {
  if (diagramType === 'flowchart') {
    return sanitizeFlowchartLabels(code);
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
