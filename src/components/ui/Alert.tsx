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
          <h4 className="font-bold mb-2 text-lg tracking-wide\" style={{
            textShadow: '0 0 3px currentColor'
          }}>
            {title}
          </h4>
        )}
        <div className="text-sm font-medium">
          {message.split('\n').map((line, index) => (
            <p key={index} className={index > 0 ? 'mt-2' : ''}>
              {line}
              
              {/* Add helpful context for common error patterns */}
              {line.includes('all available API keys') && (
                <span className="block mt-2 text-xs opacity-80">
                  💡 This usually indicates a temporary service issue. The system will automatically try backup services.
                </span>
              )}
              {line.includes('Both primary') && line.includes('fallback') && (
                <span className="block mt-2 text-xs opacity-80">
                  🔄 Both Gemini and OpenRouter services are currently experiencing issues. This is typically temporary.
                </span>
              )}
            </p>
          ))}
          
          {/* Add helpful suggestions for service unavailable errors */}
          {message.includes('temporarily unavailable') && (
            <div className="mt-3 p-3 bg-surface/30 rounded border border-current/20">
              <p className="font-semibold mb-2">💡 What you can do:</p>
              <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                <li>Wait 2-3 minutes and try again</li>
                <li>The system will automatically try backup services</li>
                <li>Try with smaller content or fewer files</li>
                <li>Contact support if the problem continues</li>
              </ul>
            </div>
          )}
          
          {/* Add suggestions for fallback service failures */}
          {(message.includes('Primary service failed') || message.includes('Fallback service')) && (
            <div className="mt-3 p-3 bg-surface/30 rounded border border-current/20">
              <p className="font-semibold mb-2">🔄 Service Fallback Information:</p>
              <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                <li>The system automatically tries backup services when the primary fails</li>
                <li>Both primary (Gemini) and backup (OpenRouter) services are currently unavailable</li>
                <li>This is usually temporary - wait 5-10 minutes and try again</li>
                <li>Contact support if the issue persists for more than 30 minutes</li>
              </ul>
            </div>
          )}
          
          {/* Add suggestions for API key issues */}
          {(message.includes('authentication') || message.includes('API key')) && (
            <div className="mt-3 p-3 bg-surface/30 rounded border border-current/20">
              <p className="font-semibold mb-2">🔑 API Key Issues:</p>
              <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                <li>Verify your API keys (Gemini & OpenRouter) are correctly set</li>
                <li>Check that the API keys haven't expired</li>
                <li>Ensure the API keys have proper permissions</li>
                <li>Contact support for API key configuration help</li>
              </ul>
            </div>
          )}
          
          {/* Add suggestions for all keys failing */}
          {message.includes('all available API keys') && (
            <div className="mt-3 p-3 bg-surface/30 rounded border border-current/20">
              <p className="font-semibold mb-2">🔧 Troubleshooting:</p>
              <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                <li>Wait 5 minutes - this is often temporary</li>
                <li>The system will automatically try backup services</li>
                <li>Try with smaller content or fewer files</li>
                <li>Check your internet connection</li>
                <li>Contact support if the issue persists</li>
              </ul>
            </div>
          )}
          
          {/* Add troubleshooting for content-related errors */}
          {(message.includes('too short') || message.includes('no valid') || message.includes('insufficient')) && (
            <div className="mt-3 p-3 bg-surface/30 rounded border border-current/20">
              <p className="font-semibold mb-2">📄 Content Issues:</p>
              <ul className="text-xs space-y-1 list-disc list-inside opacity-90">
                <li>Ensure your files contain readable text (not just images)</li>
                <li>PDF files should have selectable text, not scanned images</li>
                <li>Try adding more content or combining multiple sources</li>
                <li>Check that URLs point to pages with substantial text content</li>
              </ul>
            </div>
          )}
        </div>
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