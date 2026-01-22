import React from 'react';
import { Link2 } from 'lucide-react';
import { CONTROL_BASE } from '../../utils/uiControlStyles';
import { Button } from '../ui/Button';

type PreviewHeaderScrollSyncToggleProps = {
  isBuildDocsMode: boolean;
  showScrollSyncToggle: boolean;
  isScrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
};

const PreviewHeaderScrollSyncToggle: React.FC<PreviewHeaderScrollSyncToggleProps> = ({
  isBuildDocsMode,
  showScrollSyncToggle,
  isScrollSyncEnabled,
  onToggleScrollSync,
}) => {
  if (isBuildDocsMode || !showScrollSyncToggle) return null;

  return (
    <Button
      type="button"
      onClick={onToggleScrollSync}
      className={`h-7 px-2 rounded border transition-colors shrink-0 inline-flex items-center gap-1 text-[10px] font-medium ${
        isScrollSyncEnabled
          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
          : CONTROL_BASE
      }`}
      title={isScrollSyncEnabled ? 'Disable scroll sync' : 'Enable scroll sync'}
      aria-label={isScrollSyncEnabled ? 'Disable scroll sync' : 'Enable scroll sync'}
    >
      <Link2 size={14} />
      Scroll sync
    </Button>
  );
};

export default PreviewHeaderScrollSyncToggle;
