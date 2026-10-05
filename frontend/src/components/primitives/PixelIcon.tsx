import React from 'react';

interface PixelIconProps extends React.HTMLAttributes<HTMLDivElement> {
  name: 'search' | 'click' | 'launch' | 'type' | 'hotkey' | 'shield' | 'check' | 'error';
  size?: 16 | 32 | 48;
  color?: string;
}

export const PixelIcon: React.FC<PixelIconProps> = ({ name, size = 16, color = 'currentColor', className = '', ...props }) => {
  // A simplistic pixel placeholder since actual pixel SVGs are complex
  // In a real app this would map to actual 16x16 path data
  return (
    <div
      className={`inline-block pixelated ${className}`}
      style={{
        width: size,
        height: size,
        imageRendering: 'pixelated',
        backgroundColor: color,
        maskImage: `url(/icons/pixel-${name}.svg)`, // Note: these SVGs would need to exist
        WebkitMaskImage: `url(/icons/pixel-${name}.svg)`,
        maskSize: 'cover',
        WebkitMaskSize: 'cover'
      }}
      title={name}
      {...props}
    />
  );
};
