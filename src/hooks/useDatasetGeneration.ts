import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair } from '../types';
import { geminiService } from '../services/geminiService';
import { SYNTHETIC_QA_TARGET } from '../constants';

// Create promises for conditional imports without top-level await
const openRouterServicePromise = import('../services/openRouterService').then(module => {
  console.log('[HOOK] OpenRouter service loaded successfully');
  return module.openRouterService;
}).catch(error => {
  console.warn('[HOOK] OpenRouter service not available:', error);
  return null;
});

const notificationServicePromise = import('../services/notificationService').then(module => {
  console.log('[HOOK] Notification service loaded successfully');
  return module.notificationService;
}).catch(error => {
  console.warn('[HOOK] Notification service not available:', error);
  return null;
});

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

  const calculateTimeEstimates = useCallback((currentStepIndex: number, totalSteps: number, sourceCount: number, enableWebAugmentation: boolean, enableGapFilling: boolean, gapCount: number = 0) => {
    // Base time estimates in seconds
    const baseTimePerSource = 15; // 15 seconds per file/URL
    const themeAnalysisTime = 20; // 20 seconds for theme identification
    const qaGenerationTime = 45; // 45 seconds for Q&A generation
    const webAugmentationTime = 60; // 60 seconds for web search and augmentation
    const gapAnalysisTime = 30; // 30 seconds for gap analysis
    const validationContextTime = 20; // 20 seconds for validation context generation
    const syntheticGenerationTimePerGap = 15; // 15 seconds per gap (individual requests)
    const validationTimePerPair = 3; // 3 seconds per validation (faster individual validation)

    let totalTime = sourceCount * baseTimePerSource + themeAnalysisTime + qaGenerationTime;
    
    if (enableWebAugmentation) {
      totalTime += webAugmentationTime;
    }
    
    if (enableGapFilling) {
      totalTime += gapAnalysisTime;
      totalTime += validationContextTime; // Add time for validation context generation
      totalTime += gapCount * syntheticGenerationTimePerGap; // Individual gap processing
      totalTime += (gapCount * 10) * validationTimePerPair; // Estimate 10 pairs per gap for validation
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

  const updateProgress = useCallback((step: number, total: number, message: string, sourceCount: number = 0, enableWebAugmentation: boolean = false, enableGapFilling: boolean = false, gapCount: number = 0) => {
    const progressPercent = Math.round((step / total) * 100);
    setProgress(progressPercent);
    setCurrentStep(message);

    // Calculate time estimates
    const timeEstimates = calculateTimeEstimates(step, total, sourceCount, enableWebAugmentation, enableGapFilling, gapCount);
    setEstimatedTimeRemaining(timeEstimates.estimatedTimeRemaining);
    setTotalEstimatedTime(timeEstimates.totalEstimatedTime);

    // Log progress for debugging
    console.log(`[PROGRESS] Step ${step}/${total} (${progressPercent}%): ${message}`);
  }, [calculateTimeEstimates]);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling: boolean = false
  ) => {
    console.log('[DATASET_GENERATION] Starting dataset generation process');
    
    // Await the service promises to get the actual service instances
    const openRouterService = await openRouterServicePromise;
    const notificationService = await notificationServicePromise;
    
    console.log('[DATASET_GENERATION] Parameters:', {
      fileCount: files.length,
      urlCount: urls.length,
      enableWebAugmentation,
      fineTuningGoal,
      enableGapFilling,
      geminiReady: geminiService.isReady(),
      openRouterReady: openRouterService?.isReady() || false
    });

    if (!geminiService.isReady()) {
      console.error('[DATASET_GENERATION] Gemini service not ready');
      setError('Gemini service is not initialized. Please check your API key.');
      return;
    }

    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    const readyUrls = urls.filter(u => u.status === 'fetched' && u.rawContent.trim());
    
    console.log('[DATASET_GENERATION] Ready sources:', {
      readyFiles: readyFiles.length,
      readyUrls: readyUrls.length,
      totalReady: readyFiles.length + readyUrls.length
    });
    
    if (readyFiles.length === 0 && readyUrls.length === 0) {
      console.error('[DATASET_GENERATION] No valid sources ready');
      setError('No valid files or URLs ready for processing.');
      return;
    }

    // Request notification permission and show initial notification
    if (notificationService) {
      try {
        console.log('[DATASET_GENERATION] Requesting notification permission');
        await notificationService.requestPermission();
      } catch (error) {
        console.warn('[DATASET_GENERATION] Failed to request notification permission:', error);
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
      if (enableGapFilling && openRouterService?.isReady()) totalSteps += 4; // +4 for gap analysis, validation context, synthetic generation, validation
      
      console.log('[DATASET_GENERATION] Total steps calculated:', totalSteps);
      
      let currentStepIndex = 0;

      // Step 1: Clean content from files and URLs
      console.log('[DATASET_GENERATION] Starting content processing phase');
      const cleanedTexts: string[] = [];
      const successfulSources: string[] = [];

      // Process files
      console.log('[DATASET_GENERATION] Processing files:', readyFiles.length);
      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        currentStepIndex++;
        console.log(`[DATASET_GENERATION] Processing file ${i + 1}/${readyFiles.length}: ${file.file.name}`);
        updateProgress(currentStepIndex, totalSteps, `Processing file: ${file.file.name}`, totalSources, enableWebAugmentation, enableGapFilling);

        try {
          let cleanedText: string;
          
          console.log(`[DATASET_GENERATION] File ${file.file.name} is binary: ${file.isBinary}`);
          if (file.isBinary) {
            console.log(`[DATASET_GENERATION] Cleaning binary content for ${file.file.name}`);
            cleanedText = await geminiService.cleanBinaryContent(
              file.rawContent,
              file.mimeType,
              file.file.name
            );
          } else {
            console.log(`[DATASET_GENERATION] Cleaning text content for ${file.file.name}`);
            cleanedText = await geminiService.cleanTextContent(
              file.rawContent,
              file.file.name
            );
          }

          console.log(`[DATASET_GENERATION] Cleaned text length for ${file.file.name}: ${cleanedText.length} characters`);
          if (cleanedText.trim()) {
            cleanedTexts.push(cleanedText);
            successfulSources.push(file.file.name);
            console.log(`[DATASET_GENERATION] Successfully processed file: ${file.file.name}`);
          } else {
            console.warn(`[DATASET_GENERATION] No content extracted from file: ${file.file.name}`);
          }
        } catch (err) {
          console.error(`[DATASET_GENERATION] Failed to process ${file.file.name}:`, err);
          // Continue with other sources
        }
      }

      // Process URLs
      console.log('[DATASET_GENERATION] Processing URLs:', readyUrls.length);
      for (let i = 0; i < readyUrls.length; i++) {
        const urlData = readyUrls[i];
        currentStepIndex++;
        console.log(`[DATASET_GENERATION] Processing URL ${i + 1}/${readyUrls.length}: ${urlData.url}`);
        updateProgress(currentStepIndex, totalSteps, `Processing URL: ${urlData.title || urlData.url}`, totalSources, enableWebAugmentation, enableGapFilling);

        try {
          console.log(`[DATASET_GENERATION] Cleaning text content for URL: ${urlData.url}`);
          const cleanedText = await geminiService.cleanTextContent(
            urlData.rawContent,
            urlData.title || urlData.url
          );

          console.log(`[DATASET_GENERATION] Cleaned text length for ${urlData.url}: ${cleanedText.length} characters`);
          if (cleanedText.trim()) {
            cleanedTexts.push(cleanedText);
            successfulSources.push(urlData.title || urlData.url);
            console.log(`[DATASET_GENERATION] Successfully processed URL: ${urlData.url}`);
          } else {
            console.warn(`[DATASET_GENERATION] No content extracted from URL: ${urlData.url}`);
          }
        } catch (err) {
          console.error(`[DATASET_GENERATION] Failed to process ${urlData.url}:`, err);
          // Continue with other sources
        }
      }

      console.log('[DATASET_GENERATION] Content processing complete. Successful sources:', successfulSources.length);
      if (cleanedTexts.length === 0) {
        console.error('[DATASET_GENERATION] No content extracted from any sources');
        throw new Error('No content could be extracted from any sources.');
      }

      // Step 2: Combine content and identify themes
      let combinedContent = cleanedTexts.join('\n\n---\n\n');
      console.log(`[DATASET_GENERATION] Combined content length: ${combinedContent.length} characters`);
      
      currentStepIndex++;
      console.log('[DATASET_GENERATION] Starting theme identification');
      updateProgress(currentStepIndex, totalSteps, 'Analyzing content and identifying key themes...', totalSources, enableWebAugmentation, enableGapFilling);
      
      const identifiedThemes = await geminiService.identifyThemes(combinedContent, fineTuningGoal);
      console.log('[DATASET_GENERATION] Identified themes:', identifiedThemes);
      
      let groundingMetadata;
      let isAugmented = false;

      // Step 3: Web augmentation (if enabled)
      if (enableWebAugmentation) {
        console.log('[DATASET_GENERATION] Web augmentation enabled');
        if (identifiedThemes.length > 0) {
          currentStepIndex++;
          console.log(`[DATASET_GENERATION] Found ${identifiedThemes.length} themes for web search`);
          updateProgress(currentStepIndex, totalSteps, `Found ${identifiedThemes.length} themes: ${identifiedThemes.slice(0, 2).join(', ')}${identifiedThemes.length > 2 ? '...' : ''}`, totalSources, enableWebAugmentation, enableGapFilling);
        }

        currentStepIndex++;
        console.log('[DATASET_GENERATION] Starting web augmentation');
        updateProgress(currentStepIndex, totalSteps, 'Enhancing content with targeted web research...', totalSources, enableWebAugmentation, enableGapFilling);
        try {
          const result = await geminiService.augmentWithWebSearch(combinedContent, identifiedThemes, fineTuningGoal);
          combinedContent = result.augmentedText;
          groundingMetadata = result.groundingMetadata;
          isAugmented = true;
          console.log('[DATASET_GENERATION] Web augmentation successful. New content length:', combinedContent.length);
        } catch (err) {
          console.error('[DATASET_GENERATION] Web augmentation failed:', err);
          setError('Web augmentation failed, proceeding with original content.');
        }
      } else {
        console.log('[DATASET_GENERATION] Web augmentation disabled');
      }

      // Step 4: Generate initial 100 Q&A pairs from original content
      currentStepIndex++;
      console.log('[DATASET_GENERATION] Starting initial Q&A generation');
      updateProgress(currentStepIndex, totalSteps, 'Generating 100 comprehensive Q&A pairs from original content...', totalSources, enableWebAugmentation, enableGapFilling);
      const initialQAPairs = await geminiService.generateQAPairs(combinedContent, identifiedThemes, fineTuningGoal);
      console.log(`[DATASET_GENERATION] Generated ${initialQAPairs.length} initial Q&A pairs`);

      let finalQAPairs: QAPair[] = [...initialQAPairs];
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      // Step 5-8: Knowledge gap filling - ADDITIONAL 50-100 synthetic pairs (if enabled and OpenRouter is available)
      if (enableGapFilling && openRouterService?.isReady()) {
        console.log('[DATASET_GENERATION] Knowledge gap filling enabled and OpenRouter ready');
        try {
          // Step 5: Identify knowledge gaps using Gemini analysis of the generated dataset
          currentStepIndex++;
          console.log('[DATASET_GENERATION] Starting knowledge gap analysis');
          updateProgress(currentStepIndex, totalSteps, 'Analyzing generated dataset for knowledge gaps...', totalSources, enableWebAugmentation, enableGapFilling);
          
          identifiedGaps = await geminiService.identifyKnowledgeGaps(
            combinedContent,
            identifiedThemes,
            initialQAPairs,
            fineTuningGoal
          );
          console.log(`[DATASET_GENERATION] Identified ${identifiedGaps.length} knowledge gaps:`, identifiedGaps.map(g => g.id));

          if (identifiedGaps.length > 0) {
            // Step 6: Generate ADDITIONAL synthetic Q&A pairs using OpenRouter (individual gap processing)
            currentStepIndex++;
            console.log(`[DATASET_GENERATION] Starting individual synthetic Q&A generation for ${identifiedGaps.length} gaps`);
            updateProgress(currentStepIndex, totalSteps, `Generating synthetic Q&A pairs for ${identifiedGaps.length} knowledge gaps...`, totalSources, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
            
            // Process each gap individually to prevent token overload
            // Calculate minimum pairs per gap to reach SYNTHETIC_QA_TARGET_MIN
            const totalGaps = identifiedGaps.length;
            const minPairsPerGap = Math.ceil(SYNTHETIC_QA_TARGET_MIN / totalGaps);
            let allSyntheticPairs: SyntheticQAPair[] = [];

            for (let gapIndex = 0; gapIndex < totalGaps; gapIndex++) {
              const gap = identifiedGaps[gapIndex];
              try {
                console.log(`[DATASET_GENERATION] Processing gap ${gapIndex + 1}/${totalGaps}: ${gap.id}`);
                updateProgress(
                  currentStepIndex, 
                  totalSteps, 
                  `Generating synthetic Q&A pairs for gap ${gapIndex + 1}/${totalGaps}: ${gap.description.substring(0, 50)}...`,
                  totalSources,
                  enableWebAugmentation,
                  enableGapFilling,
                  totalGaps
                );

                // Generate at least minPairsPerGap with no maximum limit
                let gapPairs: SyntheticQAPair[] = [];
                gapPairs = await openRouterService.generateSyntheticQAPairsForGap(
                  combinedContent,
                  gap,
                  fineTuningGoal,
                  minPairsPerGap,
                  identifiedThemes
                );
                if (gapPairs.length < minPairsPerGap) {
                  console.warn(`[DATASET_GENERATION] Only ${gapPairs.length} synthetic pairs generated for gap ${gap.id}, less than minimum ${minPairsPerGap}`);
                }
                // Only enforce a minimum, not a cap: keep all pairs if more are generated
                allSyntheticPairs.push(...gapPairs);
                console.log(`[DATASET_GENERATION] Successfully generated ${gapPairs.length} pairs for gap ${gap.id}`);

                // Add a small delay between requests to avoid rate limiting
                if (gapIndex < totalGaps - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                }
              } catch (gapError: any) {
                console.error(`[DATASET_GENERATION] Failed to generate pairs for gap ${gap.id}:`, gapError);
                // Continue with other gaps instead of failing completely
              }
            }

            syntheticPairCount = allSyntheticPairs.length;
            console.log(`[DATASET_GENERATION] Generated ${syntheticPairCount} total synthetic Q&A pairs from ${totalGaps} gaps`);

            // Step 7: Generate validation context for efficient validation
            let validationContext = '';
            if (allSyntheticPairs.length > 0) {
              currentStepIndex++;
              console.log('[DATASET_GENERATION] Generating validation context for synthetic pairs');
              updateProgress(currentStepIndex, totalSteps, 'Generating validation context for efficient Q&A validation...', totalSources, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
              
              try {
                validationContext = await openRouterService.generateValidationContext(
                  combinedContent,
                  identifiedThemes,
                  initialQAPairs,
                  identifiedGaps,
                  allSyntheticPairs,
                  fineTuningGoal
                );
                console.log(`[DATASET_GENERATION] Validation context generated, length: ${validationContext.length} characters`);
              } catch (contextError: any) {
                console.error('[DATASET_GENERATION] Failed to generate validation context:', contextError);
                // Fallback to using original content for validation
                validationContext = combinedContent.substring(0, 4000);
                console.log('[DATASET_GENERATION] Using fallback validation context from original content');
              }
            }

            // Step 8: Cross-validate synthetic pairs using the validation context
            if (allSyntheticPairs.length > 0 && validationContext) {
              currentStepIndex++;
              console.log('[DATASET_GENERATION] Starting context-based validation of synthetic pairs');
              updateProgress(currentStepIndex, totalSteps, `Validating ${allSyntheticPairs.length} synthetic Q&A pairs using generated context...`, totalSources, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
              
              const validatedPairs: QAPair[] = [];
              const validationThreshold = 0.7; // Minimum confidence for inclusion

              for (let i = 0; i < allSyntheticPairs.length; i++) {
                console.log(`[DATASET_GENERATION] Validating synthetic pair ${i + 1}/${allSyntheticPairs.length} using validation context`);
                try {
                  // Use the validation context instead of full original content
                  const validation = await openRouterService.validateQAPair(
                    allSyntheticPairs[i],
                    validationContext,
                    fineTuningGoal
                  );

                  console.log(`[DATASET_GENERATION] Context-based validation result for pair ${i + 1}: valid=${validation.isValid}, confidence=${validation.confidence}`);

                  // Update the synthetic pair with validation results
                  const validatedPair: QAPair = {
                    ...allSyntheticPairs[i],
                    validationStatus: validation.isValid && validation.confidence >= validationThreshold ? 'validated' : 'rejected',
                    validationConfidence: validation.confidence,
                    confidence: validation.isValid ? 
                      Math.min(allSyntheticPairs[i].confidence || 0.9, validation.factualAccuracy) :
                      Math.max(0.1, validation.factualAccuracy * 0.5)
                  };

                  // Only include pairs that pass validation
                  if (validation.isValid && validation.confidence >= validationThreshold) {
                    validatedPairs.push(validatedPair);
                    validatedPairCount++;
                    console.log(`[DATASET_GENERATION] Pair ${i + 1} validated and included (total validated: ${validatedPairCount})`);
                  } else {
                    console.log(`[DATASET_GENERATION] Pair ${i + 1} rejected (confidence: ${validation.confidence}, threshold: ${validationThreshold})`);
                  }

                  // Update progress for every 5 validations or at the end
                  if (i % 5 === 0 || i === allSyntheticPairs.length - 1) {
                    updateProgress(
                      currentStepIndex, 
                      totalSteps, 
                      `Validating synthetic Q&A pairs using context... (${i + 1}/${allSyntheticPairs.length}, ${validatedPairCount} validated)`,
                      totalSources,
                      enableWebAugmentation,
                      enableGapFilling,
                      identifiedGaps.length
                    );
                  }

                  // Small delay between validations to avoid overwhelming the API
                  if (i < allSyntheticPairs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
                  }

                } catch (validationError) {
                  console.error(`[DATASET_GENERATION] Context-based validation failed for synthetic pair ${i}:`, validationError);
                  // Continue with other pairs
                }
              }

              // Add validated synthetic pairs to the final dataset (ADDITIONAL to the original 100)
              finalQAPairs = [...initialQAPairs, ...validatedPairs];
              console.log(`[DATASET_GENERATION] Final dataset: ${initialQAPairs.length} original + ${validatedPairs.length} validated synthetic = ${finalQAPairs.length} total pairs`);
            }
          } else {
            console.log('[DATASET_GENERATION] No knowledge gaps identified, skipping synthetic generation');
          }
        } catch (gapFillingError) {
          console.error('[DATASET_GENERATION] Knowledge gap filling failed:', gapFillingError);
          // Continue with original Q&A pairs only
          setError('Knowledge gap filling encountered issues, proceeding with original dataset.');
        }
      } else if (enableGapFilling && !openRouterService?.isReady()) {
        console.warn('[DATASET_GENERATION] Knowledge gap filling requested but OpenRouter service not available');
      } else {
        console.log('[DATASET_GENERATION] Knowledge gap filling disabled');
      }

      // Calculate final statistics
      const correctAnswers = finalQAPairs.filter(pair => pair.isCorrect);
      const incorrectAnswers = finalQAPairs.filter(pair => !pair.isCorrect);

      console.log('[DATASET_GENERATION] Final statistics:', {
        totalPairs: finalQAPairs.length,
        correctAnswers: correctAnswers.length,
        incorrectAnswers: incorrectAnswers.length,
        syntheticPairCount,
        validatedPairCount,
        identifiedGaps: identifiedGaps.length
      });

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
      
      let completionMessage = `Successfully generated ${finalQAPairs.length} total Q&A pairs: ${initialQAPairs.length} from original content`;
      
      if (validatedPairCount > 0) {
        completionMessage += ` + ${validatedPairCount} validated synthetic pairs`;
      }
      
      completionMessage += ` (${correctAnswers.length} correct, ${incorrectAnswers.length} incorrect) from ${successfulSources.length} sources!`;
      
      if (identifiedGaps.length > 0) {
        completionMessage += ` Knowledge gaps addressed: ${identifiedGaps.length}.`;
      }
      
      setCurrentStep(completionMessage);
      console.log('[DATASET_GENERATION] Process completed successfully:', completionMessage);

      // Send completion notification
      if (notificationService) {
        try {
          console.log('[DATASET_GENERATION] Sending completion notification');
          await notificationService.sendCompletionNotification(finalQAPairs.length, correctAnswers.length, incorrectAnswers.length);
        } catch (error) {
          console.warn('[DATASET_GENERATION] Failed to send completion notification:', error);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[DATASET_GENERATION] Process failed with error:', errorMessage);
      console.error('[DATASET_GENERATION] Error stack:', err);
      setError(errorMessage);
      setCurrentStep('');
      setProgress(0);
      setEstimatedTimeRemaining(null);
      setTotalEstimatedTime(null);

      // Send error notification
      if (notificationService) {
        try {
          console.log('[DATASET_GENERATION] Sending error notification');
          await notificationService.sendErrorNotification(errorMessage);
        } catch (error) {
          console.warn('[DATASET_GENERATION] Failed to send error notification:', error);
        }
      }
    } finally {
      console.log('[DATASET_GENERATION] Process finished, setting isProcessing to false');
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