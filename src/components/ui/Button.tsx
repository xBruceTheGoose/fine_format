import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
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
  className = '',
  children,
  disabled,
  ...props 
}) => {
  const baseClasses = 'cyber-button inline-flex items-center justify-center rounded-lg font-bold font-mono tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50';
  
  const variants = {
    primary: 'text-primary border-primary hover:bg-primary hover:text-background',
    secondary: 'text-secondary border-secondary hover:bg-secondary hover:text-background',
    outline: 'text-foreground border-border hover:border-primary hover:text-primary',
    ghost: 'text-muted border-transparent hover:text-primary hover:bg-surface/70'
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg'
  };

  const classes = `${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`;

  return (
    <button 
      className={classes} 
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
      ) : Icon ? (
        <Icon size={16} className="mr-2" style={{ filter: 'drop-shadow(0 0 2px currentColor)' }} />
      ) : null}
      {children}
    </button>
  );
};