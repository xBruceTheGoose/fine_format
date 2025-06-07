import React from 'react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center font-bold rounded-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden font-mono tracking-wide';
  
  const variantClasses = {
    primary: 'cyber-button text-foreground hover:text-primary',
    secondary: 'bg-surface hover:bg-border text-secondary border border-secondary hover:border-secondary hover:shadow-neon',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-background cyber-button',
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-current mr-3" 
               style={{ filter: 'drop-shadow(0 0 5px currentColor)' }} />
          <span className="neon-text">PROCESSING...</span>
        </div>
      ) : (
        <>
          {Icon && (
            <Icon size={20} className="mr-3" style={{ filter: 'drop-shadow(0 0 5px currentColor)' }} />
          )}
          {children}
        </>
      )}
    </button>
  );
};