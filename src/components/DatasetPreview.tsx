import React from 'react';
import { MessageSquare, Bot, Download, Search, Lightbulb, CheckCircle, XCircle, Target, TrendingUp } from 'lucide-react';
import { QAPair, GroundingMetadata } from '../types';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { DownloadService } from '../services/downloadService';

interface DatasetPreviewProps {
  qaPairs: QAPair[];
  sourceFileCount: number;
  sourceUrlCount: number;
  identifiedThemes: string[];
  correctAnswerCount: number;
  incorrectAnswerCount: number;
  isAugmented?: boolean;
  groundingMetadata?: GroundingMetadata;
}

export const DatasetPreview: React.FC<DatasetPreviewProps> = ({
  qaPairs,
  sourceFileCount,
  sourceUrlCount,
  identifiedThemes,
  correctAnswerCount,
  incorrectAnswerCount,
  isAugmented = false,
  groundingMetadata,
}) => {
  const generateFilename = (format: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const augmentedSuffix = isAugmented ? '_augmented' : '';
    const totalSources = sourceFileCount + sourceUrlCount;
    return `dataset_${totalSources}_sources_${qaPairs.length}pairs${augmentedSuffix}_${timestamp}.${format}`;
  };

  const handleDownload = (format: 'csv' | 'jsonl' | 'json') => {
    const filename = generateFilename(format);
    
    switch (format) {
      case 'csv':
        DownloadService.downloadAsCSV(qaPairs, filename);
        break;
      case 'jsonl':
        DownloadService.downloadAsJSONL(qaPairs, filename);
        break;
      case 'json':
        DownloadService.downloadAsJSON(qaPairs, filename);
        break;
    }
  };

  if (qaPairs.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-gray-400 text-center py-8">
            No Q&A pairs generated. The content might be too short or not suitable for Q&A generation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const previewPairs = qaPairs.slice(0, 4);
  const webSources = groundingMetadata?.groundingChunks?.filter(chunk => chunk.web?.uri) || [];
  const totalSources = sourceFileCount + sourceUrlCount;

  return (
    <div className="space-y-6">
      {/* Dataset Overview */}
      <Card>
        <CardHeader>
          <h3 className="text-xl font-semibold text-primary-light flex items-center">
            <Lightbulb size={24} className="mr-2" />
            Generated Dataset Overview
          </h3>
          <p className="text-gray-400">
            {qaPairs.length} Q&A pairs from {totalSources} source{totalSources !== 1 ? 's' : ''}
            {sourceFileCount > 0 && ` (${sourceFileCount} file${sourceFileCount !== 1 ? 's' : ''})`}
            {sourceUrlCount > 0 && ` (${sourceUrlCount} URL${sourceUrlCount !== 1 ? 's' : ''})`}
            {isAugmented && (
              <span className="inline-flex items-center ml-2 px-2 py-1 bg-primary/20 text-primary-light rounded-full text-xs">
                <Search size={12} className="mr-1" />
                Web Enhanced
              </span>
            )}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-300 font-semibold">{correctAnswerCount}</p>
                  <p className="text-green-400 text-sm">Correct Answers</p>
                </div>
                <CheckCircle size={24} className="text-green-400" />
              </div>
            </div>
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-300 font-semibold">{incorrectAnswerCount}</p>
                  <p className="text-red-400 text-sm">Incorrect Answers</p>
                </div>
                <XCircle size={24} className="text-red-400" />
              </div>
            </div>
            <div className="bg-primary/20 border border-primary rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary-light font-semibold">{identifiedThemes.length}</p>
                  <p className="text-primary text-sm">Key Themes</p>
                </div>
                <Target size={24} className="text-primary" />
              </div>
            </div>
          </div>

          {/* Identified Themes */}
          {identifiedThemes.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-gray-300 mb-3 flex items-center">
                <TrendingUp size={18} className="mr-2 text-primary" />
                Identified Themes
              </h4>
              <div className="flex flex-wrap gap-2">
                {identifiedThemes.map((theme, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-primary/10 text-primary-light border border-primary/30 rounded-full text-sm"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sample Q&A Pairs */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-300">Sample Q&A Pairs</h4>
            {previewPairs.map((pair, index) => (
              <div key={index} className={`p-4 rounded-lg border ${
                pair.isCorrect 
                  ? 'bg-green-900/10 border-green-700/50' 
                  : 'bg-red-900/10 border-red-700/50'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start flex-1">
                    <MessageSquare size={18} className="text-primary mr-2 mt-1 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-200 text-sm">Question:</p>
                      <p className="text-gray-300 text-sm mt-1">{pair.user}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    {pair.isCorrect ? (
                      <CheckCircle size={16} className="text-green-400" />
                    ) : (
                      <XCircle size={16} className="text-red-400" />
                    )}
                    <span className={`text-xs px-2 py-1 rounded ${
                      pair.isCorrect 
                        ? 'bg-green-900/30 text-green-300' 
                        : 'bg-red-900/30 text-red-300'
                    }`}>
                      {pair.isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start">
                  <Bot size={18} className="text-accent mr-2 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-200 text-sm">Answer:</p>
                    <p className="text-gray-300 text-sm mt-1">{pair.model}</p>
                    {pair.confidence && (
                      <p className="text-xs text-gray-500 mt-1">
                        Confidence: {(pair.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {qaPairs.length > 4 && (
              <p className="text-center text-gray-400 text-sm">
                ...and {qaPairs.length - 4} more pairs ({correctAnswerCount - previewPairs.filter(p => p.isCorrect).length} correct, {incorrectAnswerCount - previewPairs.filter(p => !p.isCorrect).length} incorrect)
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Web Sources */}
      {webSources.length > 0 && (
        <Card>
          <CardHeader>
            <h4 className="text-lg font-semibold text-gray-300 flex items-center">
              <Search size={20} className="mr-2 text-primary" />
              Web Sources Used ({webSources.length})
            </h4>
            <p className="text-sm text-gray-400">
              Content was enhanced with information from these web sources
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {webSources.map((chunk, index) => (
                chunk.web && (
                  <a
                    key={index}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 bg-gray-700/50 rounded-lg text-sm text-primary-light hover:text-primary hover:bg-gray-700 transition-colors border border-gray-600 hover:border-primary/50"
                  >
                    <div className="font-medium">{chunk.web.title || 'Web Source'}</div>
                    <div className="text-xs text-gray-400 mt-1 truncate">{chunk.web.uri}</div>
                  </a>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download Options */}
      <Card>
        <CardHeader>
          <h4 className="text-lg font-semibold text-gray-300 flex items-center">
            <Download size={20} className="mr-2" />
            Download Fine-Tuning Dataset
          </h4>
          <p className="text-sm text-gray-400">
            Export your generated dataset optimized for AI fine-tuning with correct/incorrect answer labels
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => handleDownload('csv')}
            >
              Download CSV
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => handleDownload('jsonl')}
            >
              Download JSONL
            </Button>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => handleDownload('json')}
            >
              Download JSON
            </Button>
          </div>
          <div className="mt-4 p-3 bg-gray-700/30 rounded-lg">
            <p className="text-xs text-gray-400">
              <strong>Fine-tuning format:</strong> Each Q&A pair includes correctness labels and confidence scores. 
              Incorrect answers are strategically included to improve model discrimination and reduce hallucination.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};