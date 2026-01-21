export const PROMPTS_VIRTUAL_SYSTEM_PATH = 'prompts/system.md';
export const PROMPTS_VIRTUAL_INTENT_PATH = 'prompts/intent.md';
export const PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH = 'prompts/notebook-plan.md';

export const isPromptsVirtualPath = (path: string) =>
  path === PROMPTS_VIRTUAL_SYSTEM_PATH
  || path === PROMPTS_VIRTUAL_INTENT_PATH
  || path === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH;
