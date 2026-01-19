import { describe, expect, it } from 'vitest';

import { tryParseInitialScene } from './whiteboardSceneParse';

describe('tryParseInitialScene', () => {
  it('returns null for empty', () => {
    expect(tryParseInitialScene(null)).toBeNull();
    expect(tryParseInitialScene('')).toBeNull();
    expect(tryParseInitialScene('   ')).toBeNull();
  });

  it('keeps image-only ER scenes with embedded files', () => {
    const scene = {
      type: 'excalidraw',
      version: 2,
      source: 'test',
      elements: [{ type: 'image', fileId: 'x', x: 0, y: 0, width: 10, height: 10 }],
      files: { x: { id: 'x', mimeType: 'image/svg+xml', dataURL: 'data:', created: 1 } },
      __mermaidLanggraph: { v: 2, diagramType: 'er', mermaidHash: 1, svgHash: 2, generator: 'svg-image' },
    };

    expect(tryParseInitialScene(JSON.stringify(scene))).not.toBeNull();
  });

  it('rejects image-only non-ER scenes with embedded files', () => {
    const scene = {
      type: 'excalidraw',
      version: 2,
      source: 'test',
      elements: [{ type: 'image', fileId: 'x', x: 0, y: 0, width: 10, height: 10 }],
      files: { x: { id: 'x', mimeType: 'image/svg+xml', dataURL: 'data:', created: 1 } },
      __mermaidLanggraph: { v: 2, diagramType: 'flowchart', mermaidHash: 1, svgHash: 2, generator: 'svg-image' },
    };

    expect(tryParseInitialScene(JSON.stringify(scene))).toBeNull();
  });
});
