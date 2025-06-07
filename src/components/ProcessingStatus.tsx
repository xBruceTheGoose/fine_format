import React from 'react';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from './ui/Card';

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

  return (
    <Card>
      <CardContent>
        <div className="flex items-center space-x-3">
          {isProcessing ? (
            <Loader2 size={24} className="text-primary animate-spin" />
          ) : currentStep.includes('error') || currentStep.includes('failed') ? (
            <AlertCircle size={24} className="text-red-400" />
          ) : (
            <CheckCircle size={24} className="text-green-400" />
          )}
          
          <div className="flex-1">
            <p className="text-gray-300 font-medium">{currentStep}</p>
            {progress !== undefined && (
              <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};