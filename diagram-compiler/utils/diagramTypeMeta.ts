import type { DiagramType } from '../types';
import type { MermaidDirection } from './inlineDirectionCommand';

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  architecture: 'Architecture',
  block: 'Block',
  c4: 'C4 (experimental)',
  class: 'Class Diagram',
  er: 'Entity Relationship',
  flowchart: 'Flowchart',
  gantt: 'Gantt',
  gitGraph: 'Git Graph',
  kanban: 'Kanban',
  mindmap: 'Mindmap',
  packet: 'Packet',
  pie: 'Pie',
  quadrantChart: 'Quadrant Chart',
  radar: 'Radar',
  requirementDiagram: 'Requirement Diagram',
  sequence: 'Sequence Diagram',
  sankey: 'Sankey',
  state: 'State Diagram',
  timeline: 'Timeline',
  treemap: 'Treemap',
  userJourney: 'User Journey',
  xychart: 'XY Chart',
  zenuml: 'ZenUML',
};

export const DIAGRAM_TYPE_SHORT_LABELS: Record<DiagramType, string> = {
  architecture: 'AR',
  block: 'BL',
  c4: 'C4',
  class: 'CD',
  er: 'ER',
  flowchart: 'FC',
  gantt: 'GN',
  gitGraph: 'GG',
  kanban: 'KB',
  mindmap: 'MM',
  packet: 'PK',
  pie: 'PI',
  quadrantChart: 'QC',
  radar: 'RA',
  requirementDiagram: 'RQ',
  sequence: 'SD',
  sankey: 'SK',
  state: 'ST',
  timeline: 'TL',
  treemap: 'TM',
  userJourney: 'UJ',
  xychart: 'XY',
  zenuml: 'ZU',
};

export const DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION: Record<DiagramType, boolean> = {
  architecture: false,
  block: false,
  c4: false,
  class: true,
  er: true,
  flowchart: true,
  gantt: false,
  gitGraph: false,
  kanban: false,
  mindmap: false,
  packet: false,
  pie: false,
  quadrantChart: false,
  radar: false,
  requirementDiagram: true,
  sequence: false,
  sankey: false,
  state: true,
  timeline: false,
  treemap: false,
  userJourney: false,
  xychart: false,
  zenuml: false,
};

export const DIAGRAM_TYPE_SUPPORTS_INLINE_LOOK: Record<DiagramType, boolean> = {
  architecture: false,
  block: false,
  c4: false,
  class: false,
  er: false,
  flowchart: true,
  gantt: false,
  gitGraph: false,
  kanban: false,
  mindmap: false,
  packet: false,
  pie: false,
  quadrantChart: false,
  radar: false,
  requirementDiagram: false,
  sequence: false,
  sankey: false,
  state: true,
  timeline: false,
  treemap: false,
  userJourney: false,
  xychart: false,
  zenuml: false,
};

export const getDiagramTypeLabel = (diagramType: DiagramType | null | undefined) => {
  if (!diagramType) return 'Mermaid';
  return DIAGRAM_TYPE_LABELS[diagramType] ?? 'Mermaid';
};

export const getDiagramTypeShortLabel = (diagramType: DiagramType | null | undefined) => {
  if (!diagramType) return 'MD';
  return DIAGRAM_TYPE_SHORT_LABELS[diagramType] ?? 'MD';
};

export const getInlineDirectionOptions = (diagramType: DiagramType | null | undefined): MermaidDirection[] => {
  if (!diagramType) return [];
  if (!DIAGRAM_TYPE_SUPPORTS_INLINE_DIRECTION[diagramType]) return [];
  if (diagramType === 'flowchart') {
    return ['TB', 'TD', 'LR', 'RL', 'BT'];
  }
  return ['TB', 'LR', 'RL', 'BT'];
};
