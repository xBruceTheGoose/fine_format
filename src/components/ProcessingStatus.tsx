import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Clock, Loader } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { ThoughtBubble } from './ui/ThoughtBubble';
import { ProgressBar } from './ui/ProgressBar';

interface ProcessingStatusProps {
  currentStep: string;
  progress: number;
  isProcessing?: boolean;
  error?: string;
  estimatedTimeRemaining?: number;
  totalEstimatedTime?: number;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  currentStep,
  progress,
  isProcessing = false,
  error,
  estimatedTimeRemaining,
  totalEstimatedTime,
}) => {
  const [dots, setDots] = useState('');
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isProcessing) {
      intervalRef.current = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 500);
    } else {
      setDots('');
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isProcessing]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    if (error) return <AlertCircle size={24} className="text-error" style={{ filter: 'drop-shadow(0 0 5px #dc1aff)' }} />;
    if (progress === 100) return <CheckCircle size={24} className="text-success" style={{ filter: 'drop-shadow(0 0 5px #00FF41)' }} />;
    if (isProcessing) return <ThoughtBubble size="md" />;
    return <Clock size={24} className="text-muted" />;
  };

  const getStatusText = () => {
    if (error) return 'ERROR OCCURRED';
    if (progress === 100) return 'PROCESSING COMPLETE';
    if (isProcessing) return `${currentStep.toUpperCase()}${dots}`;
    return 'READY TO PROCESS';
  };

  const getStatusColor = () => {
    if (error) return 'neon-text-red';
    if (progress === 100) return 'neon-text';
    if (isProcessing) return 'neon-text-accent';
    return 'text-muted';
  };

  return (
    <Card>
      <CardContent>
        <div className="space-y-6">
          {/* Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {getStatusIcon()}
              <div>
                <h3 className="text-xl font-bold text-primary font-mono tracking-wide">
                  PROCESSING STATUS
                </h3>
                <p className={`text-lg font-bold font-mono tracking-wide ${getStatusColor()}`}>
                  {getStatusText()}
                </p>
              </div>
            </div>
            
            {/* Time Display */}
            {(estimatedTimeRemaining || totalEstimatedTime) && (
              <div className="text-right space-y-1">
                {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
                  <div>
                    <p className="text-sm text-accent font-mono tracking-wide">EST. REMAINING</p>
                    <p className="text-2xl font-bold font-mono text-warning tracking-wider" style={{
                      textShadow: '0 0 5px #FFFF00'
                    }}>
                      {formatTime(estimatedTimeRemaining)}
                    </p>
                  </div>
                )}
                {totalEstimatedTime && (
                  <div>
                    <p className="text-xs text-muted font-mono">TOTAL: {formatTime(totalEstimatedTime)}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-accent font-bold font-mono tracking-wide">PROGRESS</span>
              <span className="text-primary font-bold font-mono tracking-wider text-lg" style={{
                textShadow: '0 0 5px #00FF41'
              }}>
                {Math.round(progress)}%
              </span>
            </div>
            <ProgressBar 
              progress={progress} 
              className="h-4"
              animated={isProcessing}
              showPercentage={false}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="cyber-alert-error p-4 rounded-lg border">
              <div className="flex items-start space-x-3">
                <AlertCircle size={20} className="text-error flex-shrink-0 mt-0.5" style={{
                  filter: 'drop-shadow(0 0 3px #dc1aff)'
                }} />
                <div>
                  <h4 className="font-bold text-error font-mono tracking-wide mb-2">
                    PROCESSING ERROR
                  </h4>
                  <p className="text-error text-sm font-mono">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && !error && (
            <div className="cyber-alert-info p-4 rounded-lg border">
              <div className="flex items-center space-x-3">
                <Loader size={20} className="text-accent animate-spin" style={{
                  filter: 'drop-shadow(0 0 3px #00FFFF)'
                }} />
                <p className="text-accent font-mono tracking-wide">
                  SYSTEM PROCESSING... PLEASE WAIT
                </p>
              </div>
            </div>
          )}

          {/* Completion Message */}
          {progress === 100 && !error && (
            <div className="cyber-alert-success p-4 rounded-lg border">
              <div className="flex items-center space-x-3">
                <CheckCircle size={20} className="text-success" style={{
                  filter: 'drop-shadow(0 0 3px #00FF41)'
                }} />
                <p className="text-success font-bold font-mono tracking-wide">
                  DATASET GENERATION COMPLETE - READY FOR DOWNLOAD
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};