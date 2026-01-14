import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import OperationLogTooltipContent from './operationLogTooltipContent';

type Props = {
  tooltipId: string;
  content: string;
  pinnedTooltip: string | null;
  setPinnedTooltip: React.Dispatch<React.SetStateAction<string | null>>;
  children: React.ReactNode;
};

type TooltipPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const VIEWPORT_PADDING = 8;
const TARGET_WIDTH_PX = 28 * 16; // 28rem
const TARGET_MAX_HEIGHT_PX = 16 * 16; // 16rem
const TOOLTIP_Z_INDEX = 2147483647;

const OperationLogTooltip: React.FC<Props> = ({
  tooltipId,
  content,
  pinnedTooltip,
  setPinnedTooltip,
  children,
}) => {
  const isPinned = pinnedTooltip === tooltipId;
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const shouldShowHoverHint = isHovering && !isPinned;
  const shouldRenderPortal = shouldShowHoverHint || isPinned;

  const computePosition = () => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.max(240, Math.min(TARGET_WIDTH_PX, viewportWidth - VIEWPORT_PADDING * 2));
    const maxHeight = Math.max(120, Math.min(TARGET_MAX_HEIGHT_PX, viewportHeight - VIEWPORT_PADDING * 2));

    // Default: below-left.
    let left = rect.left;
    let top = rect.bottom + 6;

    // Clamp horizontally.
    if (left + width > viewportWidth - VIEWPORT_PADDING) {
      // Prefer aligning tooltip's right edge with the trigger when we're near the viewport right edge.
      left = rect.right - width;
    }
    if (left + width > viewportWidth - VIEWPORT_PADDING) {
      left = viewportWidth - VIEWPORT_PADDING - width;
    }
    left = Math.max(VIEWPORT_PADDING, left);

    // Prefer below, but if it doesn't fit, place above.
    const estimatedHeight = Math.min(maxHeight, tooltipRef.current?.getBoundingClientRect().height ?? maxHeight);
    if (top + estimatedHeight > viewportHeight - VIEWPORT_PADDING) {
      top = rect.top - Math.min(estimatedHeight, maxHeight) - 8;
    }
    top = Math.max(VIEWPORT_PADDING, Math.min(top, viewportHeight - VIEWPORT_PADDING - Math.min(estimatedHeight, maxHeight)));

    return { top, left, width, maxHeight };
  };

  useLayoutEffect(() => {
    if (!shouldRenderPortal) return;
    setPosition(computePosition());
    const raf = window.requestAnimationFrame(() => setPosition(computePosition()));
    return () => window.cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRenderPortal, content]);

  useEffect(() => {
    if (!shouldRenderPortal) return;
    const handle = () => setPosition(computePosition());
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRenderPortal]);

  useEffect(() => {
    if (!isPinned) return;
    const onMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      const tooltip = tooltipRef.current;
      const target = event.target as Node | null;
      if (!target) return;
      if (root?.contains(target)) return;
      if (tooltip?.contains(target)) return;
      setPinnedTooltip(null);
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [isPinned, setPinnedTooltip]);

  const portalNode = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return document.body;
  }, []);

  const portalContent = shouldRenderPortal && portalNode && position
    ? createPortal(
        <div
          ref={tooltipRef}
          className="fixed text-[10px] text-[var(--control-text)]"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            zIndex: TOOLTIP_Z_INDEX,
          }}
          onClick={(event) => {
            // Allow interacting with the tooltip without toggling the pinned state.
            event.stopPropagation();
          }}
        >
          {shouldShowHoverHint ? (
            <div className="pointer-events-none select-none whitespace-nowrap rounded border border-[var(--panel-border)] bg-[var(--menu-bg)] px-2 py-1 shadow-lg">
              Нажмите для подробностей
            </div>
          ) : null}
          {isPinned ? (
            <div
              className="mt-1 overflow-auto overscroll-contain rounded border border-[var(--panel-border)] bg-[var(--menu-bg)] px-2 py-1 shadow-lg whitespace-pre-wrap"
              style={{ maxHeight: position.maxHeight }}
            >
              <OperationLogTooltipContent content={content} />
            </div>
          ) : null}
        </div>,
        portalNode
      )
    : null;

  return (
    <span
      ref={rootRef}
      className="inline-flex items-center gap-1 cursor-help"
      data-tooltip-root={tooltipId}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(event) => {
        event.stopPropagation();
        setPinnedTooltip((prev) => (prev === tooltipId ? null : tooltipId));
      }}
    >
      <span data-tooltip-id={tooltipId}>{children}</span>
      {portalContent}
    </span>
  );
};

export default OperationLogTooltip;
