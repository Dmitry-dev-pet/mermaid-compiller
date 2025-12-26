import type { NotebookPlan, NotebookPlanDiagram } from '../types';

export const NOTEBOOK_PLAN_SCHEMA_VERSION = 'notebook-plan@1';

export type NotebookPlanValidationResult = {
  ok: boolean;
  errors: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validateDiagram = (diagram: unknown, index: number, errors: string[]) => {
  if (!isObject(diagram)) {
    errors.push(`diagram[${index}] is not an object`);
    return;
  }
  if (!isNonEmptyString(diagram.title)) {
    errors.push(`diagram[${index}].title is missing`);
  }
  if (!isNonEmptyString(diagram.buildPrompt)) {
    errors.push(`diagram[${index}].buildPrompt is missing`);
  }
  if (!isNonEmptyString(diagram.diagramType)) {
    errors.push(`diagram[${index}].diagramType is missing`);
  }
};

export const validateNotebookPlan = (plan: unknown): NotebookPlanValidationResult => {
  const errors: string[] = [];
  if (!isObject(plan)) {
    return { ok: false, errors: ['plan is not an object'] };
  }

  if (!isNonEmptyString(plan.schemaVersion)) {
    errors.push('schemaVersion is missing');
  } else if (plan.schemaVersion !== NOTEBOOK_PLAN_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${NOTEBOOK_PLAN_SCHEMA_VERSION}`);
  }

  if (!Array.isArray(plan.diagrams) || plan.diagrams.length === 0) {
    errors.push('diagrams must be a non-empty array');
  } else {
    plan.diagrams.forEach((diagram, index) => validateDiagram(diagram, index, errors));
  }

  if (plan.resolvedN !== undefined && typeof plan.resolvedN !== 'number') {
    errors.push('resolvedN must be a number when provided');
  }

  return { ok: errors.length === 0, errors };
};

export const coerceNotebookPlan = (plan: NotebookPlan): NotebookPlan => {
  const resolvedN = Number.isFinite(plan.resolvedN) ? plan.resolvedN : plan.diagrams.length;
  const diagrams = Array.isArray(plan.diagrams) ? (plan.diagrams as NotebookPlanDiagram[]) : [];
  return {
    ...plan,
    resolvedN,
    diagrams,
  };
};
