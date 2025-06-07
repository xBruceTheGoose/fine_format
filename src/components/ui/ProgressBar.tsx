import React from 'react';

interface ProgressBarProps {
  progress: number;
  className?: string;
  showPercentage?: boolean;
  animated?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  className = '',
  showPercentage = false,
  animated = true,
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-1">
        {showPercentage && (
          <span className="text-sm text-gray-400 font-medium">
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r from-primary to-primary-light rounded-full transition-all duration-500 ease-out ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ 
            width: `${clampedProgress}%`,
            boxShadow: clampedProgress > 0 ? '0 0 8px rgba(13, 148, 136, 0.4)' : 'none'
          }}
        />
      </div>
    </div>
  );
};