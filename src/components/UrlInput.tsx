import React, { useState, useCallback } from 'react';
import { Link, Plus, X, Globe } from 'lucide-react';
import { UrlData } from '../types';
import { UrlService } from '../services/urlService';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

interface UrlInputProps {
  urls: UrlData[];
  onUrlsChange: (urls: UrlData[]) => void;
  disabled?: boolean;
}

export const UrlInput: React.FC<UrlInputProps> = ({
  urls,
  onUrlsChange,
  disabled = false,
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddUrl = useCallback(async () => {
    if (!inputUrl.trim() || disabled || isProcessing) return;

    const trimmedUrl = inputUrl.trim();
    
    if (!UrlService.isValidUrl(trimmedUrl)) {
      return;
    }

    // Check for duplicates
    if (urls.some(urlData => urlData.url === trimmedUrl)) {
      return;
    }

    setIsProcessing(true);
    
    try {
      const newUrls = await UrlService.processUrls([trimmedUrl]);
      onUrlsChange([...urls, ...newUrls]);
      setInputUrl('');
    } catch (error) {
      console.error('Failed to process URL:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [inputUrl, urls, onUrlsChange, disabled, isProcessing]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddUrl();
    }
  }, [handleAddUrl]);

  const removeUrl = useCallback((urlId: string) => {
    onUrlsChange(urls.filter(u => u.id !== urlId));
  }, [urls, onUrlsChange]);

  const getStatusColor = (status: UrlData['status']) => {
    switch (status) {
      case 'fetched': return 'text-blue-400';
      case 'cleaned': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'fetching': case 'cleaning': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status: UrlData['status']) => {
    switch (status) {
      case 'fetched': return 'Ready';
      case 'cleaned': return 'Processed';
      case 'failed': return 'Failed';
      case 'fetching': return 'Fetching...';
      case 'cleaning': return 'Processing...';
      default: return 'Pending';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <h3 className="text-lg font-semibold text-gray-300 flex items-center">
              <Globe size={20} className="mr-2 text-primary" />
              Add URLs
            </h3>
            <Tooltip content="Add web pages, articles, documentation, or any publicly accessible URL. The system will automatically extract and clean the text content for dataset generation." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <div className="flex-1">
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="https://example.com/article"
                disabled={disabled || isProcessing}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <Button
              onClick={handleAddUrl}
              disabled={!inputUrl.trim() || disabled || isProcessing || !UrlService.isValidUrl(inputUrl.trim())}
              loading={isProcessing}
              icon={Plus}
              variant="primary"
            >
              Add URL
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Enter a valid HTTP or HTTPS URL to fetch content from web pages
          </p>
        </CardContent>
      </Card>

      {urls.length > 0 && (
        <Card>
          <CardContent>
            <h4 className="text-lg font-semibold text-gray-300 mb-4">
              Added URLs ({urls.length})
            </h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {urls.map((urlData) => (
                <div
                  key={urlData.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border
                    ${urlData.status === 'failed' 
                      ? 'bg-red-900/20 border-red-700' 
                      : urlData.status === 'cleaned'
                        ? 'bg-green-900/20 border-green-700'
                        : 'bg-gray-700/50 border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Link size={20} className="text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-300 truncate">
                        {urlData.title || urlData.url}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-gray-400">
                        <span className="truncate">{urlData.url}</span>
                        <span>•</span>
                        <span className={getStatusColor(urlData.status)}>
                          {getStatusText(urlData.status)}
                        </span>
                      </div>
                      {urlData.error && (
                        <p className="text-xs text-red-400 mt-1">{urlData.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeUrl(urlData.id)}
                    className="ml-2 p-1 border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-400"
                  >
                    <X size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};