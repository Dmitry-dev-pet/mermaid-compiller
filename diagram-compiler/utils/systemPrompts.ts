import { DocsMode } from '../types';
import { DOCS_MODE_ORDER } from './docsModes';

export const SYSTEM_PROMPT_DOC_PREFIX = 'system-prompts/';

const SYSTEM_PROMPT_MODES: DocsMode[] = DOCS_MODE_ORDER;

export const isSystemPromptPath = (path: string) => path.startsWith(SYSTEM_PROMPT_DOC_PREFIX);

export const getSystemPromptPath = (language: string, mode: DocsMode) =>
  `${SYSTEM_PROMPT_DOC_PREFIX}${language}/${mode}.md`;

export const getSystemPromptModeFromPath = (path: string): DocsMode | null => {
  if (!isSystemPromptPath(path)) return null;
  const fileName = path.replace(SYSTEM_PROMPT_DOC_PREFIX, '').split('/').pop() ?? '';
  const mode = fileName.replace(/\.md$/, '');
  return SYSTEM_PROMPT_MODES.includes(mode as DocsMode) ? (mode as DocsMode) : null;
};
