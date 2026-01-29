import React from 'react';
import App from './App';
import ShareViewer from './components/ShareViewer';

const parseShareToken = (): string | null => {
  const path = window.location.pathname || '/';
  const match = path.match(/^\/share\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
};

const Root: React.FC = () => {
  const shareToken = parseShareToken();
  if (shareToken) {
    return <ShareViewer token={shareToken} />;
  }
  return <App />;
};

export default Root;

