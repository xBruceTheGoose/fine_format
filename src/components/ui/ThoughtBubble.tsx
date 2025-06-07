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
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-1.5 h-1.5',
    lg: 'w-2 h-2',
  };

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      {/* Main thought bubble */}
      <div className="absolute inset-0 bg-primary/20 rounded-full border-2 border-primary/40 animate-pulse">
        {/* Thinking dots */}
        <div className="absolute inset-0 flex items-center justify-center space-x-0.5">
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full animate-bounce`}
            style={{ animationDelay: '0ms', animationDuration: '1.4s' }}
          />
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full animate-bounce`}
            style={{ animationDelay: '200ms', animationDuration: '1.4s' }}
          />
          <div 
            className={`${dotSizes[size]} bg-primary rounded-full animate-bounce`}
            style={{ animationDelay: '400ms', animationDuration: '1.4s' }}
          />
        </div>
      </div>
      
      {/* Small bubble tail */}
      <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-primary/20 rounded-full border border-primary/40 animate-pulse" />
      <div className="absolute -bottom-2 right-0 w-1 h-1 bg-primary/15 rounded-full animate-pulse" />
    </div>
  );
};