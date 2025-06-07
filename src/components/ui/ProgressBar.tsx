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
      <div className="flex items-center justify-between mb-2">
        {showPercentage && (
          <span className="text-sm text-primary font-bold font-mono tracking-wider\" style={{
            textShadow: '0 0 5px currentColor'
          }}>
            {Math.round(clampedProgress)}%
          </span>
        )}
      </div>
      <div className="w-full bg-surface rounded-full h-3 overflow-hidden border border-border relative">
        {/* Background grid pattern */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,255,65,0.1) 50%)',
          backgroundSize: '8px 100%'
        }}></div>
        
        <div
          className={`h-full progress-bar-cyber rounded-full transition-all duration-500 ease-out relative overflow-hidden ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ 
            width: `${clampedProgress}%`,
          }}
        >
          {/* Animated scanline effect */}
          {animated && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
          )}
        </div>
      </div>
    </div>
  );
};