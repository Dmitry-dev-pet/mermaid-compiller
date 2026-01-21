import { useEffect, useMemo } from 'react';
import type { DocsEntry } from '../../services/docsContextService';
import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import { getSystemPromptPath, isSystemPromptPath } from '../../utils/systemPrompts';
import { buildSystemPrompt } from '../../services/llm/prompts';
import { isPromptsVirtualPath, PROMPTS_VIRTUAL_SYSTEM_PATH } from '../../utils/promptsVirtualPaths';

type BuildDocsPanelState = {
  docsMode: DocsMode;
  analyzeLanguage: string;
  appLanguage: string;
  buildDocsScope?: 'notebook' | 'diagram' | null;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  systemPromptRawByMode: Record<DocsMode, boolean>;
  buildDocsEntries: DocsEntry[];
  buildDocsActivePath: string;
  onBuildDocsActivePathChange: (path: string) => void;
};

const resolvePromptLang = (language?: string) => {
  if (!language) return 'en';
  if (language.toLowerCase().includes('ru') || language.toLowerCase().includes('рус')) return 'ru';
  if (language.toLowerCase().includes('en') || language.toLowerCase().includes('анг')) return 'en';
  return language.toLowerCase() === 'russian' ? 'ru' : 'en';
};

const resolveSelectedLanguage = (analyzeLanguage: string, appLanguage: string, promptLanguage?: string) => {
  if (analyzeLanguage && analyzeLanguage !== 'auto') {
    return resolvePromptLang(analyzeLanguage);
  }
  if (appLanguage && appLanguage !== 'auto') {
    return resolvePromptLang(appLanguage);
  }
  return resolvePromptLang(promptLanguage);
};

export const useBuildDocsState = ({
  docsMode,
  analyzeLanguage,
  appLanguage,
  buildDocsScope = null,
  promptPreviewByMode,
  systemPromptRawByMode,
  buildDocsEntries,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
}: BuildDocsPanelState) => {
  const activePrompt = useMemo(() => {
    if (docsMode === 'chat') return promptPreviewByMode.chat;
    if (docsMode === 'build') return promptPreviewByMode.build;
    if (docsMode === 'plan') return promptPreviewByMode.plan;
    if (docsMode === 'analyze') return promptPreviewByMode.analyze;
    return promptPreviewByMode.fix;
  }, [docsMode, promptPreviewByMode.analyze, promptPreviewByMode.build, promptPreviewByMode.chat, promptPreviewByMode.fix, promptPreviewByMode.plan]);

  const systemPromptLang = resolveSelectedLanguage(analyzeLanguage, appLanguage, activePrompt?.language);
  const systemPromptPath = getSystemPromptPath(systemPromptLang, docsMode);
  const isSystemPromptRaw = systemPromptRawByMode[docsMode] ?? false;
  const fallbackLanguage = systemPromptLang === 'ru' ? 'Russian' : 'English';
  const fallbackMode =
    docsMode === 'plan'
      ? 'plan_notebook'
      : docsMode === 'build'
        ? 'generate'
        : docsMode === 'chat'
          ? buildDocsScope === 'diagram'
            ? 'chat_diagram'
            : buildDocsScope === 'notebook'
              ? 'chat_notebook'
              : 'chat'
          : docsMode;
  const fallbackPrompt = buildSystemPrompt(fallbackMode, {
    docsContext: 'Documentation context redacted.',
    language: fallbackLanguage,
  });
  const systemPromptContent = (() => {
    const fromPreview = isSystemPromptRaw
      ? activePrompt?.systemPrompt ?? ''
      : activePrompt?.systemPromptRedacted ?? activePrompt?.systemPrompt ?? '';
    if (fromPreview) return fromPreview;
    return fallbackPrompt;
  })();
  const systemPromptEntry: DocsEntry = {
    path: systemPromptPath,
    text: systemPromptContent || 'No system prompt available.',
  };

  const activeBuildDoc = useMemo(
    () => buildDocsEntries.find((entry) => entry.path === buildDocsActivePath) ?? buildDocsEntries[0],
    [buildDocsActivePath, buildDocsEntries]
  );
  const isActiveSystemPrompt = isSystemPromptPath(buildDocsActivePath);
  const activeDocEntry = isActiveSystemPrompt ? systemPromptEntry : activeBuildDoc;
  const activeBuildDocName = activeDocEntry?.path && isSystemPromptPath(activeDocEntry.path)
    ? systemPromptEntry.path.split('/').pop() || systemPromptEntry.path
    : activeDocEntry?.path.split('/').pop() || activeDocEntry?.path || 'Docs';

  useEffect(() => {
    if (!buildDocsEntries.length) {
      if (buildDocsActivePath !== PROMPTS_VIRTUAL_SYSTEM_PATH) {
        onBuildDocsActivePathChange(PROMPTS_VIRTUAL_SYSTEM_PATH);
      }
      return;
    }

    if (!buildDocsActivePath) {
      onBuildDocsActivePathChange(buildDocsEntries[0]?.path ?? '');
      return;
    }

    if (isPromptsVirtualPath(buildDocsActivePath)) return;
    if (isSystemPromptPath(buildDocsActivePath)) return;
    if (buildDocsEntries.some((entry) => entry.path === buildDocsActivePath)) return;
    onBuildDocsActivePathChange(buildDocsEntries[0]?.path ?? '');
  }, [buildDocsActivePath, buildDocsEntries, onBuildDocsActivePathChange, systemPromptPath]);

  return {
    systemPromptEntry,
    systemPromptPath,
    systemPromptLang,
    isSystemPromptRaw,
    activeDocEntry,
    activeBuildDocName,
    isActiveSystemPrompt,
  };
};
