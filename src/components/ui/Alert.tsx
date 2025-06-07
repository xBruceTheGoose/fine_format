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
      classes: 'bg-red-900/30 text-red-300 border-red-700',
    },
    warning: {
      icon: AlertTriangle,
      classes: 'bg-yellow-900/30 text-yellow-300 border-yellow-700',
    },
    info: {
      icon: Info,
      classes: 'bg-blue-900/30 text-blue-300 border-blue-700',
    },
    success: {
      icon: CheckCircle,
      classes: 'bg-green-900/30 text-green-300 border-green-700',
    },
  };

  const { icon: Icon, classes } = config[type];

  return (
    <div className={`p-4 rounded-lg border flex items-start ${classes} ${className}`} role="alert">
      <Icon size={20} className="mr-3 flex-shrink-0 mt-0.5" />
      <div className="flex-grow">
        {title && <h4 className="font-semibold mb-1">{title}</h4>}
        <p className="text-sm">{message}</p>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 -mr-1 -my-1 p-1 rounded hover:bg-white/10 focus:outline-none"
          aria-label="Close alert"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
};