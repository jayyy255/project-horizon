import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'secondary', className = '', children, ...props }) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        // Cobalt appears on the primary action and nowhere else
        return 'bg-[var(--color-cobalt)] text-[var(--color-cosmic-cream)] shadow-lg hover:brightness-110';
      case 'ghost':
        return 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--color-carbon-800)] hover:text-[var(--text-primary)] border-transparent';
      case 'secondary':
      default:
        return 'bg-[var(--glass-raised-bg)] text-[var(--text-primary)] border border-[var(--glass-raised-border)] backdrop-filter-[var(--glass-raised-blur)] shadow-[var(--glass-raised-top-edge)] hover:bg-[var(--glass-floating-bg)]';
    }
  };

  return (
    <button
      className={`rounded-[var(--radius-button)] px-4 py-2 font-ui font-medium text-sm transition-all duration-[var(--motion-smooth)] flex items-center gap-2 ${getVariantStyles()} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
