import React from 'react';

interface GlassPillProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const GlassPill: React.FC<GlassPillProps> = ({ className = '', children, ...props }) => {
  return (
    <div
      className={`rounded-[var(--radius-chip)] bg-[var(--glass-floating-bg)] border-[var(--glass-floating-border)] backdrop-filter-[var(--glass-floating-blur)] shadow-[var(--glass-floating-top-edge)] px-3 py-1 flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
