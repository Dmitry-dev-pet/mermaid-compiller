import React from 'react';

type BuildDocsSurfaceProps = {
  viewportRef: React.RefObject<HTMLDivElement>;
  docsMountRef: React.RefObject<HTMLDivElement>;
  hasBuildDocs: boolean;
};

const BuildDocsSurface: React.FC<BuildDocsSurfaceProps> = ({
  viewportRef,
  docsMountRef,
  hasBuildDocs,
}) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      <div className="absolute inset-0 overflow-auto text-sm text-slate-700 dark:text-slate-200 leading-6 p-4">
        {hasBuildDocs ? (
          <div ref={docsMountRef} className="markdown-body" />
        ) : (
          <div className="text-slate-400 dark:text-slate-500 text-sm">No documentation loaded.</div>
        )}
      </div>
    </div>
  );
};

export default BuildDocsSurface;
