import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type ScrollSyncSource = 'editor' | 'preview';
export type ScrollSyncMode = 'ratio' | 'block';

export type ScrollSyncPayload = {
  source: ScrollSyncSource;
  mode: ScrollSyncMode;
  ratio?: number;
  blockIndex?: number;
  nonce: number;
};

export type ScrollSyncMeasure = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  blockIndex?: number;
};

type UseScrollSyncOptions = {
  enabled: boolean;
  source: ScrollSyncSource;
  scrollRef: RefObject<HTMLElement>;
  scrollSyncPayload: ScrollSyncPayload | null;
  onScrollSync: (payload: ScrollSyncMeasure) => void;
  resolveBlockIndex?: (scrollTop: number) => number | null;
  getBlockOffset?: (index: number) => number | null | undefined;
  cooldownMs?: number;
  ignoreDurationMs?: number;
  blockBypassCooldown?: boolean;
};

export const useScrollSync = ({
  enabled,
  source,
  scrollRef,
  scrollSyncPayload,
  onScrollSync,
  resolveBlockIndex,
  getBlockOffset,
  cooldownMs = 300,
  ignoreDurationMs = 500,
  blockBypassCooldown = false,
}: UseScrollSyncOptions) => {
  const ignoreSyncScrollRef = useRef(false);
  const syncRafRef = useRef<number | null>(null);
  const pendingSyncRef = useRef<ScrollSyncMeasure | null>(null);
  const lastOutgoingSyncRef = useRef(0);
  const ignoreTimerRef = useRef<number | null>(null);

  const clearIgnoreTimer = useCallback(() => {
    if (ignoreTimerRef.current !== null) {
      window.clearTimeout(ignoreTimerRef.current);
      ignoreTimerRef.current = null;
    }
  }, []);

  const setIgnoreSync = useCallback(() => {
    ignoreSyncScrollRef.current = true;
    clearIgnoreTimer();
    ignoreTimerRef.current = window.setTimeout(() => {
      ignoreSyncScrollRef.current = false;
      ignoreTimerRef.current = null;
    }, ignoreDurationMs);
  }, [clearIgnoreTimer, ignoreDurationMs]);

  const handleScrollSync = useCallback(() => {
    if (ignoreSyncScrollRef.current) return;
    if (!enabled) return;
    const container = scrollRef.current;
    if (!container) return;

    const blockIndex = resolveBlockIndex ? resolveBlockIndex(container.scrollTop) : null;
    pendingSyncRef.current = {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    };
    if (typeof blockIndex === 'number') {
      pendingSyncRef.current.blockIndex = blockIndex;
    }
    lastOutgoingSyncRef.current = Date.now();
    if (syncRafRef.current === null) {
      syncRafRef.current = window.requestAnimationFrame(() => {
        syncRafRef.current = null;
        if (pendingSyncRef.current) {
          onScrollSync(pendingSyncRef.current);
          pendingSyncRef.current = null;
        }
      });
    }
  }, [enabled, onScrollSync, resolveBlockIndex, scrollRef]);

  useEffect(() => {
    if (!enabled) return;
    if (!scrollSyncPayload || scrollSyncPayload.source === source) return;
    const container = scrollRef.current;
    if (!container) return;

    const allowIncoming =
      blockBypassCooldown || Date.now() - lastOutgoingSyncRef.current >= cooldownMs;

    if (scrollSyncPayload.mode === 'block' && typeof scrollSyncPayload.blockIndex === 'number') {
      if (!blockBypassCooldown && !allowIncoming) return;
      const target = getBlockOffset?.(scrollSyncPayload.blockIndex);
      if (typeof target === 'number') {
        setIgnoreSync();
        container.scrollTo({ top: target, behavior: 'auto' });
      }
      return;
    }

    if (!allowIncoming) return;
    if (scrollSyncPayload.mode === 'ratio' && typeof scrollSyncPayload.ratio === 'number') {
      const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
      setIgnoreSync();
      container.scrollTo({ top: scrollSyncPayload.ratio * maxScroll, behavior: 'auto' });
    }
  }, [
    blockBypassCooldown,
    cooldownMs,
    enabled,
    getBlockOffset,
    scrollRef,
    scrollSyncPayload,
    setIgnoreSync,
    source,
  ]);

  useEffect(() => {
    return () => {
      if (syncRafRef.current !== null) {
        window.cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
      pendingSyncRef.current = null;
      clearIgnoreTimer();
    };
  }, [clearIgnoreTimer]);

  return {
    handleScrollSync,
  };
};
