import React from 'react';

type EmptySurfaceProps = {
  viewportRef: React.RefObject<HTMLDivElement>;
};

const EmptySurface: React.FC<EmptySurfaceProps> = ({ viewportRef }) => {
  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center"
    >
      <div className="text-slate-400 dark:text-slate-500 text-sm">No valid diagram to display.</div>
    </div>
  );
};

export default EmptySurface;
