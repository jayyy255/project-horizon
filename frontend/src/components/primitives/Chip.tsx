import React from 'react';

interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({ className = '', children, ...props }) => {
  return (
    <div
      className={`rounded-[var(--radius-chip)] bg-[var(--glass-base-bg)] border border-[var(--glass-base-border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 transition-colors duration-[var(--motion-smooth)] hover:text-[var(--text-primary)] hover:border-[var(--color-celestial)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
