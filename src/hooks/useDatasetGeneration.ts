import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair } from '../types';
import { geminiService } from '../services/geminiService';
import { SYNTHETIC_QA_TARGET } from '../constants';

// Conditional import for OpenRouter service
let openRouterService: any = null;
try {
  const openRouterModule = await import('../services/openRouterService');
  openRouterService = openRouterModule.openRouterService;
} catch (error) {
  console.warn('OpenRouter service not available:', error);
}

// Conditional import for notification service
let notificationService: any = null;
try {
  const notificationModule = await import('../services/notificationService');
  notificationService = notificationModule.notificationService;
} catch (error) {
  console.warn('Notification service not available:', error);
}

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  estimatedTimeRemaining: number | null;
  totalEstimatedTime: number | null;
  error: string | null;
  generateDataset: (files: FileData[], urls: UrlData[], enableWebAugmentation: boolean, fineTuningGoal: FineTuningGoal, enableGapFilling?: boolean) => Promise<void>;
  clearError: () => void;
}

export const useDatasetGeneration = (): UseDatasetGenerationReturn => {
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const calculateTimeEstimates = useCallback((currentStepIndex: number, totalSteps: number, sourceCount: number, enableWebAugmentation: boolean, enableGapFilling: boolean) => {
    // Base time estimates in seconds
    const baseTimePerSource = 15; // 15 seconds per file/URL
    const themeAnalysisTime = 20; // 20 seconds for theme identification
    const qaGenerationTime = 45; // 45 seconds for Q&A generation
    const webAugmentationTime = 60; // 60 seconds for web search and augmentation
    const gapAnalysisTime = 30; // 30 seconds for gap analysis
    const syntheticGenerationTime = 50; // 50 seconds for synthetic generation (more pairs)
    const validationTime = 45; // 45 seconds for validation (more pairs)

    let totalTime = sourceCount * baseTimePerSource + themeAnalysisTime + qaGenerationTime;
    
    if (enableWebAugmentation) {
      totalTime += webAugmentationTime;
    }
    
    if (enableGapFilling && openRouterService?.isReady()) {
      totalTime += gapAnalysisTime + syntheticGenerationTime + validationTime;
    }

    const progressRatio = currentStepIndex / totalSteps;
    const elapsedTime = startTime ? (Date.now() - startTime) / 1000 : 0;
    
    // Adjust estimate based on actual elapsed time
    if (elapsedTime > 0 && progressRatio > 0.1) {
      const adjustedTotalTime = elapsedTime / progressRatio;
      totalTime = Math.max(totalTime, adjustedTotalTime);
    }

    const remainingTime = Math.max(0, totalTime - elapsedTime);

    return {
      totalEstimatedTime: totalTime,
      estimatedTimeRemaining: remainingTime
    };
  }, [startTime]);

  const updateProgress = useCallback((step: number, total: number, message: string, sourceCount: number = 0, enableWebAugmentation: boolean = false, enableGapFilling: boolean = false) => {
    const progressPercent = Math.round((step / total) * 100);
    setProgress(progressPercent);
    setCurrentStep(message);

    // Calculate time estimates
    const timeEstimates = calculateTimeEstimates(step, total, sourceCount, enableWebAugmentation, enableGapFilling);
    setEstimatedTimeRemaining(timeEstimates.estimatedTimeRemaining);
    setTotalEstimatedTime(timeEstimates.totalEstimatedTime);
  }, [calculateTimeEstimates]);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling: boolean = true
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

    // Request notification permission and show initial notification
    if (notificationService) {
      try {
        await notificationService.requestPermission();
      } catch (error) {
        console.warn('Failed to request notification permission:', error);
      }
    }
    
    setIsProcessing(true);
    setError(null);
    setProcessedData(null);
    setProgress(0);
    setStartTime(Date.now());
    setEstimatedTimeRemaining(null);
    setTotalEstimatedTime(null);

    try {
      const totalSources = readyFiles.length + readyUrls.length;
      
      // Calculate total steps based on enabled features
      let totalSteps = totalSources + 2; // Base: source processing + theme identification + Q&A generation
      if (enableWebAugmentation) totalSteps += 2; // +2 for web search steps
      if (enableGapFilling && openRouterService?.isReady()) totalSteps += 3; // +3 for gap analysis, synthetic generation, validation
      
      let currentStepIndex = 0;

      // Step 1: Clean content from files and URLs
      const cleanedTexts: string[] = [];
      const successfulSources: string[] = [];

      // Process files
      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        currentStepIndex++;
        updateProgress(currentStepIndex, totalSteps, `Processing file: ${file.file.name}`, totalSources, enableWebAugmentation, enableGapFilling);

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
        updateProgress(currentStepIndex, totalSteps, `Processing URL: ${urlData.title || urlData.url}`, totalSources, enableWebAugmentation, enableGapFilling);

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
      updateProgress(currentStepIndex, totalSteps, 'Analyzing content and identifying key themes...', totalSources, enableWebAugmentation, enableGapFilling);
      
      const identifiedThemes = await geminiService.identifyThemes(combinedContent, fineTuningGoal);
      
      let groundingMetadata;
      let isAugmented = false;

      // Step 3: Web augmentation (if enabled)
      if (enableWebAugmentation) {
        if (identifiedThemes.length > 0) {
          currentStepIndex++;
          updateProgress(currentStepIndex, totalSteps, `Found ${identifiedThemes.length} themes: ${identifiedThemes.slice(0, 2).join(', ')}${identifiedThemes.length > 2 ? '...' : ''}`, totalSources, enableWebAugmentation, enableGapFilling);
        }

        currentStepIndex++;
        updateProgress(currentStepIndex, totalSteps, 'Enhancing content with targeted web research...', totalSources, enableWebAugmentation, enableGapFilling);
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

      // Step 4: Generate initial 100 Q&A pairs from original content
      currentStepIndex++;
      updateProgress(currentStepIndex, totalSteps, 'Generating 100 comprehensive Q&A pairs from original content...', totalSources, enableWebAugmentation, enableGapFilling);
      const initialQAPairs = await geminiService.generateQAPairs(combinedContent, identifiedThemes, fineTuningGoal);

      let finalQAPairs: QAPair[] = [...initialQAPairs];
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      // Step 5-7: Knowledge gap filling - ADDITIONAL 50-100 synthetic pairs (if enabled and OpenRouter is available)
      if (enableGapFilling && openRouterService?.isReady()) {
        try {
          // Step 5: Identify knowledge gaps using Gemini analysis of the generated dataset
          currentStepIndex++;
          updateProgress(currentStepIndex, totalSteps, 'Analyzing generated dataset for knowledge gaps...', totalSources, enableWebAugmentation, enableGapFilling);
          
          identifiedGaps = await geminiService.identifyKnowledgeGaps(
            combinedContent,
            identifiedThemes,
            initialQAPairs,
            fineTuningGoal
          );

          if (identifiedGaps.length > 0) {
            // Step 6: Generate ADDITIONAL synthetic Q&A pairs using OpenRouter (Nvidia Nemotron)
            currentStepIndex++;
            updateProgress(currentStepIndex, totalSteps, `Generating ${SYNTHETIC_QA_TARGET} additional synthetic Q&A pairs for ${identifiedGaps.length} knowledge gaps...`, totalSources, enableWebAugmentation, enableGapFilling);
            
            const syntheticPairs = await openRouterService.generateSyntheticQAPairs(
              combinedContent,
              identifiedGaps,
              fineTuningGoal,
              SYNTHETIC_QA_TARGET // Target 50-100 additional pairs
            );

            syntheticPairCount = syntheticPairs.length;

            // Step 7: Cross-validate synthetic pairs using Gemini
            currentStepIndex++;
            updateProgress(currentStepIndex, totalSteps, `Cross-validating ${syntheticPairs.length} synthetic Q&A pairs...`, totalSources, enableWebAugmentation, enableGapFilling);
            
            const validatedPairs: QAPair[] = [];
            const validationThreshold = 0.7; // Minimum confidence for inclusion

            for (let i = 0; i < syntheticPairs.length; i++) {
              try {
                const validation = await geminiService.validateQAPair(
                  syntheticPairs[i],
                  combinedContent,
                  fineTuningGoal
                );

                // Update the synthetic pair with validation results
                const validatedPair: QAPair = {
                  ...syntheticPairs[i],
                  validationStatus: validation.isValid && validation.confidence >= validationThreshold ? 'validated' : 'rejected',
                  validationConfidence: validation.confidence,
                  confidence: validation.isValid ? 
                    Math.min(syntheticPairs[i].confidence || 0.9, validation.factualAccuracy) :
                    Math.max(0.1, validation.factualAccuracy * 0.5)
                };

                // Only include pairs that pass validation
                if (validation.isValid && validation.confidence >= validationThreshold) {
                  validatedPairs.push(validatedPair);
                  validatedPairCount++;
                }

                // Update progress for each validation
                if (i % 5 === 0 || i === syntheticPairs.length - 1) {
                  updateProgress(
                    currentStepIndex, 
                    totalSteps, 
                    `Cross-validating synthetic Q&A pairs... (${i + 1}/${syntheticPairs.length}, ${validatedPairCount} validated)`,
                    totalSources,
                    enableWebAugmentation,
                    enableGapFilling
                  );
                }
              } catch (validationError) {
                console.error(`Validation failed for synthetic pair ${i}:`, validationError);
                // Continue with other pairs
              }
            }

            // Add validated synthetic pairs to the final dataset (ADDITIONAL to the original 100)
            finalQAPairs = [...initialQAPairs, ...validatedPairs];
          }
        } catch (gapFillingError) {
          console.error('Knowledge gap filling failed:', gapFillingError);
          // Continue with original Q&A pairs only
          setError('Knowledge gap filling encountered issues, proceeding with original dataset.');
        }
      } else if (enableGapFilling && !openRouterService?.isReady()) {
        console.warn('Knowledge gap filling requested but OpenRouter service not available');
      }

      // Calculate final statistics
      const correctAnswers = finalQAPairs.filter(pair => pair.isCorrect);
      const incorrectAnswers = finalQAPairs.filter(pair => !pair.isCorrect);

      setProcessedData({
        combinedCleanedText: combinedContent,
        qaPairs: finalQAPairs,
        sourceFileCount: readyFiles.length,
        sourceUrlCount: readyUrls.length,
        identifiedThemes,
        isAugmented,
        groundingMetadata,
        correctAnswerCount: correctAnswers.length,
        incorrectAnswerCount: incorrectAnswers.length,
        syntheticPairCount,
        validatedPairCount,
        identifiedGaps,
        gapFillingEnabled: enableGapFilling && openRouterService?.isReady()
      });

      setProgress(100);
      setEstimatedTimeRemaining(0);
      
      let completionMessage = `Successfully generated ${finalQAPairs.length} total Q&A pairs: ${initialQAPairs.length} from original content + ${validatedPairCount} validated synthetic pairs (${correctAnswers.length} correct, ${incorrectAnswers.length} incorrect) from ${successfulSources.length} sources!`;
      
      if (syntheticPairCount > 0) {
        completionMessage += ` Knowledge gaps addressed: ${identifiedGaps.length}.`;
      }
      
      setCurrentStep(completionMessage);

      // Send completion notification
      if (notificationService) {
        try {
          await notificationService.sendCompletionNotification(finalQAPairs.length, correctAnswers.length, incorrectAnswers.length);
        } catch (error) {
          console.warn('Failed to send completion notification:', error);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setCurrentStep('');
      setProgress(0);
      setEstimatedTimeRemaining(null);
      setTotalEstimatedTime(null);

      // Send error notification
      if (notificationService) {
        try {
          await notificationService.sendErrorNotification(errorMessage);
        } catch (error) {
          console.warn('Failed to send error notification:', error);
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }, [updateProgress]);

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