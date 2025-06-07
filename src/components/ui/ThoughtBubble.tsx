import React from 'react';

interface ThoughtBubbleProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ThoughtBubble: React.FC<ThoughtBubbleProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Main thought bubble with cyberpunk styling */}
      <div className="absolute inset-0 bg-surface rounded-full border-2 border-primary relative overflow-hidden"
           style={{
             background: 'linear-gradient(135deg, rgba(0, 255, 65, 0.1), rgba(0, 255, 65, 0.05))',
             boxShadow: '0 0 20px rgba(0, 255, 65, 0.3), inset 0 0 20px rgba(0, 255, 65, 0.1)',
             animation: 'glow-pulse 2s ease-in-out infinite alternate'
           }}>
        
        {/* Thinking dots with neon effect */}
        <div className="absolute inset-0 flex items-center justify-center space-x-1">
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full`}
            style={{ 
              boxShadow: '0 0 10px #00FF41',
              animation: 'bounce 1.4s infinite',
              animationDelay: '0ms'
            }}
          />
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full`}
            style={{ 
              boxShadow: '0 0 10px #00FF41',
              animation: 'bounce 1.4s infinite',
              animationDelay: '200ms'
            }}
          />
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full`}
            style={{ 
              boxShadow: '0 0 10px #00FF41',
              animation: 'bounce 1.4s infinite',
              animationDelay: '400ms'
            }}
          />
        </div>

        {/* Scanning line effect */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div 
            className="absolute top-0 left-0 right-0 h-px bg-primary opacity-70"
            style={{
              animation: 'scanline 2s linear infinite',
              boxShadow: '0 0 5px #00FF41'
            }}
          />
        </div>
      </div>
      
      {/* Small bubble tail with neon glow */}
      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-surface rounded-full border border-primary"
           style={{
             background: 'rgba(0, 255, 65, 0.1)',
             boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)',
             animation: 'glow-pulse 2s ease-in-out infinite alternate'
           }} />
      <div className="absolute -bottom-2.5 right-0 w-1.5 h-1.5 bg-surface rounded-full border border-primary/50"
           style={{
             background: 'rgba(0, 255, 65, 0.05)',
             boxShadow: '0 0 5px rgba(0, 255, 65, 0.2)',
             animation: 'glow-pulse 2s ease-in-out infinite alternate'
           }} />
    </div>
  );
};