import { describe, expect, it } from 'vitest';
import { extractFlowchartLinkStylePreset, setFlowchartLinkStylePreset } from './flowchartLinkStyle';

describe('flowchartLinkStyle', () => {
  it('detects missing preset as none', () => {
    const code = `flowchart TD\nA --> B`;
    expect(extractFlowchartLinkStylePreset(code)).toBe('none');
  });

  it('extracts known presets and custom', () => {
    const thin = `flowchart TD\nlinkStyle default stroke-width:1px;\nA --> B`;
    expect(extractFlowchartLinkStylePreset(thin)).toBe('thin');

    const custom = `flowchart TD\nlinkStyle default stroke:#f00,stroke-width:3px;\nA --> B`;
    expect(extractFlowchartLinkStylePreset(custom)).toBe('custom');
  });

  it('can set and remove the default linkStyle', () => {
    const code = `flowchart TD\nA --> B`;
    expect(setFlowchartLinkStylePreset(code, 'thick')).toBe(`flowchart TD\nlinkStyle default stroke-width:4px;\nA --> B`);
    expect(setFlowchartLinkStylePreset(`flowchart TD\nlinkStyle default stroke-width:4px;\nA --> B`, 'none')).toBe(
      `flowchart TD\nA --> B`
    );
  });

  it('skips non-flowchart diagrams', () => {
    const code = `sequenceDiagram\nA->>B: hi`;
    expect(setFlowchartLinkStylePreset(code, 'thick')).toBe(code);
    expect(extractFlowchartLinkStylePreset(code)).toBe(null);
  });
});

