import React from 'react';
import { createPortal } from 'react-dom';

export type TooltipPlacement = 'top' | 'bottom';

type TooltipState = {
  isVisible: boolean;
  text: string;
  left: number;
  top: number;
  placement: TooltipPlacement;
};

const INITIAL_STATE: TooltipState = {
  isVisible: false,
  text: '',
  left: 0,
  top: 0,
  placement: 'top',
};

export const useFloatingTooltip = () => {
  const [tooltip, setTooltip] = React.useState<TooltipState>(INITIAL_STATE);

  const showTooltip = React.useCallback((event: React.MouseEvent<HTMLElement>, text: string) => {
    const x = event.clientX;
    const y = event.clientY;
    const placement: TooltipPlacement = y < 48 ? 'bottom' : 'top';
    setTooltip({
      isVisible: true,
      text,
      left: x,
      top: y,
      placement,
    });
  }, []);

  const hideTooltip = React.useCallback(() => {
    setTooltip((prev) => (prev.isVisible ? { ...prev, isVisible: false } : prev));
  }, []);

  const portal =
    tooltip.isVisible && typeof document !== 'undefined'
      ? createPortal(
          <div
            style={{
              position: 'fixed',
              left: tooltip.left,
              top: tooltip.top,
              transform: tooltip.placement === 'top' ? 'translate(-50%, -110%)' : 'translate(-50%, 10px)',
              background: 'rgba(15, 23, 42, 0.95)',
              color: 'white',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              pointerEvents: 'none',
              zIndex: 50,
              whiteSpace: 'nowrap',
              boxShadow: '0 6px 16px rgba(0,0,0,0.2)',
            }}
          >
            {tooltip.text}
          </div>,
          document.body
        )
      : null;

  return { showTooltip, hideTooltip, portal };
};
