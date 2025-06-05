
import React from 'react';
import { AlertTriangle, XCircle, Info } from 'lucide-react';

interface AlertMessageProps {
  type: 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

const AlertMessage: React.FC<AlertMessageProps> = ({ type, message, onClose }) => {
  const baseClasses = "p-4 rounded-md flex items-start text-sm";
  let specificClasses = "";
  let IconComponent;

  switch (type) {
    case 'error':
      specificClasses = "bg-red-800/30 text-red-300 border border-red-700";
      IconComponent = XCircle;
      break;
    case 'warning':
      specificClasses = "bg-yellow-800/30 text-yellow-300 border border-yellow-700";
      IconComponent = AlertTriangle;
      break;
    case 'info':
    default:
      specificClasses = "bg-blue-800/30 text-blue-300 border border-blue-700";
      IconComponent = Info;
      break;
  }

  return (
    <div className={`${baseClasses} ${specificClasses}`} role="alert">
      <IconComponent size={20} className="mr-3 flex-shrink-0 mt-0.5" />
      <div className="flex-grow">{message}</div>
      {onClose && (
        <button onClick={onClose} className="ml-4 -mr-1 -my-1 p-1 rounded hover:bg-white/10 focus:outline-none">
          <XCircle size={18} />
        </button>
      )}
    </div>
  );
};

export default AlertMessage;
