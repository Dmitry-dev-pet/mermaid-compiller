import { DiagramType } from '../types';

const DOCS_BASE_URL = '/mermaid-docs';

const commonDocs = [
  'packages/mermaid/src/docs/intro/getting-started.md',
  'packages/mermaid/src/docs/config/setup/README.md',
];

const diagramDocs: Record<string, string[]> = {
  flowchart: ['packages/mermaid/src/docs/syntax/flowchart.md'],
  sequence: ['packages/mermaid/src/docs/syntax/sequenceDiagram.md'],
  er: ['packages/mermaid/src/docs/syntax/erDiagram.md', 'packages/mermaid/src/docs/syntax/entityRelationshipDiagram.md'],
  // Add others as needed mapping from DiagramType
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
