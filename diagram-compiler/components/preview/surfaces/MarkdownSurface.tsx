import React from 'react';

type MarkdownSurfaceProps = {
  viewportRef: React.RefObject<HTMLDivElement>;
  markdownMountRef: React.RefObject<HTMLDivElement>;
  onMarkdownScroll?: () => void;
};

const MarkdownSurface: React.FC<MarkdownSurfaceProps> = ({
  viewportRef,
  markdownMountRef,
  onMarkdownScroll,
}) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      <div
        ref={markdownMountRef}
        onScroll={onMarkdownScroll}
        className="markdown-body absolute inset-0 overflow-auto p-4 text-sm text-slate-700 dark:text-slate-200 leading-6"
      />
    </div>
  );
};

export default MarkdownSurface;
