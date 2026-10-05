import React from 'react';

type Level = 'base' | 'raised' | 'floating';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: Level;
  children: React.ReactNode;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({ level = 'base', className = '', children, ...props }) => {
  const getLevelStyles = () => {
    switch (level) {
      case 'raised':
        return 'bg-[var(--glass-raised-bg)] border-[var(--glass-raised-border)] backdrop-filter-[var(--glass-raised-blur)] shadow-[var(--glass-raised-top-edge)] rounded-[var(--radius-card)]';
      case 'floating':
        return 'bg-[var(--glass-floating-bg)] border-[var(--glass-floating-border)] backdrop-filter-[var(--glass-floating-blur)] shadow-[var(--glass-floating-top-edge)] rounded-[var(--radius-bar)]';
      case 'base':
      default:
        return 'bg-[var(--glass-base-bg)] border-[var(--glass-base-border)] backdrop-filter-[var(--glass-base-blur)] shadow-[var(--glass-base-top-edge)] rounded-[var(--radius-card)]';
    }
  };

  return (
    <div
      className={`border transition-colors duration-[var(--motion-smooth)] ${getLevelStyles()} ${className}`}
      style={{
        backdropFilter: `var(--glass-${level}-blur)`,
        WebkitBackdropFilter: `var(--glass-${level}-blur)`
      }}
      {...props}
    >
      {children}
    </div>
  );
};
