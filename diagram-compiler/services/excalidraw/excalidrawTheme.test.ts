import { describe, expect, it } from 'vitest';

import { applyMermaidThemeToExcalidrawElements } from './excalidrawTheme';

describe('applyMermaidThemeToExcalidrawElements', () => {
  it('forces readable colors on dark background when forceTheme=true', () => {
    const themed = applyMermaidThemeToExcalidrawElements(
      [
        { type: 'rectangle', strokeColor: '#111111', backgroundColor: '#1e1e1e' },
        { type: 'text', strokeColor: '#111111' },
        { type: 'arrow', strokeColor: '#111111' },
      ],
      { backgroundColor: '#111111', themeVariables: null, uiTheme: 'dark', forceTheme: true }
    ) as Array<Record<string, unknown>>;

    expect(themed[0]?.strokeColor).toBe('#cbd5e1');
    expect(themed[0]?.backgroundColor).toBe('transparent');
    expect(themed[1]?.strokeColor).toBe('#e5e7eb');
    expect(themed[2]?.strokeColor).toBe('#cbd5e1');
  });

  it('uses themeVariables when forceTheme=false', () => {
    const themed = applyMermaidThemeToExcalidrawElements(
      [
        // Low-contrast initial colors should be fixed using themeVariables.
        { type: 'rectangle', strokeColor: '#eeeeee', backgroundColor: 'transparent' },
        { type: 'text', strokeColor: '#eeeeee' },
        { type: 'line', strokeColor: '#eeeeee' },
      ],
      {
        backgroundColor: '#ffffff',
        themeVariables: { lineColor: '#ff0000', primaryTextColor: '#00ff00', primaryColor: '#0000ff' },
        uiTheme: 'light',
      }
    ) as Array<Record<string, unknown>>;

    expect(themed[0]?.strokeColor).toBe('#ff0000');
    expect(themed[0]?.backgroundColor).toBe('#0000ff');
    expect(themed[1]?.strokeColor).toBe('#00ff00');
    expect(themed[2]?.strokeColor).toBe('#ff0000');
  });

  it('does not touch image elements', () => {
    const themed = applyMermaidThemeToExcalidrawElements(
      [{ type: 'image', strokeColor: '#111111', backgroundColor: '#111111', locked: true }],
      { backgroundColor: '#ffffff', themeVariables: null, uiTheme: 'light', forceTheme: true }
    ) as Array<Record<string, unknown>>;

    expect(themed[0]).toEqual({ type: 'image', strokeColor: '#111111', backgroundColor: '#111111', locked: true });
  });
});
