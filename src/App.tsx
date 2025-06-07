import React, { useState } from 'react';
import { Zap, Search, HelpCircle, Target, BookOpen, PenTool } from 'lucide-react';
import { FileData, UrlData, FineTuningGoal } from './types';
import { geminiService } from './services/geminiService';
import { useDatasetGeneration } from './hooks/useDatasetGeneration';
import { FileUpload } from './components/FileUpload';
import { UrlInput } from './components/UrlInput';
import { ProcessingStatus } from './components/ProcessingStatus';
import { DatasetPreview } from './components/DatasetPreview';
import { Button } from './components/ui/Button';
import { Alert } from './components/ui/Alert';
import { Card, CardContent, CardHeader } from './components/ui/Card';
import { Tooltip } from './components/ui/Tooltip';
import { FINE_TUNING_GOALS } from './constants';

const App: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [urls, setUrls] = useState<UrlData[]>([]);
  const [enableWebAugmentation, setEnableWebAugmentation] = useState(false);
  const [fineTuningGoal, setFineTuningGoal] = useState<FineTuningGoal>('knowledge');
  
  const {
    processedData,
    isProcessing,
    currentStep,
    progress,
    error,
    generateDataset,
    clearError,
  } = useDatasetGeneration();

  const isGeminiReady = geminiService.isReady();
  const readyFileCount = files.filter(f => f.status === 'read').length;
  const readyUrlCount = urls.filter(u => u.status === 'fetched').length;
  const totalReadySources = readyFileCount + readyUrlCount;
  const canGenerate = totalReadySources > 0 && isGeminiReady && !isProcessing;

  const handleGenerateDataset = () => {
    if (canGenerate) {
      generateDataset(files, urls, enableWebAugmentation, fineTuningGoal);
    }
  };

  const getGoalIcon = (goalId: FineTuningGoal) => {
    switch (goalId) {
      case 'topic': return Target;
      case 'knowledge': return BookOpen;
      case 'style': return PenTool;
      default: return Target;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Cyberpunk background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-surface to-background opacity-90"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-secondary to-transparent opacity-50"></div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <Zap size={56} className="text-primary mr-4 animate-pulse" style={{
              filter: 'drop-shadow(0 0 5px #00FF41)',
              animation: 'glow-pulse 2s ease-in-out infinite alternate'
            }} />
            <h1 
              className="text-5xl md:text-7xl font-black glitch font-mono tracking-wider"
              data-text="FINE FORMAT"
              style={{
                color: '#00FF41',
                textShadow: '0 0 2px #00FF41, 0 0 4px #00FF41',
                letterSpacing: '0.1em'
              }}
            >
              FINE FORMAT
            </h1>
          </div>
          <div className="relative">
            <p className="text-xl md:text-2xl text-accent max-w-3xl mx-auto font-semibold">
              Efficiently <span className="neon-text-accent">TRANSFORM</span>{' '}
              <span className="text-foreground">content from diverse document types, public URLs, and curated relevant web sources into</span>{' '}
              <span className="neon-text-secondary">HIGH-QUALITY</span>,{' '}
              <span className="text-foreground">domain specific</span>{' '}
              <span className="neon-text">DATASETS</span>{' '}
              <span className="text-foreground">for fine-tuning AI models.</span>
            </p>
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
          </div>
        </header>

        <div className="space-y-8">
          {/* API Key Warning */}
          {!isGeminiReady && (
            <Alert
              type="warning"
              title="API KEY REQUIRED"
              message="Please set your Gemini API key in the .env.local file and restart the development server."
            />
          )}

          {/* Error Display */}
          {error && (
            <Alert
              type="error"
              title="PROCESSING ERROR"
              message={error}
              onClose={clearError}
            />
          )}

          {/* Fine-Tuning Goal Selection */}
          <Card className="cyber-card">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-primary flex items-center font-mono tracking-wide">
                  <Target 
                    size={24} 
                    className="mr-3 text-accent" 
                    style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
                  />
                  FINE-TUNING GOAL
                </h3>
                <Tooltip content="Select the primary focus for your dataset generation. This determines how the AI will analyze your content and generate Q&A pairs optimized for your specific fine-tuning objectives." />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {FINE_TUNING_GOALS.map((goal) => {
                  const IconComponent = getGoalIcon(goal.id);
                  const isSelected = fineTuningGoal === goal.id;
                  
                  return (
                    <button
                      key={goal.id}
                      onClick={() => setFineTuningGoal(goal.id)}
                      disabled={isProcessing}
                      className={`
                        p-4 rounded-lg border-2 transition-all duration-300 text-left relative overflow-hidden
                        ${isSelected 
                          ? 'border-primary bg-primary/10 shadow-cyber' 
                          : 'border-border bg-surface/30 hover:border-primary/50 hover:bg-surface/50'
                        }
                        ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      style={{
                        background: isSelected 
                          ? 'linear-gradient(135deg, rgba(0, 255, 65, 0.08), rgba(0, 255, 65, 0.04))'
                          : 'linear-gradient(135deg, rgba(26, 26, 26, 0.3), rgba(26, 26, 26, 0.1))'
                      }}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="text-2xl">{goal.icon}</div>
                        <IconComponent 
                          size={24} 
                          className={`${isSelected ? 'text-primary' : 'text-accent'} flex-shrink-0`}
                          style={{ filter: `drop-shadow(0 0 3px ${isSelected ? '#00FF41' : '#00FFFF'})` }}
                        />
                      </div>
                      <h4 className={`font-bold text-lg mt-3 font-mono tracking-wide ${
                        isSelected ? 'neon-text' : 'text-foreground'
                      }`}>
                        {goal.name}
                      </h4>
                      <p className="text-muted text-sm mt-2 font-mono leading-relaxed">
                        {goal.description}
                      </p>
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="w-3 h-3 bg-primary rounded-full animate-pulse"
                               style={{ boxShadow: '0 0 5px #00FF41' }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-surface/30 rounded-lg border border-border">
                <p className="text-accent text-sm font-mono">
                  <span className="neon-text-accent">SELECTED FOCUS:</span>{' '}
                  {FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal)?.promptFocus}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <FileUpload
            files={files}
            onFilesChange={setFiles}
            disabled={isProcessing}
          />

          {/* URL Input */}
          <UrlInput
            urls={urls}
            onUrlsChange={setUrls}
            disabled={isProcessing}
          />

          {/* Web Augmentation Option */}
          <Card className="cyber-card">
            <CardContent>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <input
                    type="checkbox"
                    id="webAugmentation"
                    checked={enableWebAugmentation}
                    onChange={(e) => setEnableWebAugmentation(e.target.checked)}
                    disabled={isProcessing || !isGeminiReady}
                    className="h-6 w-6 rounded border-2 border-primary bg-surface text-primary focus:ring-primary focus:ring-2 focus:ring-offset-0 disabled:opacity-50"
                    style={{
                      accentColor: '#00FF41',
                      filter: 'drop-shadow(0 0 3px #00FF41)'
                    }}
                  />
                </div>
                <label htmlFor="webAugmentation" className="text-foreground font-semibold cursor-pointer text-lg">
                  <span className="neon-text">ENHANCE</span> with Targeted Web Content
                </label>
                <Tooltip content="AI will identify key themes from your content and search for relevant information online to create a comprehensive 100+ Q&A dataset with both correct and incorrect answers for optimal fine-tuning." />
              </div>
              {enableWebAugmentation && (
                <div className="mt-4 flex items-center text-accent font-medium">
                  <Search size={18} className="mr-3 animate-pulse" style={{
                    filter: 'drop-shadow(0 0 3px #00FFFF)'
                  }} />
                  <span className="neon-text-accent">THEME-BASED WEB SEARCH</span> will enhance content quality and coverage
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleGenerateDataset}
              disabled={!canGenerate}
              loading={isProcessing}
              className="px-12 py-6 text-xl font-bold cyber-button"
            >
              {isProcessing 
                ? <span className="neon-text">GENERATING DATASET...</span>
                : <span>
                    <span className="neon-text">GENERATE 100+ Q&A DATASET</span>
                    <span className="text-accent ml-2">({totalReadySources} source{totalReadySources !== 1 ? 's' : ''})</span>
                  </span>
              }
            </Button>
          </div>

          {/* Processing Status */}
          <ProcessingStatus
            isProcessing={isProcessing}
            currentStep={currentStep}
            progress={progress}
          />

          {/* Dataset Preview */}
          {processedData && (
            <DatasetPreview
              qaPairs={processedData.qaPairs}
              sourceFileCount={processedData.sourceFileCount}
              sourceUrlCount={processedData.sourceUrlCount}
              identifiedThemes={processedData.identifiedThemes}
              correctAnswerCount={processedData.correctAnswerCount}
              incorrectAnswerCount={processedData.incorrectAnswerCount}
              isAugmented={processedData.isAugmented}
              groundingMetadata={processedData.groundingMetadata}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-20 pt-8 border-t border-border relative">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
          <p className="text-gray-400 text-sm font-mono mb-2">
            &copy; {new Date().getFullYear()} DappGoose Labs DAO. 
            <span className="text-accent ml-2">POWERED BY LEADING AI MODELS</span>
          </p>
          <p className="text-gray-400 text-xs mb-3 font-mono">
            <span className="text-primary">SUPPORTS:</span> .txt, .md, .html, .jsonl, .pdf, .docx files and web URLs
          </p>
          <p className="text-gray-400 text-sm font-mono">
            Made with <span className="text-secondary neon-text-secondary">{'<3'}</span> and{' '}
            <span className="text-accent neon-text-accent">bolt.new</span> by{' '}
            <span className="text-foreground">brucethegoose.eth</span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;