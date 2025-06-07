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
      case 'fetched': return 'status-correct';
      case 'cleaned': return 'status-correct';
      case 'failed': return 'status-incorrect';
      case 'fetching': case 'cleaning': return 'status-processing';
      default: return 'text-muted';
    }
  };

  const getStatusText = (status: UrlData['status']) => {
    switch (status) {
      case 'fetched': return 'READY';
      case 'cleaned': return 'PROCESSED';
      case 'failed': return 'FAILED';
      case 'fetching': return 'FETCHING...';
      case 'cleaning': return 'PROCESSING...';
      default: return 'PENDING';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <h3 className="text-xl font-bold text-primary flex items-center font-mono tracking-wide">
              <Globe 
                size={24} 
                className="mr-3 text-accent" 
                style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
              />
              ADD URLs
            </h3>
            <Tooltip content="Add web pages, articles, documentation, or any publicly accessible URL. The system will automatically extract and clean the text content for dataset generation." />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-3">
            <div className="flex-1">
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="https://example.com/article"
                disabled={disabled || isProcessing}
                className="w-full px-4 py-3 cyber-input text-foreground placeholder-muted focus:text-primary font-mono"
                style={{
                  background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8), rgba(26, 26, 26, 0.6))',
                }}
              />
            </div>
            <Button
              onClick={handleAddUrl}
              disabled={!inputUrl.trim() || disabled || isProcessing || !UrlService.isValidUrl(inputUrl.trim())}
              loading={isProcessing}
              icon={Plus}
              variant="primary"
              className="px-6"
            >
              ADD URL
            </Button>
          </div>
          <p className="text-muted text-sm mt-3 font-mono">
            <span className="text-accent">ENTER</span> a valid HTTP or HTTPS URL to fetch content from web pages
          </p>
        </CardContent>
      </Card>

      {urls.length > 0 && (
        <Card>
          <CardContent>
            <h4 className="text-xl font-bold text-primary mb-6 font-mono tracking-wide">
              ADDED URLs ({urls.length})
            </h4>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {urls.map((urlData) => (
                <div
                  key={urlData.id}
                  className={`
                    flex items-center justify-between p-4 rounded-lg border transition-all duration-300
                    ${urlData.status === 'failed' 
                      ? 'cyber-alert-error border-error' 
                      : urlData.status === 'cleaned' || urlData.status === 'fetched'
                        ? 'cyber-alert-success border-success'
                        : 'bg-surface/50 border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <Link 
                      size={24} 
                      className="text-accent flex-shrink-0" 
                      style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground font-semibold truncate font-mono">
                        {urlData.title || urlData.url}
                      </p>
                      <div className="flex items-center space-x-3 text-sm mt-1">
                        <span className="text-muted truncate font-mono">{urlData.url}</span>
                        <span className="text-border">•</span>
                        <span className={`${getStatusColor(urlData.status)} font-bold font-mono tracking-wide`}>
                          {getStatusText(urlData.status)}
                        </span>
                      </div>
                      {urlData.error && (
                        <p className="text-error text-sm mt-1 font-mono">{urlData.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeUrl(urlData.id)}
                    className="ml-4 p-2 border-error text-error hover:bg-error hover:text-background"
                  >
                    <X size={18} />
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