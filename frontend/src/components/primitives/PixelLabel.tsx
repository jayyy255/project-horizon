import React from 'react';

interface PixelLabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

export const PixelLabel: React.FC<PixelLabelProps> = ({ className = '', children, ...props }) => {
  return (
    <span
      className={`font-pixel text-[11px] uppercase tracking-widest ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
