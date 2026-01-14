import { describe, expect, it } from 'vitest';
import { extractFlowchartCurve, setFlowchartCurve } from './flowchartCurveConfig';

describe('flowchartCurveConfig', () => {
  it('extracts curve from frontmatter config.flowchart.curve', () => {
    const code = `---\nconfig:\n  flowchart:\n    curve: stepBefore\n---\nflowchart TD\nA --> B`;
    expect(extractFlowchartCurve(code)).toBe('stepBefore');
  });

  it('writes flowchart curve to frontmatter', () => {
    const code = `flowchart TD\nA --> B`;
    expect(setFlowchartCurve(code, 'linear')).toBe(`---\nconfig:\n  flowchart:\n    curve: linear\n---\nflowchart TD\nA --> B`);
  });

  it('removes curve when set to null', () => {
    const code = `---\nconfig:\n  flowchart:\n    curve: stepBefore\n---\nflowchart TD\nA --> B`;
    expect(setFlowchartCurve(code, null)).toBe(`flowchart TD\nA --> B`);
  });

  it('skips non-flowchart diagrams', () => {
    const code = `sequenceDiagram\nA->>B: hi`;
    expect(extractFlowchartCurve(code)).toBe(null);
    expect(setFlowchartCurve(code, 'linear')).toBe(code);
  });

  it('does not duplicate curve key when updated multiple times', () => {
    const code = `---\nconfig:\n  flowchart:\n    curve: natural\n  theme: base\n  look: classic\n---\nflowchart TD\nA --> B`;
    const next = setFlowchartCurve(code, 'cardinal');
    expect(next).toContain('curve: cardinal');
    expect(next).not.toContain('curve: natural');
    expect(next.match(/^\s*curve\s*:/gm)?.length ?? 0).toBe(1);
  });
});
