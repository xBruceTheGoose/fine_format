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
              AI Dataset Generator
            </h1>
          </div>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Transform your documents and web content into high-quality Q&A datasets for AI fine-tuning
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
                  Enhance with Web Content
                </label>
                <div className="group relative">
                  <HelpCircle size={18} className="text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-700 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-64 z-10">
                    When enabled, the AI will search for relevant information online to enrich your dataset with additional context and facts.
                  </div>
                </div>
              </div>
              {enableWebAugmentation && (
                <div className="mt-2 flex items-center text-sm text-gray-400">
                  <Search size={16} className="mr-2" />
                  Web search will be used to enhance content quality
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
                : `Generate Dataset (${totalReadySources} source${totalReadySources !== 1 ? 's' : ''})`
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
              isAugmented={processedData.isAugmented}
              groundingMetadata={processedData.groundingMetadata}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-16 pt-8 border-t border-gray-700">
          <p className="text-gray-500 text-sm">
            &copy; {new Date().getFullYear()} AI Dataset Generator. Powered by Gemini AI.
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