import React from 'react';
import { Code2, PenLine, Pencil } from 'lucide-react';
import ModeToggle from '../ui/ModeToggle';

type PreviewHeaderPinnedModeProps = {
  pinnedMode: 'mermaid' | 'ed';
  pinnedCanEd: boolean;
  pinnedDirty: boolean;
  pinnedEdDisabledReason: string | null;
  onSetPinnedMode: (next: 'mermaid' | 'ed') => void;
};

const PreviewHeaderPinnedMode: React.FC<PreviewHeaderPinnedModeProps> = ({
  pinnedMode,
  pinnedCanEd,
  pinnedDirty,
  pinnedEdDisabledReason,
  onSetPinnedMode,
}) => {
  const edLabelStyle = {
    fontFamily: '"Bradley Hand", "Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive',
  } as const;

  return (
    <ModeToggle
      options={[
        {
          id: 'mermaid',
          label: (
            <>
              <Code2 size={12} />
              Mermaid
            </>
          ),
          title: 'Mermaid',
          active: pinnedMode === 'mermaid',
          onClick: () => onSetPinnedMode('mermaid'),
        },
        {
          id: 'ed',
          label: (
            <>
              <PenLine size={12} />
              <span className="italic" style={edLabelStyle}>Excalidraw</span>
              <span className="ml-1 inline-flex items-center text-[9px] text-slate-500 dark:text-slate-300">
                <Pencil size={9} />
              </span>
              <span
                className={`ml-1 inline-flex h-2 w-2 rounded-full ${
                  pinnedMode === 'ed'
                    ? pinnedDirty
                      ? 'bg-amber-500 dark:bg-amber-300'
                      : 'bg-emerald-500/70 dark:bg-emerald-300/70'
                    : pinnedDirty
                      ? 'bg-amber-500/70 dark:bg-amber-300/70'
                      : 'bg-transparent'
                }`}
                aria-hidden
              />
            </>
          ),
          title: pinnedCanEd ? 'Excalidraw' : (pinnedEdDisabledReason ?? 'Excalidraw is unavailable'),
          active: pinnedMode === 'ed',
          disabled: !pinnedCanEd,
          onClick: () => {
            if (!pinnedCanEd) return;
            onSetPinnedMode('ed');
          },
        },
      ]}
    />
  );
};

export default PreviewHeaderPinnedMode;
