import React from 'react';
import { MessageSquare, Bot, Download } from 'lucide-react';
import { QAPair, GroundingMetadata } from '../types';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { DownloadService } from '../services/downloadService';

interface DatasetPreviewProps {
  qaPairs: QAPair[];
  sourceFileCount: number;
  isAugmented?: boolean;
  groundingMetadata?: GroundingMetadata;
}

export const DatasetPreview: React.FC<DatasetPreviewProps> = ({
  qaPairs,
  sourceFileCount,
  isAugmented = false,
  groundingMetadata,
}) => {
  const generateFilename = (format: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const augmentedSuffix = isAugmented ? '_augmented' : '';
    return `dataset_${sourceFileCount}_files${augmentedSuffix}_${timestamp}.${format}`;
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

  const previewPairs = qaPairs.slice(0, 3);
  const webSources = groundingMetadata?.groundingChunks?.filter(chunk => chunk.web?.uri) || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-xl font-semibold text-primary-light">
            Generated Dataset Preview
          </h3>
          <p className="text-gray-400">
            {qaPairs.length} Q&A pairs from {sourceFileCount} file{sourceFileCount !== 1 ? 's' : ''}
            {isAugmented && ' (augmented with web content)'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {previewPairs.map((pair, index) => (
              <div key={index} className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-start mb-3">
                  <MessageSquare size={18} className="text-primary mr-2 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-200 text-sm">Question:</p>
                    <p className="text-gray-300 text-sm mt-1">{pair.user}</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <Bot size={18} className="text-accent mr-2 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-200 text-sm">Answer:</p>
                    <p className="text-gray-300 text-sm mt-1">{pair.model}</p>
                  </div>
                </div>
              </div>
            ))}
            {qaPairs.length > 3 && (
              <p className="text-center text-gray-400 text-sm">
                ...and {qaPairs.length - 3} more pairs
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {webSources.length > 0 && (
        <Card>
          <CardHeader>
            <h4 className="text-lg font-semibold text-gray-300">Web Sources Used</h4>
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
                    className="block p-2 bg-gray-700/50 rounded text-sm text-primary-light hover:text-primary hover:bg-gray-700 transition-colors"
                  >
                    {chunk.web.title || chunk.web.uri}
                  </a>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h4 className="text-lg font-semibold text-gray-300">Download Dataset</h4>
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
        </CardContent>
      </Card>
    </div>
  );
};