import React from 'react';
import DiagramWhiteboard from '../DiagramWhiteboard';

type WhiteboardSurfaceProps = Omit<React.ComponentProps<typeof DiagramWhiteboard>, 'key'> & {
  surfaceKey: string;
};

const WhiteboardSurface: React.FC<WhiteboardSurfaceProps> = ({ surfaceKey, ...props }) => {
  return <DiagramWhiteboard key={surfaceKey} {...props} />;
};

export default WhiteboardSurface;
