import { useState, useCallback } from 'react';
import { FileData, ProcessedData } from '../types';
import { geminiService } from '../services/geminiService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  error: string | null;
  generateDataset: (files: FileData[], enableWebAugmentation: boolean) => Promise<void>;
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
    enableWebAugmentation: boolean
  ) => {
    if (!geminiService.isReady()) {
      setError('Gemini service is not initialized. Please check your API key.');
      return;
    }

    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    if (readyFiles.length === 0) {
      setError('No valid files ready for processing.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessedData(null);
    setCurrentStep('Starting dataset generation...');

    try {
      // Step 1: Clean content from files
      const cleanedTexts: string[] = [];
      const successfulFiles: string[] = [];

      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        setCurrentStep(`Processing ${file.file.name} (${i + 1}/${readyFiles.length})...`);

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
            successfulFiles.push(file.file.name);
          }
        } catch (err) {
          console.error(`Failed to process ${file.file.name}:`, err);
          // Continue with other files
        }
      }

      if (cleanedTexts.length === 0) {
        throw new Error('No content could be extracted from any files.');
      }

      // Step 2: Combine content
      let combinedContent = cleanedTexts.join('\n\n---\n\n');
      let groundingMetadata;
      let isAugmented = false;

      // Step 3: Web augmentation (if enabled)
      if (enableWebAugmentation) {
        setCurrentStep('Augmenting content with web search...');
        try {
          const result = await geminiService.augmentWithWebSearch(combinedContent);
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
        sourceFileCount: successfulFiles.length,
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