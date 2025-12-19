import { DiagramType } from '../types';

const DOCS_BASE_URL = '/mermaid-docs';

const commonDocs = [
  'packages/mermaid/src/docs/intro/getting-started.md',
  'packages/mermaid/src/docs/intro/syntax-reference.md',
  'packages/mermaid/src/docs/config/configuration.md',
];

const diagramDocs: Record<DiagramType, string[]> = {
  flowchart: ['packages/mermaid/src/docs/syntax/flowchart.md'],
  sequence: ['packages/mermaid/src/docs/syntax/sequenceDiagram.md'],
  er: ['packages/mermaid/src/docs/syntax/entityRelationshipDiagram.md'],
  c4: ['packages/mermaid/src/docs/syntax/c4.md'],
  class: ['packages/mermaid/src/docs/syntax/classDiagram.md'],
  state: ['packages/mermaid/src/docs/syntax/stateDiagram.md'],
  gantt: ['packages/mermaid/src/docs/syntax/gantt.md'],
  mindmap: ['packages/mermaid/src/docs/syntax/mindmap.md'],
  pie: ['packages/mermaid/src/docs/syntax/pie.md'],
  timeline: ['packages/mermaid/src/docs/syntax/timeline.md'],
  userJourney: ['packages/mermaid/src/docs/syntax/userJourney.md'],
};

const fetchLocalDoc = async (path: string): Promise<{ path: string; text: string }> => {
  try {
    const res = await fetch(`${DOCS_BASE_URL}/${path}`);
    if (!res.ok) return { path, text: '' };
    const text = await res.text();
    return { path, text };
  } catch {
    return { path, text: '' };
  }
};

export const fetchDocsContext = async (diagramType: DiagramType): Promise<string> => {
  let context = "Mermaid Documentation Snippets:\n\n";
  
  // 1. Common
  const commonPromises = commonDocs.map(path => fetchLocalDoc(path));
  const commonResults = await Promise.all(commonPromises);
  commonResults.forEach(result => {
    if (result.text) {
      context += `--- ${result.path} ---\n${result.text.slice(0, 1000)}\n\n`;
    }
  });

  // 2. Specific
  const specific = diagramDocs[diagramType] || [];
  const specificPromises = specific.map(path => fetchLocalDoc(path));
  const specificResults = await Promise.all(specificPromises);
  specificResults.forEach(result => {
    if (result.text) {
      context += `--- ${result.path} ---\n${result.text.slice(0, 2000)}\n\n`;
    }
  });

  return context;
};
