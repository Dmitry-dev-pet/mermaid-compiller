import { useEffect, useState, type RefObject } from 'react';

type Args = {
  initialSize: number;
  minSize: number;
  maxOffset: number;
  containerRef: RefObject<HTMLElement>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useResizablePane = ({ initialSize, minSize, maxOffset, containerRef }: Args) => {
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (event: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      const maxSize = Math.max(minSize, rect.height - maxOffset);
      setSize(clamp(nextHeight, minSize, maxSize));
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [containerRef, isResizing, maxOffset, minSize]);

  const onResizeStart = () => setIsResizing(true);

  return { size, setSize, isResizing, onResizeStart };
};
