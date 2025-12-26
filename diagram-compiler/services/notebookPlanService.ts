import type { DiagramType, NotebookPlan, NotebookPlanDiagram } from '../types';

const DIAGRAM_TYPE_ALIASES: Record<string, DiagramType> = {
  flowchart: 'flowchart',
  graph: 'flowchart',
  flowcharttd: 'flowchart',
  flowchartlr: 'flowchart',
  graphtd: 'flowchart',
  sequence: 'sequence',
  sequencediagram: 'sequence',
  class: 'class',
  classdiagram: 'class',
  state: 'state',
  statediagram: 'state',
  er: 'er',
  erdiagram: 'er',
  entityrelationship: 'er',
  entityrelationshipdiagram: 'er',
  gantt: 'gantt',
  mindmap: 'mindmap',
  pie: 'pie',
  requirement: 'requirementDiagram',
  requirementdiagram: 'requirementDiagram',
  c4: 'c4',
  architecture: 'architecture',
  block: 'block',
  gitgraph: 'gitGraph',
  kanban: 'kanban',
  packet: 'packet',
  quadrantchart: 'quadrantChart',
  radar: 'radar',
  sankey: 'sankey',
  timeline: 'timeline',
  treemap: 'treemap',
  userjourney: 'userJourney',
  xychart: 'xychart',
  zenuml: 'zenuml',
};

const coerceDiagramType = (value: string | undefined): DiagramType | 'other' => {
  if (!value) return 'other';
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return DIAGRAM_TYPE_ALIASES[normalized] ?? 'other';
};

const extractJsonObject = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
};

const normalizeDiagram = (diagram: NotebookPlanDiagram, index: number): NotebookPlanDiagram => {
  const diagramType = coerceDiagramType(diagram.diagramType as string);
  return {
    id: diagram.id || `d${index + 1}`,
    order: diagram.order ?? index + 1,
    title: diagram.title?.trim() || `Diagram ${index + 1}`,
    diagramType,
    goal: diagram.goal?.trim(),
    buildPrompt: diagram.buildPrompt?.trim() || '',
    acceptance: diagram.acceptance?.filter(Boolean),
  };
};

export const parseNotebookPlan = (raw: string): NotebookPlan => {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    throw new Error('Planner returned empty or non-JSON response.');
  }
  const parsed = JSON.parse(jsonText) as NotebookPlan;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Planner JSON is not an object.');
  }
  if (!Array.isArray(parsed.diagrams) || parsed.diagrams.length === 0) {
    throw new Error('Planner JSON missing diagrams.');
  }
  const diagrams = parsed.diagrams.map(normalizeDiagram);
  const resolvedN = Number(parsed.resolvedN ?? diagrams.length);
  return {
    ...parsed,
    resolvedN,
    diagrams,
  };
};

export const normalizeNotebookPlan = (plan: NotebookPlan, requestedN: number | null) => {
  const next = { ...plan };
  if (requestedN && requestedN > 0) {
    next.resolvedN = requestedN;
  }
  if (!Array.isArray(next.diagrams)) {
    next.diagrams = [];
  }
  if (requestedN && next.diagrams.length > requestedN) {
    next.diagrams = next.diagrams.slice(0, requestedN);
  }
  next.diagrams = next.diagrams.map(normalizeDiagram);
  if (!next.title?.trim()) {
    next.title = 'Diagram notebook';
  }
  return next;
};
