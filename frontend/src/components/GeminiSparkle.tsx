import React from 'react';

interface GeminiSparkleProps {
  size?: number;
  className?: string;
}

export const GeminiSparkle: React.FC<GeminiSparkleProps> = ({ size = 20, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    className={`flex-shrink-0 drop-shadow-[0_0_6px_rgba(140,193,233,0.7)] ${className}`}
  >
    <defs>
      <linearGradient id="celestialSparkleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFF8E7" />
        <stop offset="35%" stopColor="#8CC1E9" />
        <stop offset="70%" stopColor="#438BC4" />
        <stop offset="100%" stopColor="#FFF8E7" />
      </linearGradient>
    </defs>
    <path 
      d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" 
      fill="url(#celestialSparkleGrad)"
    />
  </svg>
);
