import React from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle, X } from 'lucide-react';

interface AlertProps {
  type: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type,
  title,
  message,
  onClose,
  className = '',
}) => {
  const config = {
    error: {
      icon: XCircle,
      classes: 'cyber-alert-error text-error',
    },
    warning: {
      icon: AlertTriangle,
      classes: 'cyber-alert-warning text-warning',
    },
    info: {
      icon: Info,
      classes: 'cyber-alert-info text-accent',
    },
    success: {
      icon: CheckCircle,
      classes: 'cyber-alert-success text-success',
    },
  };

  const { icon: Icon, classes } = config[type];

  return (
    <div className={`p-6 rounded-lg border flex items-start ${classes} ${className} font-mono`} role="alert">
      <Icon size={24} className="mr-4 flex-shrink-0 mt-1" style={{
        filter: 'drop-shadow(0 0 3px currentColor)'
      }} />
      <div className="flex-grow">
        {title && (
          <h4 className="font-bold mb-2 text-lg tracking-wide" style={{
            textShadow: '0 0 3px currentColor'
          }}>
            {title}
          </h4>
        )}
        <p className="text-sm font-medium">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 -mr-1 -my-1 p-2 rounded hover:bg-white/10 focus:outline-none transition-all duration-200"
          aria-label="Close alert"
          style={{
            filter: 'drop-shadow(0 0 2px currentColor)'
          }}
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
};