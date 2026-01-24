import { describe, expect, it } from 'vitest';
import { buildSelectionLine } from './selectionLine';

describe('buildSelectionLine', () => {
  it('uses diagram type when provided', () => {
    expect(buildSelectionLine({ diagramType: 'flowchart' })).toBe('selection: FC');
  });

  it('falls back to allowed diagram types', () => {
    expect(buildSelectionLine({ diagramType: 'auto', allowedDiagramTypes: ['sequence', 'flowchart'] }))
      .toBe('selection: SD/FC');
  });

  it('returns empty when no selections', () => {
    expect(buildSelectionLine({ diagramType: 'auto', allowedDiagramTypes: [] })).toBe('');
  });
});
