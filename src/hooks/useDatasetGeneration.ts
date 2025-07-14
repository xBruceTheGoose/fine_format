import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair, ValidationResult } from '../types/index';
import { geminiService } from '../services/geminiService';
import { openRouterService } from '../services/openRouterService';
import { metricsService } from '../services/metricsService';
import { notificationService } from '../services/notificationService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  estimatedTimeRemaining: number;
  totalEstimatedTime: number;
  error: string | null;
  generateDataset: (
    files: FileData[],
    urls: UrlData[],
    fineTuningGoal: FineTuningGoal,
    enableWebAugmentation: boolean,
    enableGapFilling: boolean
  ) => Promise<void>;
  clearError: () => void;
}

export const useDatasetGeneration = (): UseDatasetGenerationReturn => {
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    fineTuningGoal: FineTuningGoal,
    enableWebAugmentation: boolean,
    enableGapFilling: boolean
  ) => {
    console.log('[DATASET_GENERATION] Starting dataset generation process');
    console.log('[DATASET_GENERATION] Parameters:', {
      filesCount: files.length,
      urlsCount: urls.length,
      fineTuningGoal,
      enableWebAugmentation,
      enableGapFilling
    });

    const startTime = Date.now();
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setProcessedData(null);

    // Request notification permission early
    await notificationService.requestPermission();

    try {
      // Step 1: Combine content from files and URLs
      setCurrentStep('Combining content from sources...');
      setProgress(10);

      const readyFiles = files.filter(f => f.status === 'read');
      const readyUrls = urls.filter(u => u.status === 'fetched');
      
      let combinedContent = '';
      
      // Add file content
      for (const file of readyFiles) {
        if (file.content) {
          combinedContent += `\n\n--- Content from ${file.name} ---\n${file.content}`;
        }
      }
      
      // Add URL content
      for (const url of readyUrls) {
        if (url.content) {
          combinedContent += `\n\n--- Content from ${url.url} ---\n${url.content}`;
        }
      }

      if (!combinedContent.trim()) {
        throw new Error('No content available from sources');
      }

      console.log('[DATASET_GENERATION] Combined content length:', combinedContent.length);

      // Step 2: Identify themes and key concepts
      setCurrentStep('Analyzing content themes...');
      setProgress(20);

      const identifiedThemes = await geminiService.identifyThemes(combinedContent, fineTuningGoal);
      console.log('[DATASET_GENERATION] Identified themes:', identifiedThemes);

      // Step 3: Web augmentation (if enabled)
      let augmentedContent = combinedContent;
      if (enableWebAugmentation) {
        setCurrentStep('Augmenting with web research...');
        setProgress(30);
        
        try {
          const webContent = await geminiService.performWebResearch(identifiedThemes, fineTuningGoal);
          if (webContent) {
            augmentedContent += `\n\n--- Web Research Results ---\n${webContent}`;
            console.log('[DATASET_GENERATION] Web augmentation completed');
          }
        } catch (webError) {
          console.warn('[DATASET_GENERATION] Web augmentation failed:', webError);
          // Continue without web augmentation
        }
      }

      // Step 4: Generate initial Q&A pairs
      setCurrentStep('Generating Q&A pairs...');
      setProgress(40);

      let qaPairs: QAPair[];
      try {
        qaPairs = await geminiService.generateQAPairs(augmentedContent, fineTuningGoal);
        console.log('[DATASET_GENERATION] Generated Q&A pairs:', qaPairs.length);
      } catch (qaError) {
        console.error('[DATASET_GENERATION] Q&A generation failed:', qaError);
        throw new Error(`Failed to generate Q&A pairs: ${qaError.message}`);
      }

      // Step 5: Knowledge gap analysis and filling (if enabled)
      let knowledgeGaps: KnowledgeGap[] = [];
      let syntheticPairs: SyntheticQAPair[] = [];
      
      if (enableGapFilling && qaPairs.length > 0) {
        setCurrentStep('Identifying knowledge gaps...');
        setProgress(60);

        try {
          knowledgeGaps = await geminiService.identifyKnowledgeGaps(qaPairs, augmentedContent, fineTuningGoal);
          console.log('[DATASET_GENERATION] Identified knowledge gaps:', knowledgeGaps.length);

          if (knowledgeGaps.length > 0) {
            setCurrentStep('Generating synthetic Q&A pairs...');
            setProgress(70);

            syntheticPairs = await geminiService.generateSyntheticQAPairs(knowledgeGaps, augmentedContent, fineTuningGoal);
            console.log('[DATASET_GENERATION] Generated synthetic pairs:', syntheticPairs.length);
          }
        } catch (gapError) {
          console.warn('[DATASET_GENERATION] Gap filling failed:', gapError);
          // Continue without gap filling
        }
      }

      // Step 6: Validation
      setCurrentStep('Validating Q&A pairs...');
      setProgress(80);

      let validationResults: ValidationResult[] = [];
      try {
        validationResults = await geminiService.validateQAPairs(qaPairs, augmentedContent);
        console.log('[DATASET_GENERATION] Validation completed:', validationResults.length);
      } catch (validationError) {
        console.warn('[DATASET_GENERATION] Validation failed:', validationError);
        // Continue without validation
      }

      // Step 7: Generate incorrect answers for fine-tuning
      setCurrentStep('Generating incorrect answers...');
      setProgress(90);

      let incorrectPairs: QAPair[] = [];
      try {
        incorrectPairs = await geminiService.generateIncorrectAnswers(qaPairs, fineTuningGoal);
        console.log('[DATASET_GENERATION] Generated incorrect pairs:', incorrectPairs.length);
      } catch (incorrectError) {
        console.warn('[DATASET_GENERATION] Incorrect answer generation failed:', incorrectError);
        // Continue without incorrect answers
      }

      // Step 8: Combine all pairs
      const allQAPairs = [
        ...qaPairs.map(pair => ({ ...pair, isCorrect: true, confidence: 0.9 })),
        ...syntheticPairs.map(pair => ({ 
          ...pair, 
          user: pair.question, 
          model: pair.answer, 
          isCorrect: true, 
          confidence: pair.confidence || 0.8 
        })),
        ...incorrectPairs.map(pair => ({ ...pair, isCorrect: false, confidence: 0.2 }))
      ];

      // Step 9: Finalize results
      setCurrentStep('Finalizing dataset...');
      setProgress(95);

      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000);

      const result: ProcessedData = {
        qaPairs: allQAPairs,
        knowledgeGaps,
        syntheticPairs,
        validationResults,
        themes: identifiedThemes,
        sourceCount: readyFiles.length + readyUrls.length,
        generatedAt: new Date().toISOString(),
        processingTimeSeconds: totalTime,
        fineTuningGoal,
        webAugmentationUsed: enableWebAugmentation,
        gapFillingUsed: enableGapFilling
      };

      setProcessedData(result);
      setProgress(100);
      setCurrentStep('Dataset generation complete!');

      // Update metrics
      await metricsService.updateMetrics({
        success: true,
        size: allQAPairs.length,
        timeElapsed: totalTime,
        successRate: allQAPairs.filter(p => p.isCorrect).length / allQAPairs.length
      });

      // Send completion notification
      const correctCount = allQAPairs.filter(p => p.isCorrect).length;
      const incorrectCount = allQAPairs.filter(p => !p.isCorrect).length;
      await notificationService.sendCompletionNotification(allQAPairs.length, correctCount, incorrectCount);

      console.log('[DATASET_GENERATION] Process completed successfully');
      console.log('[DATASET_GENERATION] Total Q&A pairs:', allQAPairs.length);
      console.log('[DATASET_GENERATION] Processing time:', totalTime, 'seconds');

    } catch (error) {
      const endTime = Date.now();
      const totalTime = Math.round((endTime - startTime) / 1000);
      
      console.error('[DATASET_GENERATION] Process failed after', totalTime, 'seconds');
      console.error('[DATASET_GENERATION] Error details:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      
      // Update metrics for failure
      await metricsService.updateMetrics({
        success: false,
        size: 0,
        timeElapsed: totalTime,
        successRate: 0
      });

      // Send error notification
      await notificationService.sendErrorNotification(errorMessage);
      
    } finally {
      setIsProcessing(false);
      setEstimatedTimeRemaining(0);
    }
  }, []);

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