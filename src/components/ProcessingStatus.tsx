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
                style={{ filter: 'drop-shadow(0 0 10px #FF4444)' }}
              />
            ) : (
              <CheckCircle 
                size={32} 
                className="text-success" 
                style={{ filter: 'drop-shadow(0 0 10px #00FF41)' }}
              />
            )}
            
            <div className="flex-1">
              <p className={`font-bold text-lg font-mono tracking-wide ${
                isError ? 'text-error' : 
                isComplete ? 'text-success' : 
                'text-primary'
              }`} style={{
                textShadow: '0 0 5px currentColor'
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
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};