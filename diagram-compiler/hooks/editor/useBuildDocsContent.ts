import { DocsMode, PromptPreviewMode, PromptPreviewTab } from '../../types';
import type { DocsEntry } from '../../services/docsContextService';

type UseBuildDocsContentArgs = {
  docsMode: DocsMode;
  promptPreviewByMode: Record<PromptPreviewMode, PromptPreviewTab | null>;
  intentText?: string;
  analyzeCode?: string;
  fixDetailsText?: string;
  activeDocEntry?: DocsEntry;
  isSystemPromptRaw: boolean;
  activeBuildDocName: string;
};

export const useBuildDocsContent = ({
  docsMode,
  promptPreviewByMode,
  intentText,
  analyzeCode,
  fixDetailsText,
  activeDocEntry,
  isSystemPromptRaw,
  activeBuildDocName,
}: UseBuildDocsContentArgs) => {
  const analyzePreview = analyzeCode?.trim() ?? '';
  const fixPreview = fixDetailsText?.trim() ?? '';
  const intentPreview = docsMode === 'analyze'
    ? analyzePreview
    : docsMode === 'fix'
      ? fixPreview
      : (intentText || '');
  const docsPreview = activeDocEntry?.text || '';
  const rawPromptPreview = promptPreviewByMode[docsMode]?.rawContent || '';
  const topPanelTitle = isSystemPromptRaw
    ? `LLM request (${docsMode})`
    : activeBuildDocName;
  const topPanelText = isSystemPromptRaw
    ? rawPromptPreview
    : docsPreview;

  return {
    intentPreview,
    topPanelTitle,
    topPanelText,
  };
};
