export const DIAGRAM_TYPES = [
  'architecture',
  'block',
  'c4',
  'class',
  'er',
  'flowchart',
  'gantt',
  'gitGraph',
  'kanban',
  'mindmap',
  'packet',
  'pie',
  'quadrantChart',
  'radar',
  'requirementDiagram',
  'sankey',
  'sequence',
  'state',
  'timeline',
  'treemap',
  'userJourney',
  'xychart',
  'zenuml',
] as const;

export const MAIN_DIAGRAM_TYPES = ['flowchart', 'er', 'sequence'] as const;

export const normalizeDiagramType = (value: string | null): string | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/\s+/g, '');
  switch (compact) {
    case 'sequencediagram':
    case 'sequence':
      return 'sequence';
    case 'classdiagram':
    case 'class':
      return 'class';
    case 'statediagram':
    case 'statediagramv2':
    case 'state':
      return 'state';
    case 'erdiagram':
    case 'er':
      return 'er';
    case 'flowchart':
    case 'flowcharttd':
    case 'flowchartlr':
    case 'flowchartrl':
    case 'flowchartbt':
      return 'flowchart';
    case 'gitgraph':
      return 'gitGraph';
    case 'quadrantchart':
      return 'quadrantChart';
    case 'requirementdiagram':
      return 'requirementDiagram';
    case 'userjourney':
      return 'userJourney';
    case 'xychart':
      return 'xychart';
    default:
      return raw;
  }
};
