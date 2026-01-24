import { useMemo } from 'react';

export type PreviewContentMode =
  | 'buildDocs'
  | 'whiteboard'
  | 'notebookTiles'
  | 'markdown'
  | 'svg'
  | 'empty';

export type PreviewContentModeModel = {
  mode: PreviewContentMode;
  showZoomControls: boolean;
  canExport: boolean;
  canScrollSync: boolean;
};

type UsePreviewContentModeArgs = {
  isBuildDocsMode: boolean;
  previewMode: 'preview' | 'whiteboard';
  isNotebookExcalidrawMode: boolean;
  isMarkdownMode: boolean;
  svgMarkup: string;
  codeForRender: string;
};

export const usePreviewContentMode = ({
  isBuildDocsMode,
  previewMode,
  isNotebookExcalidrawMode,
  isMarkdownMode,
  svgMarkup,
  codeForRender,
}: UsePreviewContentModeArgs): PreviewContentModeModel => {
  return useMemo(() => {
    let mode: PreviewContentMode = 'empty';
    if (isBuildDocsMode) {
      mode = 'buildDocs';
    } else if (previewMode === 'whiteboard') {
      mode = 'whiteboard';
    } else if (isMarkdownMode && isNotebookExcalidrawMode) {
      mode = 'notebookTiles';
    } else if (isMarkdownMode) {
      mode = 'markdown';
    } else if (svgMarkup) {
      mode = 'svg';
    } else if (codeForRender.trim()) {
      mode = 'svg';
    } else {
      mode = 'empty';
    }

    const showZoomControls = mode === 'svg' && Boolean(svgMarkup);
    const canExport = mode === 'svg' && Boolean(svgMarkup);
    const canScrollSync = mode === 'markdown';

    return { mode, showZoomControls, canExport, canScrollSync };
  }, [
    codeForRender,
    isBuildDocsMode,
    isMarkdownMode,
    isNotebookExcalidrawMode,
    previewMode,
    svgMarkup,
  ]);
};
