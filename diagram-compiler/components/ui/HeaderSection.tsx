import React from 'react';

type HeaderSectionProps = {
  children: React.ReactNode;
  className?: string;
  tone?: 'primary' | 'secondary';
};

const toneClass: Record<NonNullable<HeaderSectionProps['tone']>, string> = {
  primary: 'text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider',
  secondary: 'text-[10px] font-medium text-slate-500 dark:text-slate-400 normal-case tracking-normal',
};

const HeaderSection: React.FC<HeaderSectionProps> = ({
  children,
  className = '',
  tone = 'primary',
}) => {
  return (
    <div className={`${toneClass[tone]} ${className}`.trim()}>
      {children}
    </div>
  );
};

export default HeaderSection;
