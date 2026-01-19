import { describe, expect, it } from 'vitest';

import { buildSceneMeta, hashString, injectSceneMetaJson, readSceneMeta } from './whiteboardSceneMeta';

describe('whiteboardSceneMeta', () => {
  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abcd'));
  });

  it('injects and reads meta', () => {
    const meta = buildSceneMeta({ mermaidCode: 'flowchart TD\nA-->B', svgMarkup: '<svg></svg>' });
    const json = injectSceneMetaJson(JSON.stringify({ type: 'excalidraw', version: 2, elements: [] }), meta);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const read = readSceneMeta(parsed);
    expect(read).not.toBeNull();
    expect(read?.v).toBe(2);
    expect(read?.mermaidHash).toBe(meta.mermaidHash);
    expect(read?.svgHash).toBe(meta.svgHash);
  });
});

