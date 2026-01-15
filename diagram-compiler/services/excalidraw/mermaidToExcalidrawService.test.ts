import { describe, expect, it, vi } from 'vitest';

vi.mock('@excalidraw/mermaid-to-excalidraw', () => ({
  parseMermaidToExcalidraw: vi.fn(),
}));

import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import {
  detectMermaidDiagramTypeHint,
  isImageOnlySkeletons,
  normalizeMermaidToExcalidrawSkeletons,
  parseMermaidToExcalidrawSkeletons,
  preprocessMermaidForExcalidraw,
  stripMermaidInitDirectives,
  stripYamlFrontmatter,
} from './mermaidToExcalidrawService';

describe('mermaidToExcalidrawService', () => {
  it('detects diagram type hints', () => {
    expect(detectMermaidDiagramTypeHint('flowchart TD\nA-->B')).toBe('flowchart');
    expect(detectMermaidDiagramTypeHint('graph TD\nA-->B')).toBe('flowchart');
    expect(detectMermaidDiagramTypeHint('erDiagram\nA ||--|| B : rel')).toBe('er');
    expect(detectMermaidDiagramTypeHint('sequenceDiagram\nA->>B: hi')).toBe('sequence');
    expect(detectMermaidDiagramTypeHint('---\nconfig:\n  theme: base\n---\nflowchart TD\nA-->B')).toBe('flowchart');
    expect(detectMermaidDiagramTypeHint('')).toBe('unknown');
  });

  it('strips YAML frontmatter', () => {
    const input = `---\nconfig:\n  theme: base\n---\nflowchart TD\nA-->B\n`;
    expect(stripYamlFrontmatter(input)).toContain('flowchart TD');
    expect(stripYamlFrontmatter(input)).not.toContain('config:');
  });

  it('strips Mermaid init directives', () => {
    const input = `%%{init: { "theme": "base" }}%%\nflowchart TD\nA-->B\n`;
    expect(stripMermaidInitDirectives(input)).toBe('flowchart TD\nA-->B');
  });

  it('preprocesses Mermaid for Excalidraw (frontmatter + init + <br>)', () => {
    const input = `---\nconfig:\n  theme: base\n---\n%%{init: { "theme": "base" }}%%\nflowchart TD\nA<br/>-->B\n`;
    const out = preprocessMermaidForExcalidraw(input);
    expect(out).toBe('flowchart TD\nA-->B');
  });

  it('normalizes legacy arrow skeletons (startX/startY/endX/endY)', () => {
    const normalized = normalizeMermaidToExcalidrawSkeletons([
      { type: 'arrow', startX: 10, startY: 20, endX: 40, endY: 50, strokeColor: '#000' },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.type).toBe('arrow');
    expect(normalized[0]?.x).toBe(10);
    expect(normalized[0]?.y).toBe(20);
    expect(normalized[0]?.points).toEqual([[0, 0], [30, 30]]);
  });

  it('detects image-only skeleton payloads', () => {
    expect(isImageOnlySkeletons([{ type: 'image' }])).toBe(true);
    expect(isImageOnlySkeletons([{ type: 'image' }, { type: 'image' }])).toBe(true);
    expect(isImageOnlySkeletons([{ type: 'image' }, { type: 'rectangle' }])).toBe(false);
    expect(isImageOnlySkeletons([])).toBe(false);
  });

  it('throws when library returns graphImage for flowchart/sequence', async () => {
    const mocked = vi.mocked(parseMermaidToExcalidraw);
    mocked.mockResolvedValueOnce({
      elements: [{ type: 'image', x: 0, y: 0, width: 100, height: 100, fileId: 'x', status: 'saved' }],
      files: { x: { id: 'x', mimeType: 'image/svg+xml', dataURL: 'data:image/svg+xml;base64,AA==' } },
    });

    await expect(parseMermaidToExcalidrawSkeletons({
      mermaidCode: 'flowchart TD\nA-->B',
      diagramTypeHint: 'flowchart',
      timeoutMs: 50,
    })).rejects.toThrow(/image-only/);
  });

  it('passes through non-image skeletons', async () => {
    const mocked = vi.mocked(parseMermaidToExcalidraw);
    mocked.mockResolvedValueOnce({
      elements: [
        { type: 'rectangle', x: 0, y: 0, width: 100, height: 50, label: { text: 'A' } },
        { type: 'arrow', startX: 0, startY: 0, endX: 100, endY: 0 },
      ],
      files: {},
    });

    const { skeletons, files } = await parseMermaidToExcalidrawSkeletons({
      mermaidCode: 'flowchart TD\nA-->B',
      diagramTypeHint: 'flowchart',
      timeoutMs: 50,
    });
    expect(skeletons.some((s) => s.type === 'rectangle')).toBe(true);
    expect(skeletons.some((s) => s.type === 'arrow' || s.type === 'line')).toBe(true);
    expect(Object.keys(files)).toHaveLength(0);
  });
});
