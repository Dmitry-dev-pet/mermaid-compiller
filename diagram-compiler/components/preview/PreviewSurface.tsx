import React from 'react';
import type { PreviewContentMode } from '../../hooks/preview/usePreviewContentMode';
import SvgSurface from './surfaces/SvgSurface';
import MarkdownSurface from './surfaces/MarkdownSurface';
import BuildDocsSurface from './surfaces/BuildDocsSurface';
import EmptySurface from './surfaces/EmptySurface';

type WhiteboardSurfaceComponent = typeof import('./surfaces/WhiteboardSurface').default;
type NotebookTilesSurfaceComponent = typeof import('./surfaces/NotebookTilesSurface').default;

const LazyWhiteboardSurface = React.lazy(() => import('./surfaces/WhiteboardSurface'));
const LazyNotebookTilesSurface = React.lazy(() => import('./surfaces/NotebookTilesSurface'));

type PreviewSurfaceProps = {
  mode: PreviewContentMode;
  svgProps: React.ComponentProps<typeof SvgSurface>;
  markdownProps: React.ComponentProps<typeof MarkdownSurface>;
  buildDocsProps: React.ComponentProps<typeof BuildDocsSurface>;
  whiteboardProps: React.ComponentProps<WhiteboardSurfaceComponent>;
  notebookTilesProps: React.ComponentProps<NotebookTilesSurfaceComponent>;
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
      return (
        <React.Suspense
          fallback={(
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <div className="text-slate-400 dark:text-slate-500 text-sm">Loading whiteboard…</div>
            </div>
          )}
        >
          <LazyWhiteboardSurface {...whiteboardProps} />
        </React.Suspense>
      );
    case 'notebookTiles':
      return (
        <React.Suspense
          fallback={(
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <div className="text-slate-400 dark:text-slate-500 text-sm">Loading notebook…</div>
            </div>
          )}
        >
          <LazyNotebookTilesSurface {...notebookTilesProps} />
        </React.Suspense>
      );
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
