import React, { useState } from 'react';
import { Zap, Search, HelpCircle } from 'lucide-react';
import { FileData, UrlData } from './types';
import { geminiService } from './services/geminiService';
import { useDatasetGeneration } from './hooks/useDatasetGeneration';
import { FileUpload } from './components/FileUpload';
import { UrlInput } from './components/UrlInput';
import { ProcessingStatus } from './components/ProcessingStatus';
import { DatasetPreview } from './components/DatasetPreview';
import { Button } from './components/ui/Button';
import { Alert } from './components/ui/Alert';
import { Card, CardContent } from './components/ui/Card';
import { Tooltip } from './components/ui/Tooltip';

const App: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [urls, setUrls] = useState<UrlData[]>([]);
  const [enableWebAugmentation, setEnableWebAugmentation] = useState(false);
  
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
      generateDataset(files, urls, enableWebAugmentation);
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
              filter: 'drop-shadow(0 0 10px #00FF41)',
              animation: 'glow-pulse 2s ease-in-out infinite alternate'
            }} />
            <h1 
              className="text-5xl md:text-7xl font-black neon-text glitch font-mono tracking-wider"
              data-text="FINE FORMAT"
              style={{
                textShadow: '0 0 10px #00FF41, 0 0 20px #00FF41, 0 0 30px #00FF41',
                letterSpacing: '0.1em'
              }}
            >
              FINE FORMAT
            </h1>
          </div>
          <div className="relative">
            <p className="text-xl md:text-2xl text-accent max-w-3xl mx-auto font-semibold">
              <span className="neon-text-accent">TRANSFORM</span>{' '}
              <span className="text-foreground">your documents and web content into</span>{' '}
              <span className="neon-text-secondary">HIGH-QUALITY</span>{' '}
              <span className="text-foreground">Q&A datasets for AI fine-tuning with</span>{' '}
              <span className="neon-text">100+ TARGETED PAIRS</span>
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
                      filter: 'drop-shadow(0 0 5px #00FF41)'
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
                    filter: 'drop-shadow(0 0 5px #00FFFF)'
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
          <p className="text-muted text-sm font-mono">
            &copy; {new Date().getFullYear()} <span className="neon-text">FINE FORMAT</span>. 
            <span className="text-accent ml-2">POWERED BY GEMINI AI</span>
          </p>
          <p className="text-muted text-xs mt-2 font-mono">
            <span className="text-primary">SUPPORTS:</span> .txt, .md, .html, .jsonl, .pdf, .docx files and web URLs
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;