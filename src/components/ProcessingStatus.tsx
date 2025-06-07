import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { ThoughtBubble } from './ui/ThoughtBubble';
import { ProgressBar } from './ui/ProgressBar';

interface ProcessingStatusProps {
  isProcessing: boolean;
  currentStep: string;
  progress?: number;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  isProcessing,
  currentStep,
  progress,
}) => {
  if (!isProcessing && !currentStep) return null;

  const isError = currentStep.includes('error') || currentStep.includes('failed');
  const isComplete = !isProcessing && !isError;

  return (
    <Card>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            {isProcessing ? (
              <ThoughtBubble size="md" />
            ) : isError ? (
              <AlertCircle size={24} className="text-red-400" />
            ) : (
              <CheckCircle size={24} className="text-green-400" />
            )}
            
            <div className="flex-1">
              <p className={`font-medium ${
                isError ? 'text-red-300' : 
                isComplete ? 'text-green-300' : 
                'text-gray-300'
              }`}>
                {currentStep}
              </p>
              {isProcessing && (
                <p className="text-sm text-gray-400 mt-1">
                  AI is analyzing and processing your content...
                </p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(isProcessing || progress !== undefined) && (
            <ProgressBar
              progress={progress || 0}
              animated={isProcessing}
              className="mt-3"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};