import React from 'react';
import DiagramWhiteboard from '../DiagramWhiteboard';

type NotebookTilesSurfaceProps = Omit<React.ComponentProps<typeof DiagramWhiteboard>, 'key'> & {
  surfaceKey: string;
};

const NotebookTilesSurface: React.FC<NotebookTilesSurfaceProps> = ({ surfaceKey, ...props }) => {
  return <DiagramWhiteboard key={surfaceKey} {...props} />;
};

export default NotebookTilesSurface;
