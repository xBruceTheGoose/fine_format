import React from 'react';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { ThoughtBubble } from './ui/ThoughtBubble';
import { ProgressBar } from './ui/ProgressBar';

interface ProcessingStatusProps {
  isProcessing: boolean;
  currentStep: string;
  progress?: number;
  estimatedTimeRemaining?: number;
  totalEstimatedTime?: number;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  isProcessing,
  currentStep,
  progress,
  estimatedTimeRemaining,
  totalEstimatedTime,
}) => {
  if (!isProcessing && !currentStep) return null;

  const isError = currentStep.includes('error') || currentStep.includes('failed');
  const isComplete = !isProcessing && !isError;

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card className="cyber-card">
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            {isProcessing ? (
              <ThoughtBubble size="lg" />
            ) : isError ? (
              <AlertCircle 
                size={32} 
                className="text-error" 
                style={{ filter: 'drop-shadow(0 0 5px #dc1aff)' }}
              />
            ) : (
              <CheckCircle 
                size={32} 
                className="text-success" 
                style={{ filter: 'drop-shadow(0 0 5px #00FF41)' }}
              />
            )}
            
            <div className="flex-1">
              <p className={`font-bold text-lg font-mono tracking-wide ${
                isError ? 'text-error' : 
                isComplete ? 'text-success' : 
                'text-primary'
              }`} style={{
                textShadow: '0 0 3px currentColor'
              }}>
                {currentStep}
              </p>
              {isProcessing && (
                <p className="text-accent text-sm mt-2 font-mono">
                  <span className="neon-text-accent">AI NEURAL NETWORK</span> is analyzing and processing your content...
                </p>
              )}
            </div>
          </div>

          {/* Progress bar with cyberpunk styling */}
          {(isProcessing || progress !== undefined) && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-primary font-bold font-mono text-sm tracking-wider">
                  PROCESSING STATUS
                </span>
                <span className="text-accent font-bold font-mono text-sm">
                  {Math.round(progress || 0)}%
                </span>
              </div>
              <ProgressBar
                progress={progress || 0}
                animated={isProcessing}
                className="mt-3"
              />
              
              {/* Time estimates */}
              {isProcessing && (estimatedTimeRemaining || totalEstimatedTime) && (
                <div className="flex items-center justify-between text-sm font-mono mt-3">
                  <div className="flex items-center space-x-2">
                    <Clock size={16} className="text-accent" style={{ filter: 'drop-shadow(0 0 2px #00FFFF)' }} />
                    <span className="text-accent">TIME ESTIMATES:</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    {estimatedTimeRemaining && (
                      <span className="text-warning font-bold">
                        {formatTime(estimatedTimeRemaining)} remaining
                      </span>
                    )}
                    {totalEstimatedTime && (
                      <span className="text-muted">
                        {formatTime(totalEstimatedTime)} total
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};