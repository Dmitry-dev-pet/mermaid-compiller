import { useCallback, type RefObject } from 'react';
import type { ScrollSyncMeasure, ScrollSyncPayload } from '../studio/useScrollSync';
import { useScrollSync } from '../studio/useScrollSync';
import { useMarkdownMermaidOffsets } from './useMarkdownMermaidOffsets';

type UsePreviewScrollSyncArgs = {
  isScrollSyncEnabled: boolean;
  isMarkdownMode: boolean;
  markdownMountRef: RefObject<HTMLDivElement>;
  scrollSyncPayload: ScrollSyncPayload | null;
  onScrollSync: (payload: ScrollSyncMeasure) => void;
};

export const usePreviewScrollSync = ({
  isScrollSyncEnabled,
  isMarkdownMode,
  markdownMountRef,
  scrollSyncPayload,
  onScrollSync,
}: UsePreviewScrollSyncArgs) => {
  const { refreshOffsets, resolveBlockIndex, getOffset } = useMarkdownMermaidOffsets();
  const canSyncScroll = isScrollSyncEnabled && isMarkdownMode;

  const handleHoverSync = useCallback((index: number) => {
    if (!canSyncScroll) return;
    const container = markdownMountRef.current;
    if (!container) return;
    onScrollSync({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      blockIndex: index,
    });
  }, [canSyncScroll, markdownMountRef, onScrollSync]);

  const { handleScrollSync: handleMarkdownScroll } = useScrollSync({
    enabled: canSyncScroll,
    source: 'preview',
    scrollRef: markdownMountRef,
    scrollSyncPayload,
    onScrollSync,
    resolveBlockIndex,
    getBlockOffset: (index) => getOffset(index),
  });

  const refreshPreviewOffsets = useCallback(() => {
    const container = markdownMountRef.current;
    if (!container) return;
    refreshOffsets(container);
  }, [markdownMountRef, refreshOffsets]);

  return {
    handleHoverSync,
    handleMarkdownScroll,
    refreshPreviewOffsets,
  };
};
