import { useCallback, useRef } from 'react';
import { resolveActiveMarkdownBlockIndex } from '../../utils/markdownBlocks';

export const useMarkdownMermaidOffsets = () => {
  const offsetsRef = useRef<number[]>([]);

  const refreshOffsets = useCallback((container: HTMLElement) => {
    const elements = Array.from(container.querySelectorAll<HTMLElement>('.markdown-mermaid-block'));
    const containerRect = container.getBoundingClientRect();
    const offsets: number[] = [];
    for (const element of elements) {
      const indexToken = element.dataset.mermaidIndex;
      const index = indexToken ? Number(indexToken) : NaN;
      if (!Number.isFinite(index)) continue;
      const rect = element.getBoundingClientRect();
      const offset = rect.top - containerRect.top + container.scrollTop;
      offsets[index] = offset;
    }
    offsetsRef.current = offsets;
  }, []);

  const resolveBlockIndex = useCallback(
    (scrollTop: number) => resolveActiveMarkdownBlockIndex(offsetsRef.current, scrollTop),
    []
  );

  const getOffset = useCallback((index: number) => offsetsRef.current[index], []);

  return {
    offsetsRef,
    refreshOffsets,
    resolveBlockIndex,
    getOffset,
  };
};
