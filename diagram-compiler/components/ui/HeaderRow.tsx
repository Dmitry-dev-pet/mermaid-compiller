import React from 'react';

type HeaderRowProps = {
  left?: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  leftClassName?: string;
  centerClassName?: string;
  rightClassName?: string;
};

const baseRow = 'flex items-center justify-between gap-3 min-w-0 min-h-7';
const baseSlot = 'flex items-center gap-2 min-w-0 min-h-7';

const HeaderRow: React.FC<HeaderRowProps> = ({
  left,
  center,
  right,
  className = '',
  leftClassName = '',
  centerClassName = '',
  rightClassName = '',
}) => {
  return (
    <div className={`${baseRow} ${className}`.trim()}>
      <div className={`${baseSlot} ${leftClassName}`.trim()}>{left}</div>
      <div className={`${baseSlot} ${centerClassName}`.trim()}>{center}</div>
      <div className={`${baseSlot} shrink-0 ${rightClassName}`.trim()}>{right}</div>
    </div>
  );
};

export default HeaderRow;
