import React from 'react';

type MascotState = 'idle' | 'thinking' | 'success' | 'error';

interface MascotProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: MascotState;
  size?: number;
}

export const Mascot: React.FC<MascotProps> = ({ state = 'idle', size = 24, className = '', ...props }) => {
  const getOrbColor = () => {
    switch (state) {
      case 'thinking': return 'var(--color-signal-cyan)';
      case 'success': return 'var(--color-celestial)';
      case 'error': return 'var(--color-error-red)';
      case 'idle':
      default:
        return 'var(--color-cosmic-cream)';
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      {...props}
    >
      <div 
        className={`absolute inset-0 rounded-full bg-current ${state === 'thinking' ? 'animate-pulse' : ''}`}
        style={{
          color: getOrbColor(),
          boxShadow: `0 0 8px ${getOrbColor()}`,
          transition: 'all var(--motion-stepped)'
        }}
      />
      {/* 8-bit eyes or core detail could go here */}
      <div className="absolute inset-1/4 rounded-sm bg-black/40" />
    </div>
  );
};
