import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal } from '../types';
import { geminiService } from '../services/geminiService';
import { openRouterService } from '../services/openRouterService';
import { fileService } from '../services/fileService';
import { urlService } from '../services/urlService';
import { metricsService } from '../services/metricsService';
import { notificationService } from '../services/notificationService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData[];
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  estimatedTimeRemaining: number;
  totalEstimatedTime: number;
  error: string | null;
  generateDataset: (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling?: boolean
  ) => Promise<void>;
  clearError: () => void;
}

export const useDatasetGeneration = (): UseDatasetGenerationReturn => {
  const [processedData, setProcessedData] = useState<ProcessedData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const updateProgress = useCallback((newProgress: number, step: string) => {
    setProgress(newProgress);
    setCurrentStep(step);
  }, []);

  const calculateTimeEstimates = useCallback((currentProgress: number, startTime: number) => {
    const elapsed = Date.now() - startTime;
    const rate = currentProgress / elapsed;
    const remaining = rate > 0 ? (100 - currentProgress) / rate : 0;
    const total = rate > 0 ? 100 / rate : 0;
    
    setEstimatedTimeRemaining(Math.round(remaining / 1000));
    setTotalEstimatedTime(Math.round(total / 1000));
  }, []);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling: boolean = false
  ) => {
    const startTime = Date.now();
    let success = false;
    let finalDatasetSize = 0;
    
    try {
      console.log('[DATASET_GENERATION] Starting comprehensive dataset generation process');
      setIsProcessing(true);
      setError(null);
      setProcessedData([]);
      updateProgress(0, 'Initializing dataset generation...');

      // Validate inputs
      if (!files.length && !urls.length) {
        throw new Error('No files or URLs provided for processing');
      }

      console.log('[DATASET_GENERATION] Processing', files.length, 'files and', urls.length, 'URLs');

      const allSources = [...files, ...urls];
      const totalSources = allSources.length;
      let processedSources = 0;

      const results: ProcessedData[] = [];

      // Process files
      for (const file of files) {
        try {
          updateProgress(
            (processedSources / totalSources) * 80,
            `Processing file: ${file.name}`
          );
          calculateTimeEstimates((processedSources / totalSources) * 80, startTime);

          console.log('[DATASET_GENERATION] Processing file:', file.name);
          
          // Extract content from file
          const content = await fileService.extractContent(file);
          if (!content || content.trim().length === 0) {
            console.warn('[DATASET_GENERATION] No content extracted from file:', file.name);
            processedSources++;
            continue;
          }

          // Generate Q&A pairs using Gemini with OpenRouter fallback
          let qaData;
          try {
            qaData = await geminiService.generateQAPairs(content, fineTuningGoal);
          } catch (geminiError) {
            console.warn('[DATASET_GENERATION] Gemini failed, trying OpenRouter fallback:', geminiError);
            qaData = await openRouterService.generateQAPairs(content, fineTuningGoal);
          }

          if (qaData && qaData.length > 0) {
            const processedItem: ProcessedData = {
              id: `file-${Date.now()}-${Math.random()}`,
              source: file.name,
              type: 'file',
              content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
              qaData,
              timestamp: new Date().toISOString(),
            };
            results.push(processedItem);
            console.log('[DATASET_GENERATION] Generated', qaData.length, 'Q&A pairs from file:', file.name);
          }
        } catch (error) {
          console.error('[DATASET_GENERATION] Error processing file:', file.name, error);
          // Continue with other files
        }
        processedSources++;
      }

      // Process URLs
      for (const url of urls) {
        try {
          updateProgress(
            (processedSources / totalSources) * 80,
            `Processing URL: ${url.url}`
          );
          calculateTimeEstimates((processedSources / totalSources) * 80, startTime);

          console.log('[DATASET_GENERATION] Processing URL:', url.url);
          
          // Extract content from URL
          const content = await urlService.extractContent(url.url);
          if (!content || content.trim().length === 0) {
            console.warn('[DATASET_GENERATION] No content extracted from URL:', url.url);
            processedSources++;
            continue;
          }

          // Generate Q&A pairs using Gemini with OpenRouter fallback
          let qaData;
          try {
            qaData = await geminiService.generateQAPairs(content, fineTuningGoal);
          } catch (geminiError) {
            console.warn('[DATASET_GENERATION] Gemini failed, trying OpenRouter fallback:', geminiError);
            qaData = await openRouterService.generateQAPairs(content, fineTuningGoal);
          }

          if (qaData && qaData.length > 0) {
            const processedItem: ProcessedData = {
              id: `url-${Date.now()}-${Math.random()}`,
              source: url.url,
              type: 'url',
              content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
              qaData,
              timestamp: new Date().toISOString(),
            };
            results.push(processedItem);
            console.log('[DATASET_GENERATION] Generated', qaData.length, 'Q&A pairs from URL:', url.url);
          }
        } catch (error) {
          console.error('[DATASET_GENERATION] Error processing URL:', url.url, error);
          // Continue with other URLs
        }
        processedSources++;
      }

      // Web augmentation
      if (enableWebAugmentation && results.length > 0) {
        updateProgress(85, 'Performing web augmentation...');
        console.log('[DATASET_GENERATION] Starting web augmentation');
        // Web augmentation logic would go here
      }

      // Gap filling
      if (enableGapFilling && results.length > 0) {
        updateProgress(90, 'Filling knowledge gaps...');
        console.log('[DATASET_GENERATION] Starting gap filling');
        // Gap filling logic would go here
      }

      // Finalize
      updateProgress(95, 'Finalizing dataset...');
      setProcessedData(results);
      finalDatasetSize = results.reduce((total, item) => total + item.qaData.length, 0);
      
      updateProgress(100, `Dataset generation complete! Generated ${finalDatasetSize} Q&A pairs from ${results.length} sources.`);
      
      success = true;
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      console.log('[DATASET_GENERATION] Process completed successfully in', processingTime, 'seconds');
      console.log('[DATASET_GENERATION] Total Q&A pairs generated:', finalDatasetSize);

      // Send success notification
      try {
        await notificationService.sendSuccessNotification(
          `Dataset generation complete! Generated ${finalDatasetSize} Q&A pairs.`
        );
      } catch (notificationError) {
        console.warn('[DATASET_GENERATION] Failed to send success notification:', notificationError);
      }

    } catch (err) {
      success = false;
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[DATASET_GENERATION] Process failed after', processingTime, 'seconds');
      console.error('[DATASET_GENERATION] Process failed with error:', errorMessage);
      console.error('[DATASET_GENERATION] Error stack:', err);
      setError(`Critical error: ${errorMessage}`);
      setCurrentStep('Process failed. See error details.');
      setProgress(0);

      try {
        await notificationService.sendErrorNotification(errorMessage);
      } catch (notificationError) {
        console.warn('[DATASET_GENERATION] Failed to send error notification:', notificationError);
      }
    } finally {
      console.log('[DATASET_GENERATION] Process finished, setting isProcessing to false');
      
      // Send metrics to tracking service
      try {
        const processingTime = Math.round((Date.now() - startTime) / 1000);
        await metricsService.updateMetrics({
          success,
          size: finalDatasetSize,
          timeElapsed: processingTime,
          successRate: success ? 1 : 0
        });
      } catch (metricsError) {
        console.warn('[DATASET_GENERATION] Failed to update metrics:', metricsError);
      }
      
      setIsProcessing(false);
    }
  }, [updateProgress, calculateTimeEstimates]);

  return {
    processedData,
    isProcessing,
    currentStep,
    progress,
    estimatedTimeRemaining,
    totalEstimatedTime,
    error,
    generateDataset,
    clearError,
  };
};