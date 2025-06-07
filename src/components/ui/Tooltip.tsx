import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-3',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-3',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-3',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-3',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-surface',
    bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-surface',
    left: 'left-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-surface',
    right: 'right-full top-1/2 transform -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-surface',
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        className="cursor-help"
      >
        {children || (
          <HelpCircle 
            size={18} 
            className="text-accent hover:text-primary transition-colors duration-200" 
            style={{
              filter: 'drop-shadow(0 0 2px currentColor)'
            }}
          />
        )}
      </div>
      
      {isVisible && (
        <div className={`absolute z-50 ${positionClasses[position]}`}>
          <div className="px-4 py-3 bg-surface text-foreground text-sm rounded-lg shadow-lg max-w-xs whitespace-normal border border-border font-mono"
               style={{
                 background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.95), rgba(26, 26, 26, 0.9))',
                 backdropFilter: 'blur(10px)',
                 boxShadow: '0 0 10px rgba(0, 255, 65, 0.15), 0 8px 32px rgba(0, 0, 0, 0.3)',
                 border: '1px solid rgba(0, 255, 65, 0.2)'
               }}>
            {content}
          </div>
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`} 
               style={{
                 filter: 'drop-shadow(0 0 2px rgba(0, 255, 65, 0.15))'
               }} />
        </div>
      )}
    </div>
  );
};