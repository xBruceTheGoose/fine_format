import { useState } from 'react';
import { FileUpload } from './components/FileUpload';
import { UrlInput } from './components/UrlInput';
import { ProcessingStatus } from './components/ProcessingStatus';
import { DatasetPreview } from './components/DatasetPreview';
import { useDatasetGeneration } from './hooks/useDatasetGeneration';
import { Card, CardContent } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Download, Settings, Database } from 'lucide-react';
import type { FileData, UrlData, FineTuningGoal } from './types';

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [urls, setUrls] = useState<UrlData[]>([]);
  const [fineTuningGoal, setFineTuningGoal] = useState<FineTuningGoal>('general' as FineTuningGoal);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    isProcessing,
    processedData,
    currentStep,
    progress,
    error,
    generateDataset,
    downloadDataset,
    resetGeneration
  } = useDatasetGeneration();

  const handleGenerate = () => {
    generateDataset(files, urls, fineTuningGoal as FineTuningGoal);
  };

  const handleReset = () => {
    setFiles([]);
    setUrls([]);
    resetGeneration();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <Database className="w-8 h-8 text-indigo-600 mr-3" />
              <h1 className="text-3xl font-bold text-gray-900">AI Dataset Generator</h1>
            </div>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Transform your documents and web content into high-quality training datasets for fine-tuning AI models.
              Upload files, add URLs, and generate question-answer pairs automatically.
            </p>
          </div>

          {/* Main Content */}
          <div className="space-y-6">
            {/* Input Section */}
            <Card>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FileUpload files={files} onFilesChange={setFiles} />
                  <UrlInput urls={urls} onUrlsChange={setUrls} />
                </div>

                {/* Settings */}
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Generation Settings</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      {showAdvanced ? 'Hide' : 'Show'} Advanced
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fine-tuning Goal
                      </label>
                      <select
                        value={fineTuningGoal}
                        onChange={(e) => setFineTuningGoal(e.target.value as FineTuningGoal)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="general">General Knowledge</option>
                        <option value="specific">Domain-Specific</option>
                        <option value="conversational">Conversational</option>
                        <option value="analytical">Analytical</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={handleGenerate}
                    disabled={isProcessing || (files.length === 0 && urls.length === 0)}
                    className="flex-1 min-w-[200px]"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    {isProcessing ? 'Generating...' : 'Generate Dataset'}
                  </Button>

                  {processedData && (
                    <Button
                      onClick={downloadDataset}
                      variant="outline"
                      className="flex-1 min-w-[200px]"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Dataset
                    </Button>
                  )}

                  <Button
                    onClick={handleReset}
                    variant="ghost"
                    disabled={isProcessing}
                  >
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Processing Status */}
            {isProcessing && (
              <ProcessingStatus
                currentStep={currentStep}
                progress={progress}
                error={error || undefined}
              />
            )}

            {/* Dataset Preview */}
            {processedData && !isProcessing && (
              <DatasetPreview data={processedData} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}