import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair, ValidationResult } from '../types';
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
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling?: boolean
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
      setProcessedData(null);
      updateProgress(0, 'Initializing dataset generation...');

      // Request notification permission if supported
      try {
        if (notificationService.isSupported()) {
          await notificationService.requestPermission();
        }
      } catch (notificationError) {
        console.warn('[DATASET_GENERATION] Failed to request notification permission:', notificationError);
      }

      // Validate inputs
      const readyFiles = files.filter(f => f.status === 'read' || f.status === 'cleaned');
      const readyUrls = urls.filter(u => u.status === 'fetched' || u.status === 'cleaned');
      
      if (readyFiles.length === 0 && readyUrls.length === 0) {
        throw new Error('No ready files or URLs available for processing. Please ensure your files and URLs have been successfully loaded.');
      }

      console.log('[DATASET_GENERATION] Processing', readyFiles.length, 'files and', readyUrls.length, 'URLs');

      // Step 1: Combine and clean content (5%)
      updateProgress(5, 'Combining and cleaning content...');
      calculateTimeEstimates(5, startTime);

      let combinedContent = '';
      
      // Process files
      for (const file of readyFiles) {
        if (file.cleanedText) {
          combinedContent += `\n\n=== ${file.file.name} ===\n${file.cleanedText}`;
        } else if (file.rawContent && !file.isBinary) {
          combinedContent += `\n\n=== ${file.file.name} ===\n${file.rawContent}`;
        } else if (file.isBinary && file.rawContent) {
          // For binary files, we need to extract text content
          try {
            updateProgress(7, `Extracting text from ${file.file.name}...`);
            let extractedText = '';
            
            if (file.mimeType === 'application/pdf') {
              const response = await fetch('/.netlify/functions/process-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  base64Data: file.rawContent,
                  fileName: file.file.name
                })
              });
              
              if (response.ok) {
                const result = await response.json();
                extractedText = result.extractedText || '';
              }
            } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              const response = await fetch('/.netlify/functions/process-docx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  base64Data: file.rawContent,
                  fileName: file.file.name
                })
              });
              
              if (response.ok) {
                const result = await response.json();
                extractedText = result.extractedText || '';
              }
            }
            
            if (extractedText.trim()) {
              combinedContent += `\n\n=== ${file.file.name} ===\n${extractedText}`;
            }
          } catch (extractError) {
            console.warn(`[DATASET_GENERATION] Failed to extract text from ${file.file.name}:`, extractError);
          }
        }
      }

      // Process URLs
      for (const url of readyUrls) {
        if (url.rawContent) {
          combinedContent += `\n\n=== ${url.title || url.url} ===\n${url.rawContent}`;
        }
      }

      if (!combinedContent.trim()) {
        throw new Error('No content could be extracted from the provided files and URLs. Please check that your files contain readable text and URLs point to accessible content.');
      }

      console.log('[DATASET_GENERATION] Combined content length:', combinedContent.length);

      // Step 2: Identify themes (10%)
      updateProgress(10, 'Identifying key themes...');
      calculateTimeEstimates(10, startTime);

      let identifiedThemes: string[] = [];
      try {
        identifiedThemes = await geminiService.identifyThemes(combinedContent, fineTuningGoal);
        console.log('[DATASET_GENERATION] Identified themes:', identifiedThemes);
      } catch (themeError) {
        console.warn('[DATASET_GENERATION] Theme identification failed:', themeError);
        identifiedThemes = ['General Knowledge', 'Key Concepts', 'Important Information'];
      }

      // Step 3: Web augmentation (optional, 15-25%)
      let groundingMetadata;
      let augmentedContent = combinedContent;
      let isAugmented = false;

      if (enableWebAugmentation) {
        updateProgress(15, 'Enhancing content with web search...');
        calculateTimeEstimates(15, startTime);

        try {
          const augmentationResult = await geminiService.augmentWithWebSearch(
            combinedContent,
            identifiedThemes,
            fineTuningGoal
          );
          
          if (augmentationResult.augmentedText && augmentationResult.augmentedText !== combinedContent) {
            augmentedContent = augmentationResult.augmentedText;
            groundingMetadata = augmentationResult.groundingMetadata;
            isAugmented = true;
            console.log('[DATASET_GENERATION] Web augmentation completed, enhanced content length:', augmentedContent.length);
          }
        } catch (augmentError) {
          console.warn('[DATASET_GENERATION] Web augmentation failed:', augmentError);
        }
      }

      // Step 4: Generate initial Q&A pairs (25-60%)
      updateProgress(enableWebAugmentation ? 25 : 15, 'Generating Q&A pairs...');
      calculateTimeEstimates(enableWebAugmentation ? 25 : 15, startTime);

      let qaPairs: QAPair[] = [];
      try {
        qaPairs = await geminiService.generateQAPairs(
          augmentedContent,
          identifiedThemes,
          fineTuningGoal,
          true // Enable OpenRouter fallback
        );
        console.log('[DATASET_GENERATION] Generated', qaPairs.length, 'initial Q&A pairs');
      } catch (qaError) {
        console.error('[DATASET_GENERATION] Q&A generation failed:', qaError);
        throw new Error(`Failed to generate Q&A pairs: ${qaError.message}`);
      }

      if (qaPairs.length === 0) {
        throw new Error('No Q&A pairs could be generated from the content. The content may be too short or not suitable for Q&A generation.');
      }

      // Step 5: Knowledge gap analysis and synthetic generation (optional, 60-90%)
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      if (enableGapFilling && openRouterService.isReady()) {
        updateProgress(60, 'Analyzing knowledge gaps...');
        calculateTimeEstimates(60, startTime);

        try {
          identifiedGaps = await geminiService.identifyKnowledgeGaps(
            augmentedContent,
            identifiedThemes,
            qaPairs,
            fineTuningGoal
          );
          console.log('[DATASET_GENERATION] Identified', identifiedGaps.length, 'knowledge gaps');

          if (identifiedGaps.length > 0) {
            updateProgress(70, 'Generating synthetic Q&A pairs...');
            calculateTimeEstimates(70, startTime);

            // Generate validation context
            const validationContext = await openRouterService.generateValidationContext(
              augmentedContent,
              identifiedThemes,
              qaPairs,
              identifiedGaps,
              [],
              fineTuningGoal
            );

            // Generate synthetic Q&A pairs
            const syntheticPairs = await openRouterService.generateSyntheticQAPairs(
              augmentedContent,
              identifiedGaps,
              fineTuningGoal,
              75, // Target count
              (current, total, gapId) => {
                const progressPercent = 70 + (current / total) * 15;
                updateProgress(progressPercent, `Generating synthetic pairs for gap: ${gapId}`);
                calculateTimeEstimates(progressPercent, startTime);
              }
            );

            syntheticPairCount = syntheticPairs.length;
            console.log('[DATASET_GENERATION] Generated', syntheticPairCount, 'synthetic pairs');

            if (syntheticPairs.length > 0) {
              updateProgress(85, 'Validating synthetic Q&A pairs...');
              calculateTimeEstimates(85, startTime);

              // Validate synthetic pairs
              const validatedPairs: QAPair[] = [];
              for (let i = 0; i < syntheticPairs.length; i++) {
                try {
                  const validation = await openRouterService.validateQAPair(
                    syntheticPairs[i],
                    validationContext,
                    fineTuningGoal
                  );

                  if (validation.isValid && validation.confidence > 0.6) {
                    const validatedPair: QAPair = {
                      ...syntheticPairs[i],
                      validationStatus: 'validated',
                      validationConfidence: validation.confidence
                    };
                    validatedPairs.push(validatedPair);
                    validatedPairCount++;
                  }

                  // Update progress
                  const validationProgress = 85 + (i / syntheticPairs.length) * 5;
                  updateProgress(validationProgress, `Validating synthetic pair ${i + 1}/${syntheticPairs.length}`);
                  calculateTimeEstimates(validationProgress, startTime);
                } catch (validationError) {
                  console.warn(`[DATASET_GENERATION] Validation failed for synthetic pair ${i + 1}:`, validationError);
                }
              }

              // Add validated synthetic pairs to the main dataset
              qaPairs.push(...validatedPairs);
              console.log('[DATASET_GENERATION] Added', validatedPairCount, 'validated synthetic pairs');
            }
          }
        } catch (gapError) {
          console.warn('[DATASET_GENERATION] Knowledge gap analysis failed:', gapError);
        }
      }

      // Step 6: Finalize dataset (90-100%)
      updateProgress(90, 'Finalizing dataset...');
      calculateTimeEstimates(90, startTime);

      const correctAnswerCount = qaPairs.filter(p => p.isCorrect).length;
      const incorrectAnswerCount = qaPairs.filter(p => !p.isCorrect).length;
      finalDatasetSize = qaPairs.length;

      const finalProcessedData: ProcessedData = {
        combinedCleanedText: augmentedContent,
        qaPairs,
        sourceFileCount: readyFiles.length,
        sourceUrlCount: readyUrls.length,
        identifiedThemes,
        correctAnswerCount,
        incorrectAnswerCount,
        isAugmented,
        groundingMetadata,
        syntheticPairCount,
        validatedPairCount,
        identifiedGaps,
        gapFillingEnabled: enableGapFilling
      };

      setProcessedData(finalProcessedData);
      
      updateProgress(100, `Dataset generation complete! Generated ${finalDatasetSize} Q&A pairs from ${readyFiles.length + readyUrls.length} sources.`);
      
      success = true;
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      console.log('[DATASET_GENERATION] Process completed successfully in', processingTime, 'seconds');
      console.log('[DATASET_GENERATION] Final dataset:', {
        totalPairs: finalDatasetSize,
        correctPairs: correctAnswerCount,
        incorrectPairs: incorrectAnswerCount,
        themes: identifiedThemes.length,
        isAugmented,
        syntheticPairs: syntheticPairCount,
        validatedSynthetic: validatedPairCount
      });

      // Send success notification
      try {
        await notificationService.sendCompletionNotification(
          finalDatasetSize,
          correctAnswerCount,
          incorrectAnswerCount
        );
      } catch (notificationError) {
        console.warn('[DATASET_GENERATION] Failed to send success notification:', notificationError);
      }

    } catch (err) {
      success = false;
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[DATASET_GENERATION] Process failed after', processingTime, 'seconds');
      console.error('[DATASET_GENERATION] Error details:', err);
      
      setError(errorMessage);
      setCurrentStep('Dataset generation failed. See error details above.');
      setProgress(0);

      // Send error notification
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