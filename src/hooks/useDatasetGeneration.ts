import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair } from '../types';
import { geminiService } from '../services/geminiService';
import { openRouterService } from '../services/openRouterService';
import { notificationService } from '../services/notificationService';

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
    const themeAnalysisTime = 20;
    const qaGenerationTime = 45;
    const webAugmentationTime = 60;
    const gapAnalysisTime = 30;
    const validationContextTime = 20;
    const syntheticGenerationTimePerGap = 15;
    const validationTimePerPair = 3;

    let totalTime = themeAnalysisTime + qaGenerationTime;
    
    if (enableWebAugmentation) {
      totalTime += webAugmentationTime;
    }
    
    if (enableGapFilling) {
      totalTime += gapAnalysisTime;
      totalTime += validationContextTime;
      totalTime += gapCount * syntheticGenerationTimePerGap;
      totalTime += (gapCount * 10) * validationTimePerPair;
    }

    const progressRatio = currentStepIndex / totalSteps;
    const elapsedTime = startTime ? (Date.now() - startTime) / 1000 : 0;
    
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

    const timeEstimates = calculateTimeEstimates(step, total, sourceCount, enableWebAugmentation, enableGapFilling, gapCount);
    setEstimatedTimeRemaining(timeEstimates.estimatedTimeRemaining);
    setTotalEstimatedTime(timeEstimates.totalEstimatedTime);

    console.log(`[PROGRESS] Step ${step}/${total} (${progressPercent}%): ${message}`);
  }, [calculateTimeEstimates]);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    enableWebAugmentation: boolean,
    fineTuningGoal: FineTuningGoal,
    enableGapFilling: boolean = false
  ) => {
    console.log('[DATASET_GENERATION] Starting comprehensive dataset generation process');

    console.log('[DATASET_GENERATION] Parameters:', {
      fileCount: files.length,
      urlCount: urls.length,
      enableWebAugmentation,
      fineTuningGoal,
      enableGapFilling,
      geminiReady: geminiService.isReady(),
      openRouterReady: openRouterService.isReady()
    });

    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    const readyUrls = urls.filter(u => u.status === 'fetched' && u.rawContent.trim());

    console.log('[DATASET_GENERATION] Ready sources:', {
      readyFiles: readyFiles.length,
      readyUrls: readyUrls.length,
      totalReady: readyFiles.length + readyUrls.length
    });

    if (readyFiles.length === 0 && readyUrls.length === 0) {
      console.error('[DATASET_GENERATION] No valid sources ready');
      setError('No valid files or URLs ready for processing. Please ensure your files are uploaded and URLs are fetched successfully.');
      return;
    }

    // Request notification permission
    try {
      await notificationService.requestPermission();
    } catch (error) {
      console.warn('[DATASET_GENERATION] Failed to request notification permission:', error);
    }

    setIsProcessing(true);
    setError(null);
    setProcessedData(null);
    setProgress(0);
    setStartTime(Date.now());
    setEstimatedTimeRemaining(null);
    setTotalEstimatedTime(null);

    try {
      const allSources = [
        ...readyFiles.map(f => ({ type: 'file', data: f, name: f.file.name, id: f.id })),
        ...readyUrls.map(u => ({ type: 'url', data: u, name: u.url, id: u.id }))
      ];
      const totalSourceCount = allSources.length;

      // Calculate total steps dynamically
      let estimatedTotalSteps = 3; // Base steps: content processing, theme analysis, Q&A generation
      if (enableWebAugmentation) estimatedTotalSteps += 1;
      if (enableGapFilling) estimatedTotalSteps += 3;

      let overallCombinedCleanedText = "";
      let allInitialQAPairs: QAPair[] = [];
      let allIdentifiedThemes: string[] = [];
      let isAnyAugmented = false;
      let overallGroundingMetadata: any;
      
      let currentOverallProgressStep = 0;

      console.log(`[DATASET_GENERATION] Starting content processing for ${totalSourceCount} sources`);

      // Step 1: Process and combine all content with comprehensive error handling
      currentOverallProgressStep++;
      updateProgress(
        currentOverallProgressStep,
        estimatedTotalSteps,
        `Processing ${totalSourceCount} sources...`,
        totalSourceCount, enableWebAugmentation, enableGapFilling
      );

      const processedSources = [];
      for (let i = 0; i < totalSourceCount; i++) {
        const sourceItem = allSources[i];
        const currentSourceName = sourceItem.name;

        console.log(`[DATASET_GENERATION] Processing source ${i + 1}/${totalSourceCount}: ${currentSourceName}`);

        let individualCleanedText: string = "";

        try {
          if (sourceItem.type === 'file') {
            const file = sourceItem.data as FileData;
            individualCleanedText = file.rawContent;

            // Handle binary file text extraction with comprehensive error handling
            if (file.isBinary) {
              let binaryFunctionName = '';
              if (file.mimeType === 'application/pdf') {
                binaryFunctionName = 'process-pdf';
              } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                binaryFunctionName = 'process-docx';
              }

              if (binaryFunctionName) {
                console.log(`[DATASET_GENERATION] Calling ${binaryFunctionName} for ${file.file.name}`);
                
                try {
                  const response = await fetch(`/.netlify/functions/${binaryFunctionName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64Data: file.rawContent, fileName: file.file.name }),
                  });
                  
                  console.log(`[DATASET_GENERATION] ${binaryFunctionName} response status:`, response.status);
                  
                  if (!response.ok) {
                    let errorData;
                    try {
                      errorData = await response.json();
                    } catch (parseError) {
                      errorData = { error: 'Failed to parse error response' };
                    }
                    console.error(`[DATASET_GENERATION] ${binaryFunctionName} error:`, errorData);
                    throw new Error(`Text extraction failed for ${file.file.name}: ${response.status} ${errorData.error || 'Unknown error'}`);
                  }
                  
                  const result = await response.json();
                  console.log(`[DATASET_GENERATION] ${binaryFunctionName} result:`, {
                    success: result.success,
                    hasText: !!result.extractedText,
                    textLength: result.extractedText?.length || 0
                  });
                  
                  if (!result.success || !result.extractedText) {
                    throw new Error(`Failed to extract text from ${file.file.name}: ${result.error || 'No text extracted'}`);
                  }
                  
                  individualCleanedText = result.extractedText;
                  console.log(`[DATASET_GENERATION] Extracted ${individualCleanedText.length} chars from binary file ${file.file.name}`);
                } catch (extractionError: any) {
                  console.error(`[DATASET_GENERATION] Text extraction failed for ${file.file.name}:`, extractionError);
                  throw new Error(`Text extraction failed for ${file.file.name}: ${extractionError.message}`);
                }
              }
            }
          } else {
            const url = sourceItem.data as UrlData;
            individualCleanedText = url.rawContent;
            
            // Basic HTML stripping for URL content
            if (url.title && url.rawContent.includes('<')) {
              try {
                const doc = new DOMParser().parseFromString(individualCleanedText, "text/html");
                individualCleanedText = doc.body.textContent || "";
                console.log(`[DATASET_GENERATION] Basic HTML stripping for URL: ${url.url}, new length: ${individualCleanedText.length}`);
              } catch (parseError) {
                console.warn(`[DATASET_GENERATION] Failed to parse HTML for ${url.url}, using raw content`);
              }
            }
          }

          if (!individualCleanedText || !individualCleanedText.trim()) {
            console.warn(`[DATASET_GENERATION] Source ${currentSourceName} has no processable content. Skipping.`);
            continue;
          }

          if (individualCleanedText.length < 50) {
            console.warn(`[DATASET_GENERATION] Content for ${currentSourceName} is too short (${individualCleanedText.length} chars). Adding to combined text only.`);
          }

          processedSources.push({
            name: currentSourceName,
            content: individualCleanedText,
            length: individualCleanedText.length
          });

          overallCombinedCleanedText += (overallCombinedCleanedText ? "\n\n---\n\n" : "") + individualCleanedText;

        } catch (sourceError: any) {
          console.error(`[DATASET_GENERATION] Error processing source ${currentSourceName}:`, sourceError);
          console.warn(`[DATASET_GENERATION] Skipping ${currentSourceName} due to processing error: ${sourceError.message}`);
          continue;
        }
      }

      console.log(`[DATASET_GENERATION] Content processing complete. Combined text length: ${overallCombinedCleanedText.length}, Processed sources: ${processedSources.length}`);

      if (overallCombinedCleanedText.length < 100) {
        throw new Error('Combined content is too short for Q&A generation. Please provide more substantial content or check that your files contain readable text.');
      }

      // Step 2: Global theme identification with error handling
      currentOverallProgressStep++;
      updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Analyzing content for themes...', totalSourceCount, enableWebAugmentation, enableGapFilling);
      
      try {
        const globalIdentifiedThemes = await geminiService.identifyThemes(overallCombinedCleanedText, fineTuningGoal);
        allIdentifiedThemes = [...new Set(globalIdentifiedThemes)];
        console.log('[DATASET_GENERATION] Identified global themes:', allIdentifiedThemes);
      } catch (themeError: any) {
        console.error('[DATASET_GENERATION] Theme identification failed:', themeError);
        allIdentifiedThemes = [];
      }

      // Step 3: Generate Q&A pairs from combined content with comprehensive error handling
      currentOverallProgressStep++;
      updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Generating Q&A pairs from content...', totalSourceCount, enableWebAugmentation, enableGapFilling);

      try {
        console.log(`[DATASET_GENERATION] Generating Q&A pairs from combined content, length: ${overallCombinedCleanedText.length}`);
        const combinedQAPairs = await geminiService.generateQAPairs(
          overallCombinedCleanedText,
          allIdentifiedThemes,
          fineTuningGoal,
          true // Enable OpenRouter fallback
        );
        allInitialQAPairs.push(...combinedQAPairs);
        console.log(`[DATASET_GENERATION] Generated ${combinedQAPairs.length} Q&A pairs from combined content`);
      } catch (qaError: any) {
        console.error('[DATASET_GENERATION] Failed to generate Q&A from combined content:', qaError);
        
        // Enhanced error handling with fallback information
        if (qaError.message.includes('Primary service failed') && qaError.message.includes('Fallback service also failed')) {
          throw new Error(`Both primary (Gemini) and fallback (OpenRouter) services failed.\n\nThis could be due to:\n• Temporary service outages\n• API key configuration issues\n• Network connectivity problems\n\nPlease wait a few minutes and try again, or contact support.`);
        }
        
        if (qaError.message.includes('OpenRouter fallback failed')) {
          throw new Error(`Primary service failed and fallback service is unavailable.\n\nPlease wait 2-3 minutes and try again. If the issue persists, contact support.`);
        }
        
        if (qaError.message.includes('authentication') || 
            qaError.message.includes('API key')) {
          throw new Error(`API authentication failed. Please check that your API keys are correctly configured.\n\nContact support if you need help with API key setup.`);
        }
        
        if (qaError.message.includes('all available API keys')) {
          throw new Error(`All primary API keys failed, but fallback service should have been attempted.\n\nThis could be due to:\n• Temporary service outages\n• API key configuration issues\n• Network connectivity problems\n\nPlease wait a few minutes and try again, or contact support.`);
        }
        
        throw new Error(`Failed to generate Q&A pairs: ${qaError.message}`);
      }

      if (allInitialQAPairs.length === 0) {
        throw new Error('Failed to generate any Q&A pairs from the provided content. The content may not be suitable for Q&A generation or there may be an issue with the AI service. Please try with different content or contact support.');
      }

      let finalCombinedTextForAugmentation = overallCombinedCleanedText;
      let groundingMetadata;

      // Web augmentation with comprehensive error handling
      if (enableWebAugmentation && allIdentifiedThemes.length > 0) {
        currentOverallProgressStep++;
        updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Enhancing content with web research...', totalSourceCount, enableWebAugmentation, enableGapFilling);
        
        try {
          const result = await geminiService.augmentWithWebSearch(overallCombinedCleanedText, allIdentifiedThemes, fineTuningGoal);
          finalCombinedTextForAugmentation = result.augmentedText;
          groundingMetadata = result.groundingMetadata;
          isAnyAugmented = true;
          console.log('[DATASET_GENERATION] Web augmentation successful. New content length:', finalCombinedTextForAugmentation.length);
        } catch (err: any) {
          console.error('[DATASET_GENERATION] Web augmentation failed:', err.message);
          setError(`Web augmentation failed: ${err.message.substring(0,100)}. Proceeding without.`);
        }
      }

      let finalQAPairs: QAPair[] = [...allInitialQAPairs];
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      // Knowledge gap filling with comprehensive error handling
      if (enableGapFilling && allInitialQAPairs.length > 0) {
        console.log('[DATASET_GENERATION] Knowledge gap filling enabled');
        
        try {
          // Identify knowledge gaps
          currentOverallProgressStep++;
          console.log('[DATASET_GENERATION] Starting knowledge gap analysis');
          updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Analyzing for knowledge gaps...', totalSourceCount, enableWebAugmentation, enableGapFilling);
          
          identifiedGaps = await geminiService.identifyKnowledgeGaps(
            finalCombinedTextForAugmentation,
            allIdentifiedThemes,
            allInitialQAPairs,
            fineTuningGoal
          );
          console.log(`[DATASET_GENERATION] Identified ${identifiedGaps.length} knowledge gaps:`, identifiedGaps.map(g => g.id));

          if (identifiedGaps.length > 0) {
            // Generate validation context
            currentOverallProgressStep++;
            updateProgress(currentOverallProgressStep, estimatedTotalSteps, `Generating validation context for ${identifiedGaps.length} gaps...`, totalSourceCount, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
            
            let validationContext = '';
            try {
              validationContext = await openRouterService.generateValidationContext(
                finalCombinedTextForAugmentation,
                allIdentifiedThemes,
                allInitialQAPairs,
                identifiedGaps,
                [],
                fineTuningGoal
              );
              console.log(`[DATASET_GENERATION] Validation context generated, length: ${validationContext.length} characters`);
            } catch (contextError: any) {
              console.error('[DATASET_GENERATION] Failed to generate validation context:', contextError);
              validationContext = finalCombinedTextForAugmentation.substring(0, 8000);
              console.log('[DATASET_GENERATION] Using fallback validation context from combined content');
            }

            // Generate synthetic Q&A pairs
            currentOverallProgressStep++;
            updateProgress(currentOverallProgressStep, estimatedTotalSteps, `Generating synthetic Q&A for ${identifiedGaps.length} gaps...`, totalSourceCount, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
            
            const totalGaps = identifiedGaps.length;
            const maxPairsToRequestPerGapCall = 15;
            let allSyntheticPairs: SyntheticQAPair[] = [];

            console.log(`[DATASET_GENERATION] Requesting up to ${maxPairsToRequestPerGapCall} synthetic pairs per gap for ${totalGaps} gaps.`);

            for (let gapIndex = 0; gapIndex < totalGaps; gapIndex++) {
              const gap = identifiedGaps[gapIndex];
              try {
                console.log(`[DATASET_GENERATION] Processing gap ${gapIndex + 1}/${totalGaps}: ${gap.id}`);
                updateProgress(
                  currentOverallProgressStep,
                  estimatedTotalSteps,
                  `Synthetic Q&A for gap ${gapIndex + 1}/${totalGaps}: ${gap.description.substring(0, 30)}...`,
                  totalSourceCount, enableWebAugmentation, enableGapFilling,
                  totalGaps
                );

                const gapPairs = await openRouterService.generateSyntheticQAPairsForGap(
                  finalCombinedTextForAugmentation,
                  gap,
                  fineTuningGoal,
                  maxPairsToRequestPerGapCall
                );

                if (gapPairs.length > 0) {
                  allSyntheticPairs.push(...gapPairs);
                  console.log(`[DATASET_GENERATION] Generated ${gapPairs.length} pairs for gap ${gap.id}`);
                } else {
                  console.warn(`[DATASET_GENERATION] No synthetic pairs for gap ${gap.id}`);
                }

                if (gapIndex < totalGaps - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (gapError: any) {
                console.error(`[DATASET_GENERATION] Failed to generate pairs for gap ${gap.id}:`, gapError);
              }
            }
            
            syntheticPairCount = allSyntheticPairs.length;
            console.log(`[DATASET_GENERATION] Generated ${syntheticPairCount} total synthetic Q&A pairs`);

            // Validate synthetic pairs with comprehensive error handling
            if (allSyntheticPairs.length > 0 && validationContext.trim()) {
              const validatedSyntheticPairs: QAPair[] = [];
              const validationThreshold = 0.6;

              for (let i = 0; i < allSyntheticPairs.length; i++) {
                const synthPair = allSyntheticPairs[i];
                
                try {
                  const validation = await openRouterService.validateQAPair(
                    synthPair,
                    validationContext,
                    fineTuningGoal
                  );

                  console.log(`[DATASET_GENERATION] Validation result for pair ${i + 1}: valid=${validation.isValid}, confidence=${validation.confidence}`);

                  if (validation.isValid && validation.confidence >= validationThreshold) {
                    validatedSyntheticPairs.push({
                      ...synthPair,
                      validationStatus: 'validated',
                      validationConfidence: validation.confidence,
                      confidence: Math.min(synthPair.confidence || 0.9, validation.factualAccuracy)
                    });
                    console.log(`[DATASET_GENERATION] Synthetic pair ${i + 1} validated and included.`);
                  } else {
                    console.log(`[DATASET_GENERATION] Synthetic pair ${i + 1} rejected (confidence: ${validation.confidence}, threshold: ${validationThreshold})`);
                  }

                  if (i < allSyntheticPairs.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                  }

                } catch (validationError) {
                  console.error(`[DATASET_GENERATION] Validation failed for synthetic pair ${i}:`, validationError);
                }
              }
              
              validatedPairCount = validatedSyntheticPairs.length;
              finalQAPairs.push(...validatedSyntheticPairs);
              console.log(`[DATASET_GENERATION] Added ${validatedPairCount} validated synthetic Q&A pairs.`);
            } else if (allSyntheticPairs.length > 0) {
              console.warn('[DATASET_GENERATION] Skipping validation of synthetic pairs due to empty validation context.');
            } else {
              console.log('[DATASET_GENERATION] No synthetic pairs generated to validate.');
            }
          } else {
            console.log('[DATASET_GENERATION] No knowledge gaps identified, skipping synthetic Q&A generation.');
          }
        } catch (gapFillingError: any) {
          console.error('[DATASET_GENERATION] Knowledge gap filling process failed:', gapFillingError.message);
          setError(`Gap filling failed: ${gapFillingError.message.substring(0,100)}. Proceeding without.`);
        }
      } else {
        console.log('[DATASET_GENERATION] Knowledge gap filling disabled or no initial Q&A pairs available');
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
        identifiedGaps: identifiedGaps.length,
        initialQAPairs: allInitialQAPairs.length,
      });

      setProcessedData({
        combinedCleanedText: finalCombinedTextForAugmentation,
        qaPairs: finalQAPairs,
        sourceFileCount: readyFiles.length,
        sourceUrlCount: readyUrls.length,
        identifiedThemes: allIdentifiedThemes,
        isAugmented: isAnyAugmented,
        groundingMetadata: groundingMetadata,
        correctAnswerCount: correctAnswers.length,
        incorrectAnswerCount: incorrectAnswers.length,
        syntheticPairCount,
        validatedPairCount,
        identifiedGaps,
        gapFillingEnabled: enableGapFilling
      });

      setProgress(100);
      setEstimatedTimeRemaining(0);
      
      let completionMessage = `Successfully generated ${finalQAPairs.length} total Q&A pairs`;
      completionMessage += ` (${allInitialQAPairs.length} initial, ${validatedPairCount} validated synthetic)`;
      completionMessage += ` from ${totalSourceCount} sources.`;
      
      if (identifiedGaps.length > 0) {
        completionMessage += ` Knowledge gaps addressed: ${identifiedGaps.length}.`;
      }
      
      setCurrentStep(completionMessage);
      console.log('[DATASET_GENERATION] Process completed successfully:', completionMessage);

      // Send completion notification
      try {
        console.log('[DATASET_GENERATION] Sending completion notification');
        await notificationService.sendCompletionNotification(finalQAPairs.length, correctAnswers.length, incorrectAnswers.length);
      } catch (error) {
        console.warn('[DATASET_GENERATION] Failed to send completion notification:', error);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
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