import React from 'react';

interface SegmentedProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  progress: number; // 0 to 100
  segments?: number;
}

export const SegmentedProgress: React.FC<SegmentedProgressProps> = ({ progress, segments = 8, className = '', ...props }) => {
  const filledSegments = Math.round((progress / 100) * segments);

  return (
    <div className={`flex items-center gap-[2px] ${className}`} {...props}>
      {Array.from({ length: segments }).map((_, i) => {
        const isFilled = i < filledSegments;
        return (
          <div
            key={i}
            className={`h-2 w-3 ${isFilled ? 'bg-[var(--color-signal-cyan)] shadow-[0_0_4px_var(--color-signal-cyan)]' : 'bg-[var(--color-carbon-800)]'}`}
            style={{ transition: 'background-color var(--motion-stepped)' }}
          />
        );
      })}
    </div>
  );
};
