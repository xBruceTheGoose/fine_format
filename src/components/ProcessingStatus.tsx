import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, AlertCircle, Clock, Hourglass } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { ProgressBar } from './ui/ProgressBar';

interface ProcessingStatusProps {
  currentStep: string;
  progress: number;
  isProcessing?: boolean;
  error?: string;
  estimatedTimeRemaining?: number;
  completedSteps?: string[];
  totalSteps?: number;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  currentStep,
  progress,
  isProcessing,
  error,
  estimatedTimeRemaining,
  completedSteps = [],
  totalSteps = 0
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
    if (error) return <AlertCircle className="w-5 h-5 text-red-400" />;
    if (progress === 100) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (isProcessing) return <Hourglass className="w-5 h-5 text-blue-400 animate-pulse" />;
    return <Clock className="w-5 h-5 text-gray-400" />;
  };

  const getStatusText = () => {
    if (error) return 'Error occurred';
    if (progress === 100) return 'Processing complete';
    if (isProcessing) return `${currentStep}${dots}`;
    return 'Ready to process';
  };

  return (
    <Card className="bg-gray-900/50 border-cyan-500/30">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Status Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon()}
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Processing Status
                </h3>
                <p className="text-sm text-gray-400">
                  {getStatusText()}
                </p>
              </div>
            </div>
            {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
              <div className="text-right">
                <p className="text-sm text-gray-400">Est. time remaining</p>
                <p className="text-lg font-mono text-cyan-400">
                  {formatTime(estimatedTimeRemaining)}
                </p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Progress</span>
              <span className="text-cyan-400">{Math.round(progress)}%</span>
            </div>
            <ProgressBar 
              progress={progress} 
              className="h-2"
            />
          </div>

          {/* Step Counter */}
          <div className="flex justify-between text-sm text-gray-400">
            <span>Steps completed</span>
            <span>{completedSteps.length} / {totalSteps}</span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Completed Steps List */}
          {completedSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-300">Completed Steps:</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {completedSteps.map((step, index) => (
                  <div key={index} className="flex items-center space-x-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-gray-300">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};