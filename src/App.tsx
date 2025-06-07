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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Zap size={48} className="text-primary mr-3" />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-light to-primary bg-clip-text text-transparent">
              Fine Format
            </h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Transform your documents and web content into high-quality Q&A datasets for AI fine-tuning with 100+ targeted pairs
          </p>
        </header>

        <div className="space-y-8">
          {/* API Key Warning */}
          {!isGeminiReady && (
            <Alert
              type="warning"
              title="API Key Required"
              message="Please set your Gemini API key in the .env.local file and restart the development server."
            />
          )}

          {/* Error Display */}
          {error && (
            <Alert
              type="error"
              title="Processing Error"
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
          <Card>
            <CardContent>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="webAugmentation"
                  checked={enableWebAugmentation}
                  onChange={(e) => setEnableWebAugmentation(e.target.checked)}
                  disabled={isProcessing || !isGeminiReady}
                  className="h-5 w-5 text-primary rounded border-gray-500 focus:ring-primary bg-gray-600"
                />
                <label htmlFor="webAugmentation" className="text-gray-200 font-medium cursor-pointer">
                  Enhance with Targeted Web Content
                </label>
                <Tooltip content="AI will identify key themes from your content and search for relevant information online to create a comprehensive 100+ Q&A dataset with both correct and incorrect answers for optimal fine-tuning." />
              </div>
              {enableWebAugmentation && (
                <div className="mt-2 flex items-center text-sm text-gray-400">
                  <Search size={16} className="mr-2" />
                  Theme-based web search will enhance content quality and coverage
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
              className="px-8 py-4"
            >
              {isProcessing 
                ? 'Generating Dataset...' 
                : `Generate 100+ Q&A Dataset (${totalReadySources} source${totalReadySources !== 1 ? 's' : ''})`
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
        <footer className="text-center mt-16 pt-8 border-t border-gray-700">
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} Fine Format. Powered by Gemini AI.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Supports: .txt, .md, .html, .jsonl, .pdf, .docx files and web URLs
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;