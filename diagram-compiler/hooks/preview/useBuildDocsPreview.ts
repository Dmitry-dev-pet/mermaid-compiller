import type MarkdownIt from 'markdown-it';
import { useCallback, useMemo } from 'react';
import { getSystemPromptModeFromPath, isSystemPromptPath } from '../../utils/systemPrompts';
import {
  PROMPTS_VIRTUAL_INTENT_PATH,
  PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH,
  PROMPTS_VIRTUAL_SYSTEM_PATH,
} from '../../utils/promptsVirtualPaths';
import type { BuildDocsSystemPrompts, DocsMode, SystemPromptRawByMode } from '../../types';

type BuildDocsEntry = { path: string; text: string };

type UseBuildDocsPreviewArgs = {
  isBuildDocsMode: boolean;
  buildDocsActivePath: string;
  buildDocsEntries: BuildDocsEntry[];
  buildDocsSystemPrompts: BuildDocsSystemPrompts;
  systemPromptRawByMode: SystemPromptRawByMode;
  docsMode: DocsMode;
  buildDocsRequestPreviewText: string;
  buildDocsRequestPreviewRawText: string;
  buildDocsIntentPreviewText: string;
  buildDocsNotebookPlanText: string;
  markdownRenderer: MarkdownIt;
};

export const useBuildDocsPreview = ({
  isBuildDocsMode,
  buildDocsActivePath,
  buildDocsEntries,
  buildDocsSystemPrompts,
  systemPromptRawByMode,
  docsMode,
  buildDocsRequestPreviewText,
  buildDocsRequestPreviewRawText,
  buildDocsIntentPreviewText,
  buildDocsNotebookPlanText,
  markdownRenderer,
}: UseBuildDocsPreviewArgs) => {
  const resolveSystemPromptForPath = useCallback((path: string) => {
    const mode = getSystemPromptModeFromPath(path);
    if (!mode) return '';
    const useRaw = systemPromptRawByMode[mode] ?? false;
    const prompt = useRaw ? buildDocsSystemPrompts[mode]?.raw : buildDocsSystemPrompts[mode]?.redacted;
    return prompt || buildDocsSystemPrompts[mode]?.raw || 'No system prompt available.';
  }, [buildDocsSystemPrompts, systemPromptRawByMode]);

  const activeBuildDoc = useMemo(() => {
    if (buildDocsActivePath === PROMPTS_VIRTUAL_SYSTEM_PATH) {
      const useRaw = systemPromptRawByMode[docsMode] ?? false;
      const preview = useRaw ? buildDocsRequestPreviewRawText : buildDocsRequestPreviewText;
      const fallback = useRaw ? buildDocsRequestPreviewText : buildDocsRequestPreviewRawText;
      const text = preview?.trim() ? preview : (fallback?.trim() ? fallback : 'No preview available yet.');
      return { path: buildDocsActivePath, text };
    }

    if (buildDocsActivePath === PROMPTS_VIRTUAL_INTENT_PATH) {
      const text = buildDocsIntentPreviewText?.trim() ? buildDocsIntentPreviewText : 'Intent is not available yet.';
      return { path: buildDocsActivePath, text };
    }

    if (buildDocsActivePath === PROMPTS_VIRTUAL_NOTEBOOK_PLAN_PATH) {
      const text = buildDocsNotebookPlanText?.trim() ? buildDocsNotebookPlanText : 'Notebook plan is not available yet.';
      return { path: buildDocsActivePath, text };
    }

    if (isSystemPromptPath(buildDocsActivePath)) {
      return { path: buildDocsActivePath, text: resolveSystemPromptForPath(buildDocsActivePath) };
    }

    return buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0];
  }, [
    buildDocsActivePath,
    buildDocsEntries,
    buildDocsIntentPreviewText,
    buildDocsNotebookPlanText,
    buildDocsRequestPreviewRawText,
    buildDocsRequestPreviewText,
    buildDocsSystemPrompts,
    docsMode,
    resolveSystemPromptForPath,
    systemPromptRawByMode,
  ]);

  const buildDocsHtml = useMemo(() => {
    if (!isBuildDocsMode) return '';
    const content = activeBuildDoc?.text ?? '';
    return content.trim() ? markdownRenderer.render(content) : '';
  }, [activeBuildDoc?.text, isBuildDocsMode, markdownRenderer]);

  return {
    activeBuildDoc,
    buildDocsHtml,
  };
};
