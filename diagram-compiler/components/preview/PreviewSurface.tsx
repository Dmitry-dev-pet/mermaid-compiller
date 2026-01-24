import React from 'react';
import type { PreviewContentMode } from '../../hooks/preview/usePreviewContentMode';
import SvgSurface from './surfaces/SvgSurface';
import MarkdownSurface from './surfaces/MarkdownSurface';
import BuildDocsSurface from './surfaces/BuildDocsSurface';
import WhiteboardSurface from './surfaces/WhiteboardSurface';
import NotebookTilesSurface from './surfaces/NotebookTilesSurface';
import EmptySurface from './surfaces/EmptySurface';

type PreviewSurfaceProps = {
  mode: PreviewContentMode;
  svgProps: React.ComponentProps<typeof SvgSurface>;
  markdownProps: React.ComponentProps<typeof MarkdownSurface>;
  buildDocsProps: React.ComponentProps<typeof BuildDocsSurface>;
  whiteboardProps: React.ComponentProps<typeof WhiteboardSurface>;
  notebookTilesProps: React.ComponentProps<typeof NotebookTilesSurface>;
  emptyProps: React.ComponentProps<typeof EmptySurface>;
};

const PreviewSurface: React.FC<PreviewSurfaceProps> = ({
  mode,
  svgProps,
  markdownProps,
  buildDocsProps,
  whiteboardProps,
  notebookTilesProps,
  emptyProps,
}) => {
  switch (mode) {
    case 'buildDocs':
      return <BuildDocsSurface {...buildDocsProps} />;
    case 'whiteboard':
      return <WhiteboardSurface {...whiteboardProps} />;
    case 'notebookTiles':
      return <NotebookTilesSurface {...notebookTilesProps} />;
    case 'markdown':
      return <MarkdownSurface {...markdownProps} />;
    case 'svg':
      return <SvgSurface {...svgProps} />;
    case 'empty':
    default:
      return <EmptySurface {...emptyProps} />;
  }
};

export default PreviewSurface;
