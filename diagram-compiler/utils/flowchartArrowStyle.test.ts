import { describe, expect, it } from 'vitest';
import {
  extractFlowchartArrowStyle,
  extractFlowchartEdgeStyle,
  setFlowchartArrowStyle,
  setFlowchartEdgeStyle,
} from './flowchartArrowStyle';

describe('flowchartArrowStyle', () => {
  it('extracts style from flowchart arrows', () => {
    const code = `flowchart TD\nA --> B\nB ----> C`;
    expect(extractFlowchartArrowStyle(code)).toBe('normal');
  });

  it('returns null when mixed styles are present', () => {
    const code = `flowchart TD\nA --> B\nB ==> C`;
    expect(extractFlowchartArrowStyle(code)).toBe(null);
  });

  it('rewrites arrows preserving length level', () => {
    const code = `flowchart TD\nA --> B\nB ----> C`;
    expect(setFlowchartArrowStyle(code, 'thick')).toBe(`flowchart TD\nA ==> B\nB ====> C`);
  });

  it('rewrites middle-label arrows', () => {
    const code = `flowchart TD\nA -- Yes ----> B`;
    expect(setFlowchartArrowStyle(code, 'thick')).toBe(`flowchart TD\nA == Yes ====> B`);
    expect(setFlowchartArrowStyle(code, 'dotted')).toBe(`flowchart TD\nA -. Yes -...-> B`);
  });

  it('skips non-flowchart diagrams', () => {
    const code = `sequenceDiagram\nA->>B: hi`;
    expect(setFlowchartArrowStyle(code, 'thick')).toBe(code);
    expect(extractFlowchartArrowStyle(code)).toBe(null);
  });

  it('extracts edge settings (cap/direction/length) when uniform', () => {
    const code = `flowchart TD\nA ---> B\nB ---> C`;
    expect(extractFlowchartEdgeStyle(code)).toEqual({
      lineStyle: 'normal',
      endCap: 'arrow',
      direction: 'forward',
      length: 2,
    });
  });

  it('can convert arrow heads to lines', () => {
    const code = `flowchart TD\nA --> B\nB ==> C`;
    expect(setFlowchartEdgeStyle(code, { endCap: 'none' })).toBe(`flowchart TD\nA --- B\nB === C`);
  });

  it('can convert arrows to bidirectional', () => {
    const code = `flowchart TD\nA ---> B`;
    expect(setFlowchartEdgeStyle(code, { direction: 'bidirectional' })).toBe(`flowchart TD\nA <---> B`);
  });

  it('can apply circle/cross caps (normal line only)', () => {
    const code = `flowchart TD\nA ==> B`;
    expect(setFlowchartEdgeStyle(code, { endCap: 'circle', length: 2 })).toBe(`flowchart TD\nA ---o B`);
    expect(setFlowchartEdgeStyle(code, { endCap: 'cross', length: 1 })).toBe(`flowchart TD\nA --x B`);
  });

  it('repairs invalid arrow+cap operators like -->o', () => {
    const code = `flowchart TD\nA -->o B`;
    expect(setFlowchartEdgeStyle(code, { endCap: 'circle' })).toBe(`flowchart TD\nA --o B`);
  });

  it('repairs invalid double-cap operators like ---xo', () => {
    const code = `flowchart TD\nA ---xo B`;
    expect(setFlowchartEdgeStyle(code, { endCap: 'circle' })).toBe(`flowchart TD\nA ---o B`);
    expect(setFlowchartEdgeStyle(code, { endCap: 'cross' })).toBe(`flowchart TD\nA ---x B`);
  });
});
