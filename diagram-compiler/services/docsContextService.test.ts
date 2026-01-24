import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDocsContext, getDocsPaths, fetchDocsEntriesByPaths, fetchDiagramSyntaxDoc } from './docsContextService';

describe('docsContextService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds docs paths with optional entries', () => {
    const paths = getDocsPaths('flowchart');
    const required = paths.filter((entry) => !entry.isOptional).map((entry) => entry.path);
    const optional = paths.filter((entry) => entry.isOptional).map((entry) => entry.path);

    expect(required).toContain('packages/mermaid/src/docs/syntax/flowchart.md');
    expect(required).toContain('packages/mermaid/src/docs/intro/syntax-reference.md');
    expect(optional).toContain('intro/examples.md');
  });

  it('formats docs context without empty entries', () => {
    const context = formatDocsContext([
      { path: 'a.md', text: 'Alpha' },
      { path: 'b.md', text: '' },
    ]);
    expect(context).toContain('--- a.md ---');
    expect(context).toContain('Alpha');
    expect(context).not.toContain('--- b.md ---');
  });

  it('fetches docs entries by unique paths', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'doc',
    });
    vi.stubGlobal('fetch', fetchMock);

    const entries = await fetchDocsEntriesByPaths(['a.md', 'a.md', 'b.md']);
    expect(entries).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches syntax docs for a diagram type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'syntax',
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDiagramSyntaxDoc('flowchart');
    expect(result.path).toContain('flowchart.md');
    expect(result.text).toBe('syntax');
  });

  it('caches notebook docs context', async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'doc',
    });
    vi.stubGlobal('fetch', fetchMock);

    const module = await import('./docsContextService');
    const first = await module.fetchNotebookDocsContext();
    const second = await module.fetchNotebookDocsContext();

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });
});
