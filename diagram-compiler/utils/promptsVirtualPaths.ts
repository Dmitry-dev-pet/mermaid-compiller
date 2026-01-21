export const PROMPTS_VIRTUAL_SYSTEM_PATH = 'prompts/system.md';
export const PROMPTS_VIRTUAL_INTENT_PATH = 'prompts/intent.md';
export const PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH = 'prompts/notebook-plan.md';

export const PROMPTS_VIRTUAL_ENTRIES = [
  { path: PROMPTS_VIRTUAL_SYSTEM_PATH, label: 'System' },
  { path: PROMPTS_VIRTUAL_INTENT_PATH, label: 'Intent' },
  { path: PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH, label: 'Notebook plan' },
] as const;

export const isPromptsVirtualPath = (path: string) =>
  path === PROMPTS_VIRTUAL_SYSTEM_PATH
  || path === PROMPTS_VIRTUAL_INTENT_PATH
  || path === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH;

export const getPromptsVirtualLabel = (path: string): string | null => {
  if (path === PROMPTS_VIRTUAL_SYSTEM_PATH) return 'System';
  if (path === PROMPTS_VIRTUAL_INTENT_PATH) return 'Intent';
  if (path === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH) return 'Notebook plan';
  return null;
};
