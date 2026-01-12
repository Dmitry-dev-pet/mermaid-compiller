import { DocsMode } from '../../types';
import type { DocsEntry } from '../../services/docsContextService';

type UseBuildDocsContentArgs = {
  docsMode: DocsMode;
  intentText?: string;
  analyzeCode?: string;
  fixDetailsText?: string;
  activeDocEntry?: DocsEntry;
  activeBuildDocName: string;
};

export const useBuildDocsContent = ({
  docsMode,
  intentText,
  analyzeCode,
  fixDetailsText,
  activeDocEntry,
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
  const topPanelTitle = activeBuildDocName;
  const topPanelText = docsPreview;

  return {
    intentPreview,
    topPanelTitle,
    topPanelText,
  };
};
