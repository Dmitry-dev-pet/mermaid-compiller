import { extractFrontmatterFlowchartConfigValue, updateFrontmatterFlowchartConfigKey } from './mermaidFrontmatter';

export const FLOWCHART_CURVES = [
  'basis',
  'bumpX',
  'bumpY',
  'cardinal',
  'catmullRom',
  'linear',
  'monotoneX',
  'monotoneY',
  'natural',
  'step',
  'stepAfter',
  'stepBefore',
] as const;

export type FlowchartCurve = typeof FLOWCHART_CURVES[number];

const HEADER_RE = /^(flowchart|graph)\b/i;

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

const normalizeCurve = (raw: string | null | undefined): FlowchartCurve | null => {
  const token = String(raw ?? '').trim();
  if (!token) return null;
  return (FLOWCHART_CURVES as readonly string[]).includes(token) ? (token as FlowchartCurve) : null;
};

export const extractFlowchartCurve = (code: string): FlowchartCurve | null => {
  if (!code.trim()) return null;
  if (!isFlowchartDiagram(code)) return null;
  return normalizeCurve(extractFrontmatterFlowchartConfigValue(code, 'curve'));
};

export const setFlowchartCurve = (code: string, curve: FlowchartCurve | null): string => {
  if (!code.trim()) return code;
  if (!isFlowchartDiagram(code)) return code;
  return updateFrontmatterFlowchartConfigKey(code, 'curve', curve).code;
};

