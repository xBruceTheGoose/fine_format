import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal } from '../types';
import { geminiService } from '../services/geminiService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  error: string | null;
  generateDataset: (files: FileData[], urls: UrlData[], enableWebAugmentation: boolean, fineTuningGoal: FineTuningGoal) => Promise<void>;
  clearError: () => void;
}

export const useDatasetGeneration = (): UseDatasetGenerationReturn => {
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const updateProgress = useCallback((step: number, total: number, message: string) => {
    const progressPercent = Math.round((step / total) * 100);
    setProgress(progressPercent);
    setCurrentStep(message);
  }, []);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal
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
    setProgress(0);

    try {
      const totalSources = readyFiles.length + readyUrls.length;
      const totalSteps = totalSources + (enableWebAugmentation ? 4 : 2); // +1 for theme identification, +1 for Q&A generation, +2 for web search
      let currentStepIndex = 0;

      // Step 1: Clean content from files and URLs
      const cleanedTexts: string[] = [];
      const successfulSources: string[] = [];

      // Process files
      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        currentStepIndex++;
        updateProgress(currentStepIndex, totalSteps, `Processing file: ${file.file.name}`);

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
        currentStepIndex++;
        updateProgress(currentStepIndex, totalSteps, `Processing URL: ${urlData.title || urlData.url}`);

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

      // Step 2: Combine content and identify themes
      let combinedContent = cleanedTexts.join('\n\n---\n\n');
      currentStepIndex++;
      updateProgress(currentStepIndex, totalSteps, 'Analyzing content and identifying key themes...');
      
      const identifiedThemes = await geminiService.identifyThemes(combinedContent, fineTuningGoal);
      
      let groundingMetadata;
      let isAugmented = false;

      // Step 3: Web augmentation (if enabled)
      if (enableWebAugmentation) {
        if (identifiedThemes.length > 0) {
          currentStepIndex++;
          updateProgress(currentStepIndex, totalSteps, `Found ${identifiedThemes.length} themes: ${identifiedThemes.slice(0, 2).join(', ')}${identifiedThemes.length > 2 ? '...' : ''}`);
        }

        currentStepIndex++;
        updateProgress(currentStepIndex, totalSteps, 'Enhancing content with targeted web research...');
        try {
          const result = await geminiService.augmentWithWebSearch(combinedContent, identifiedThemes, fineTuningGoal);
          combinedContent = result.augmentedText;
          groundingMetadata = result.groundingMetadata;
          isAugmented = true;
        } catch (err) {
          console.error('Web augmentation failed:', err);
          setError('Web augmentation failed, proceeding with original content.');
        }
      }

      // Final step: Generate comprehensive Q&A pairs
      currentStepIndex++;
      updateProgress(currentStepIndex, totalSteps, 'Generating 100+ intelligent Q&A pairs with correct and incorrect answers...');
      const qaPairs = await geminiService.generateQAPairs(combinedContent, identifiedThemes, fineTuningGoal);

      const correctAnswers = qaPairs.filter(pair => pair.isCorrect);
      const incorrectAnswers = qaPairs.filter(pair => !pair.isCorrect);

      setProcessedData({
        combinedCleanedText: combinedContent,
        qaPairs,
        sourceFileCount: readyFiles.length,
        sourceUrlCount: readyUrls.length,
        identifiedThemes,
        isAugmented,
        groundingMetadata,
        correctAnswerCount: correctAnswers.length,
        incorrectAnswerCount: incorrectAnswers.length,
      });

      setProgress(100);
      setCurrentStep(`Successfully generated ${qaPairs.length} Q&A pairs (${correctAnswers.length} correct, ${incorrectAnswers.length} incorrect) from ${successfulSources.length} sources!`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setCurrentStep('');
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  }, [updateProgress]);

  return {
    processedData,
    isProcessing,
    currentStep,
    progress,
    error,
    generateDataset,
    clearError,
  };
};