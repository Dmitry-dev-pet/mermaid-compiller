import { useEffect, useMemo } from 'react';
import type { DocsEntry } from '../../services/docsContextService';
import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import { getSystemPromptPath, isSystemPromptPath } from '../../utils/systemPrompts';

type BuildDocsPanelState = {
  docsPanel: 'mode' | 'all';
  docsMode: DocsMode;
  analyzeLanguage: string;
  appLanguage: string;
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
  docsPanel,
  docsMode,
  analyzeLanguage,
  appLanguage,
  promptPreviewByMode,
  systemPromptRawByMode,
  buildDocsEntries,
  buildDocsActivePath,
  onBuildDocsActivePathChange,
}: BuildDocsPanelState) => {
  const activePrompt = useMemo(() => {
    if (docsMode === 'chat') return promptPreviewByMode.chat;
    if (docsMode === 'build') return promptPreviewByMode.build;
    if (docsMode === 'analyze') return promptPreviewByMode.analyze;
    return promptPreviewByMode.fix;
  }, [docsMode, promptPreviewByMode.analyze, promptPreviewByMode.build, promptPreviewByMode.chat, promptPreviewByMode.fix]);

  const systemPromptLang = resolveSelectedLanguage(analyzeLanguage, appLanguage, activePrompt?.language);
  const systemPromptPath = getSystemPromptPath(systemPromptLang, docsMode);
  const isSystemPromptRaw = systemPromptRawByMode[docsMode] ?? false;
  const systemPromptContent = isSystemPromptRaw
    ? activePrompt?.systemPrompt ?? ''
    : activePrompt?.systemPromptRedacted ?? activePrompt?.systemPrompt ?? '';
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
    if (docsPanel !== 'all') return;
    if (!buildDocsEntries.length) return;
    if (isSystemPromptPath(buildDocsActivePath)) {
      onBuildDocsActivePathChange(buildDocsEntries[0]?.path ?? '');
    }
  }, [buildDocsActivePath, buildDocsEntries, docsPanel, onBuildDocsActivePathChange]);

  useEffect(() => {
    if (!buildDocsEntries.length) {
      onBuildDocsActivePathChange(systemPromptPath);
      return;
    }
    if (isSystemPromptPath(buildDocsActivePath)) {
      if (buildDocsActivePath !== systemPromptPath) {
        onBuildDocsActivePathChange(systemPromptPath);
      }
      return;
    }
    if (buildDocsActivePath && buildDocsEntries.some((entry) => entry.path === buildDocsActivePath)) return;
    onBuildDocsActivePathChange(systemPromptPath);
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
