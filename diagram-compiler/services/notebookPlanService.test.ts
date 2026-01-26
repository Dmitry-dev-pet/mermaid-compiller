import { describe, expect, it } from 'vitest';
import { parseNotebookPlan, normalizeNotebookPlan } from './notebookPlanService';
import { validateNotebookPlan, NOTEBOOK_PLAN_SCHEMA_VERSION } from './notebookPlanSchema';

describe('notebookPlanService', () => {
  it('parses valid notebook plan JSON', () => {
    const raw = JSON.stringify({
      schemaVersion: NOTEBOOK_PLAN_SCHEMA_VERSION,
      resolvedN: 2,
      diagrams: [
        { title: 'Diagram A', diagramType: 'flowchart', description: 'Shows flow', buildPrompt: 'build A' },
        { title: 'Diagram B', diagramType: 'sequence', description: 'Shows messages', buildPrompt: 'build B' },
      ],
    });

    const plan = parseNotebookPlan(raw);
    expect(plan.resolvedN).toBe(2);
    expect(plan.diagrams).toHaveLength(2);
    expect(plan.diagrams[0].diagramType).toBe('flowchart');
  });

  it('parses notebook plan JSON with trailing commas', () => {
    const raw = `{
      "schemaVersion": "${NOTEBOOK_PLAN_SCHEMA_VERSION}",
      "resolvedN": 1,
      "diagrams": [
        { "title": "Diagram A", "diagramType": "flowchart", "description": "Shows flow", "buildPrompt": "build A", },
      ],
      "notes": ["ok",],
    }`;

    const plan = parseNotebookPlan(raw);
    expect(plan.resolvedN).toBe(1);
    expect(plan.diagrams).toHaveLength(1);
  });

  it('rejects invalid notebook plan JSON', () => {
    const raw = JSON.stringify({
      resolvedN: 1,
      diagrams: [{ title: 'No schema', diagramType: 'flowchart', buildPrompt: 'x' }],
    });

    expect(() => parseNotebookPlan(raw)).toThrow(/schemaVersion/i);
  });

  it('normalizes to requestedN when provided', () => {
    const plan = normalizeNotebookPlan(
      {
        schemaVersion: NOTEBOOK_PLAN_SCHEMA_VERSION,
        resolvedN: 3,
        diagrams: [
          { title: 'A', diagramType: 'flowchart', description: 'A desc', buildPrompt: 'a' },
          { title: 'B', diagramType: 'sequence', description: 'B desc', buildPrompt: 'b' },
          { title: 'C', diagramType: 'class', description: 'C desc', buildPrompt: 'c' },
        ],
      },
      2
    );

    expect(plan.diagrams).toHaveLength(2);
    expect(plan.resolvedN).toBe(2);
  });
});

describe('validateNotebookPlan', () => {
  it('reports missing diagrams', () => {
    const result = validateNotebookPlan({
      schemaVersion: NOTEBOOK_PLAN_SCHEMA_VERSION,
      diagrams: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('diagrams');
  });
});
