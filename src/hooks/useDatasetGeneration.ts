import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData } from '../types';
import { geminiService } from '../services/geminiService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  error: string | null;
  generateDataset: (files: FileData[], urls: UrlData[], enableWebAugmentation: boolean) => Promise<void>;
  clearError: () => void;
}

export const useDatasetGeneration = (): UseDatasetGenerationReturn => {
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean
  ) => {
    if (!geminiService.isReady()) {
      setError('Gemini service is not initialized. Please check your API key.');
      return;
    }

    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    const readyUrls = urls.filter(u => u.status === 'fetched' && u.rawContent.trim());
    
    if (readyFiles.length === 0 && readyUrls.length === 0) {
      setError('No valid files or URLs ready for processing.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessedData(null);
    setCurrentStep('Starting dataset generation...');

    try {
      // Step 1: Clean content from files and URLs
      const cleanedTexts: string[] = [];
      const successfulSources: string[] = [];

      // Process files
      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        setCurrentStep(`Processing file ${file.file.name} (${i + 1}/${readyFiles.length + readyUrls.length})...`);

        try {
          let cleanedText: string;
          
          if (file.isBinary) {
            cleanedText = await geminiService.cleanBinaryContent(
              file.rawContent,
              file.mimeType,
              file.file.name
            );
          } else {
            cleanedText = await geminiService.cleanTextContent(
              file.rawContent,
              file.file.name
            );
          }

          if (cleanedText.trim()) {
            cleanedTexts.push(cleanedText);
            successfulSources.push(file.file.name);
          }
        } catch (err) {
          console.error(`Failed to process ${file.file.name}:`, err);
          // Continue with other sources
        }
      }

      // Process URLs
      for (let i = 0; i < readyUrls.length; i++) {
        const urlData = readyUrls[i];
        setCurrentStep(`Processing URL ${urlData.title || urlData.url} (${readyFiles.length + i + 1}/${readyFiles.length + readyUrls.length})...`);

        try {
          const cleanedText = await geminiService.cleanTextContent(
            urlData.rawContent,
            urlData.title || urlData.url
          );

          if (cleanedText.trim()) {
            cleanedTexts.push(cleanedText);
            successfulSources.push(urlData.title || urlData.url);
          }
        } catch (err) {
          console.error(`Failed to process ${urlData.url}:`, err);
          // Continue with other sources
        }
      }

      if (cleanedTexts.length === 0) {
        throw new Error('No content could be extracted from any sources.');
      }

      // Step 2: Combine content
      let combinedContent = cleanedTexts.join('\n\n---\n\n');
      let groundingMetadata;
      let isAugmented = false;

      // Step 3: Web augmentation (if enabled)
      if (enableWebAugmentation) {
        setCurrentStep('Identifying themes for targeted web search...');
        
        try {
          // Identify themes from the combined content
          const identifiedThemes = await geminiService.identifyThemes(combinedContent);
          
          if (identifiedThemes.length > 0) {
            setCurrentStep(`Found ${identifiedThemes.length} themes: ${identifiedThemes.join(', ')}`);
          }

          setCurrentStep('Augmenting content with targeted web search...');
          const result = await geminiService.augmentWithWebSearch(combinedContent, identifiedThemes);
          combinedContent = result.augmentedText;
          groundingMetadata = result.groundingMetadata;
          isAugmented = true;
        } catch (err) {
          console.error('Web augmentation failed:', err);
          setError('Web augmentation failed, proceeding with original content.');
        }
      }

      // Step 4: Generate Q&A pairs
      setCurrentStep('Generating Q&A pairs...');
      const qaPairs = await geminiService.generateQAPairs(combinedContent);

      setProcessedData({
        combinedCleanedText: combinedContent,
        qaPairs,
        sourceFileCount: readyFiles.length,
        sourceUrlCount: readyUrls.length,
        isAugmented,
        groundingMetadata,
      });

      setCurrentStep(`Successfully generated ${qaPairs.length} Q&A pairs!`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setCurrentStep('');
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    processedData,
    isProcessing,
    currentStep,
    error,
    generateDataset,
    clearError,
  };
};