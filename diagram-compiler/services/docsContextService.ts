import { DiagramType } from '../types';

const DOCS_BASE_URL = '/mermaid-docs';

const commonDocs = [
  'packages/mermaid/src/docs/intro/syntax-reference.md',
  'packages/mermaid/src/docs/config/configuration.md',
];

const diagramDocs: Record<DiagramType, string[]> = {
  architecture: ['packages/mermaid/src/docs/syntax/architecture.md'],
  block: ['packages/mermaid/src/docs/syntax/block.md'],
  c4: ['packages/mermaid/src/docs/syntax/c4.md'],
  class: ['packages/mermaid/src/docs/syntax/classDiagram.md'],
  er: ['packages/mermaid/src/docs/syntax/entityRelationshipDiagram.md'],
  flowchart: ['packages/mermaid/src/docs/syntax/flowchart.md'],
  gantt: ['packages/mermaid/src/docs/syntax/gantt.md'],
  gitGraph: ['packages/mermaid/src/docs/syntax/gitgraph.md'],
  kanban: ['packages/mermaid/src/docs/syntax/kanban.md'],
  mindmap: ['packages/mermaid/src/docs/syntax/mindmap.md'],
  packet: ['packages/mermaid/src/docs/syntax/packet.md'],
  pie: ['packages/mermaid/src/docs/syntax/pie.md'],
  quadrantChart: ['packages/mermaid/src/docs/syntax/quadrantChart.md'],
  radar: ['packages/mermaid/src/docs/syntax/radar.md'],
  requirementDiagram: ['packages/mermaid/src/docs/syntax/requirementDiagram.md'],
  sankey: ['packages/mermaid/src/docs/syntax/sankey.md'],
  sequence: ['packages/mermaid/src/docs/syntax/sequenceDiagram.md'],
  state: ['packages/mermaid/src/docs/syntax/stateDiagram.md'],
  timeline: ['packages/mermaid/src/docs/syntax/timeline.md'],
  treemap: ['packages/mermaid/src/docs/syntax/treemap.md'],
  userJourney: ['packages/mermaid/src/docs/syntax/userJourney.md'],
  xychart: ['packages/mermaid/src/docs/syntax/xyChart.md'],
  zenuml: ['packages/mermaid/src/docs/syntax/zenuml.md'],
};

export type DocsEntry = { path: string; text: string; isOptional?: boolean };

export const getDocsPaths = (diagramType: DiagramType): Array<{ path: string; isOptional?: boolean }> => {
  const specific = diagramDocs[diagramType] || [];
  const optionalDocs = [
    'packages/mermaid/src/docs/intro/getting-started.md',
    'packages/mermaid/src/docs/config/directives.md',
    'packages/mermaid/src/docs/config/theming.md',
  ];
  const requiredPaths = [...specific, ...commonDocs];
  return [
    ...requiredPaths.map((path) => ({ path })),
    ...optionalDocs.map((path) => ({ path, isOptional: true })),
  ];
};

const fetchLocalDoc = async (path: string, isOptional = false): Promise<DocsEntry> => {
  try {
    const res = await fetch(`${DOCS_BASE_URL}/${path}`);
    if (!res.ok) return { path, text: '', isOptional };
    const text = await res.text();
    return { path, text, isOptional };
  } catch {
    return { path, text: '', isOptional };
  }
};

export const getDiagramSyntaxPath = (diagramType: DiagramType): string | null => {
  const paths = diagramDocs[diagramType];
  return paths?.[0] ?? null;
};

export const fetchDiagramSyntaxDoc = async (
  diagramType: DiagramType,
): Promise<{ text: string; path: string | null }> => {
  const path = getDiagramSyntaxPath(diagramType);
  if (!path) return { text: '', path: null };
  const result = await fetchLocalDoc(path);
  return { text: result.text, path: result.path };
};

export const fetchDocsEntries = async (diagramType: DiagramType): Promise<DocsEntry[]> => {
  const paths = getDocsPaths(diagramType);
  const results = await Promise.all(
    paths.map(({ path, isOptional }) => fetchLocalDoc(path, !!isOptional))
  );
  return results;
};

export const formatDocsContext = (entries: DocsEntry[]): string => {
  let context = "Mermaid Documentation Snippets:\n\n";
  entries.forEach(result => {
    if (result.text) {
      context += `--- ${result.path} ---\n${result.text}\n\n`;
    }
  });
  return context;
};

export const fetchDocsContext = async (diagramType: DiagramType): Promise<string> => {
  const entries = await fetchDocsEntries(diagramType);
  return formatDocsContext(entries);
};
