import type { DocsMode, PromptPreviewMode } from '../types';

export const DOCS_MODE_ORDER: DocsMode[] = ['chat', 'build', 'plan', 'analyze', 'fix'];

export const DOCS_MODE_ORDER_WITHOUT_PLAN: DocsMode[] = ['chat', 'build', 'analyze', 'fix'];

export const PROMPT_PREVIEW_MODE_ORDER: PromptPreviewMode[] = DOCS_MODE_ORDER;

