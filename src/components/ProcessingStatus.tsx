import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Clock, Hourglass } from 'lucide-react';
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

  // Countdown timer state
  const [countdown, setCountdown] = useState<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync countdown with estimatedTimeRemaining when processing starts or changes
  useEffect(() => {
    if (isProcessing && typeof estimatedTimeRemaining === 'number') {
      setCountdown(Math.ceil(estimatedTimeRemaining));
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setCountdown(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else {
      setCountdown(null);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isProcessing, estimatedTimeRemaining]);

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
              <Hourglass size={32} className="text-primary animate-spin" style={{ filter: 'drop-shadow(0 0 5px currentColor)' }} />
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
                    {typeof countdown === 'number' && countdown >= 0 ? (
                      <span className="text-warning font-bold animate-pulse">
                        {formatTime(countdown)} remaining
                      </span>
                    ) : estimatedTimeRemaining ? (
                      <span className="text-warning font-bold">
                        {formatTime(estimatedTimeRemaining)} remaining
                      </span>
                    ) : null}
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