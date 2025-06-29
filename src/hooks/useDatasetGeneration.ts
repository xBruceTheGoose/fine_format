import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair } from '../types';
import { geminiService } from '../services/geminiService';
import { openRouterService } from '../services/openRouterService';
// import { buildshipService } from '../services/buildshipService'; // Buildship removed
// import { SYNTHETIC_QA_TARGET } from '../constants'; // No longer directly used for target calculation here

// Import notification service directly since it no longer depends on client-side API keys
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
    // Updated time estimates with BuildShip multiFormatContentCleaner preprocessing
    const buildshipProcessingTime = 45; // 45 seconds for BuildShip multiFormatContentCleaner workflow
    const themeAnalysisTime = 20; // 20 seconds for theme identification
    const qaGenerationTime = 45; // 45 seconds for Q&A generation
    const webAugmentationTime = 60; // 60 seconds for web search and augmentation
    const gapAnalysisTime = 30; // 30 seconds for gap analysis
    const validationContextTime = 20; // 20 seconds for validation context generation
    const syntheticGenerationTimePerGap = 15; // 15 seconds per gap (individual requests)
    const validationTimePerPair = 3; // 3 seconds per validation (faster individual validation)

    // Remove buildshipProcessingTime from the base calculation
    let totalTime = themeAnalysisTime + qaGenerationTime; // Base time without Buildship
    
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
    console.log('[DATASET_GENERATION] Starting dataset generation process (Buildship removed).');

    console.log('[DATASET_GENERATION] Parameters:', {
      fileCount: files.length,
      urlCount: urls.length,
      enableWebAugmentation,
      fineTuningGoal,
      enableGapFilling,
      // buildshipReady: buildshipService.isReady(), // Buildship removed
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
      setError('No valid files or URLs ready for processing.');
      return;
    }

    // if (!buildshipService.isReady()) { // Buildship removed
    //   console.error('[DATASET_GENERATION] BuildShip service not ready');
    //   setError('BuildShip multiFormatContentCleaner preprocessing service is not configured. Please check your API key.');
    //   return;
    // }

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

      // Dynamically calculate total steps (Buildship step removed)
      // Per source: 1 (binary extraction if needed) + 1 (Q&A generation) = ~1-2 steps per source
      // Global steps: 1 (Global Theme ID) + Web Augmentation + Gap Filling
      let estimatedTotalSteps = totalSourceCount * 1.5 + 1; // Simplified: Avg 1.5 for (extraction)+Q&A, + Global Theme
      if (enableWebAugmentation) estimatedTotalSteps += 1;
      if (enableGapFilling) estimatedTotalSteps += 3;

      let overallCombinedCleanedText = ""; // This will now be overall *raw* or *extracted* text
      let allInitialQAPairs: QAPair[] = [];
      let allIdentifiedThemes: string[] = [];
      let isAnyAugmented = false;
      let overallGroundingMetadata: GroundingMetadata | undefined;
      
      let currentOverallProgressStep = 0;

      console.log(`[DATASET_GENERATION] Starting individual processing for ${totalSourceCount} sources (Buildship removed).`);

      for (let i = 0; i < totalSourceCount; i++) {
        const sourceItem = allSources[i];
        const currentSourceName = sourceItem.name;
        currentOverallProgressStep++;

        updateProgress(
          currentOverallProgressStep,
          estimatedTotalSteps,
          `Processing source ${i + 1}/${totalSourceCount}: ${currentSourceName.substring(0,30)}...`,
          totalSourceCount, enableWebAugmentation, enableGapFilling
        );

        let individualCleanedText: string = ""; // Renamed from rawContentForService for clarity post-extraction

        if (sourceItem.type === 'file') {
          const file = sourceItem.data as FileData;
          individualCleanedText = file.rawContent; // Base64 for binary, text for others

          if (file.isBinary) {
            let binaryFunctionName = '';
            if (file.mimeType === 'application/pdf') {
              binaryFunctionName = 'process-pdf';
            } else if (file.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              binaryFunctionName = 'process-docx';
            }

            if (binaryFunctionName) {
              updateProgress(
                currentOverallProgressStep, // Keep same step, it's part of "Processing source"
                estimatedTotalSteps,
                `Extracting text: ${file.file.name.substring(0,20)}...`,
                totalSourceCount, enableWebAugmentation, enableGapFilling
              );
              try {
                const response = await fetch(`/.netlify/functions/${binaryFunctionName}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ base64Data: file.rawContent, fileName: file.file.name }),
                });
                if (!response.ok) {
                  const errorData = await response.json().catch(() => ({}));
                  throw new Error(`Text extraction failed for ${file.file.name}: ${response.status} ${errorData.error || 'Unknown error'}`);
                }
                const result = await response.json();
                individualCleanedText = result.extractedText; // Use extracted text
                console.log(`[DATASET_GENERATION] Extracted ${individualCleanedText.length} chars from binary file ${file.file.name}`);
              } catch (binError: any) {
                console.error(`[DATASET_GENERATION] Error extracting text from binary file ${file.file.name}:`, binError.message);
                setError(`Text extraction failed for ${file.file.name.substring(0,20)}. Skipping. ${binError.message.substring(0,50)}`);
                continue;
              }
            }
          }
        } else { // 'url'
          const url = sourceItem.data as UrlData;
          // For URLs, the rawContent is already fetched HTML/text.
          // We might want a basic HTML to text conversion here if it's not already plain text.
          // For now, assume url.rawContent is usable directly or needs simple stripping.
          // A more robust solution might involve a simple HTML-to-text utility here.
          individualCleanedText = url.rawContent; // Assuming this is primarily text or needs basic stripping
           if (url.mimeType && url.mimeType.includes('html')) {
             // Basic stripping for HTML content from URLs if not using buildship
             const doc = new DOMParser().parseFromString(individualCleanedText, "text/html");
             individualCleanedText = doc.body.textContent || "";
             console.log(`[DATASET_GENERATION] Basic HTML stripping for URL: ${url.url}, new length: ${individualCleanedText.length}`);
           }
        }

        if (!individualCleanedText || !individualCleanedText.trim()) {
            console.warn(`[DATASET_GENERATION] Source ${currentSourceName} has no processable content. Skipping.`);
            continue;
        }

        // No Buildship cleaning step. individualCleanedText is now the direct input for Q&A.

        if (individualCleanedText.length < 200) { // Min length for Q&A
            console.warn(`[DATASET_GENERATION] Content for ${currentSourceName} is too short (${individualCleanedText.length} chars) for Q&A. Adding to combined text only.`);
            overallCombinedCleanedText += (overallCombinedCleanedText ? "\n\n---\n\n" : "") + individualCleanedText;
            continue;
        }

        overallCombinedCleanedText += (overallCombinedCleanedText ? "\n\n---\n\n" : "") + individualCleanedText;

        // Q&A Generation step is typically the next logical step in progress
        // If binary extraction happened, currentOverallProgressStep was not incremented for it.
        // If it was a text file, this is the "next" main operation for this file.
        // Let's ensure progress step increments before Q&A generation if it's a distinct phase.
        // currentOverallProgressStep++; // This was for Buildship, now for Q&A
        updateProgress(
            currentOverallProgressStep,
            estimatedTotalSteps,
            `Generating Q&A: ${currentSourceName.substring(0,20)}... (${i + 1}/${totalSourceCount})`, // Message implies Q&A is starting
            totalSourceCount, enableWebAugmentation, enableGapFilling
        );

        try {
            const individualQAPairs = await geminiService.generateQAPairs(
              individualCleanedText,
              [], // Themes will be identified globally later
              fineTuningGoal
            );
            allInitialQAPairs.push(...individualQAPairs);
            console.log(`[DATASET_GENERATION] Generated ${individualQAPairs.length} Q&A pairs for ${currentSourceName}`);
        } catch (qaError: any) {
            console.error(`[DATASET_GENERATION] Failed to generate Q&A for ${currentSourceName}: ${qaError.message}`);
            // Update UI for this specific file if possible
            setError(`Failed Q&A for ${currentSourceName.substring(0,30)}... Continuing.`); // Non-blocking error
        }
      }

      if (allInitialQAPairs.length === 0 && overallCombinedCleanedText.length < 500) {
        throw new Error('No Q&A pairs generated and combined content is too short. Please check your sources.');
      }
       if (overallCombinedCleanedText.length < 500 && !enableGapFilling && !enableWebAugmentation) {
        console.warn(`[DATASET_GENERATION] Combined content length is ${overallCombinedCleanedText.length} chars. May be insufficient for robust global operations if enabled.`);
      }


      currentOverallProgressStep++;
      updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Analyzing combined content for global themes...', totalSourceCount, enableWebAugmentation, enableGapFilling);
      
      if (overallCombinedCleanedText.trim()) {
        const globalIdentifiedThemes = await geminiService.identifyThemes(overallCombinedCleanedText, fineTuningGoal);
        allIdentifiedThemes = [...new Set(globalIdentifiedThemes)]; // Deduplicate
        console.log('[DATASET_GENERATION] Identified global themes:', allIdentifiedThemes);
      } else {
        console.warn('[DATASET_GENERATION] Combined cleaned text is empty. Skipping global theme identification.');
      }
      

      let finalCombinedTextForAugmentation = overallCombinedCleanedText;
      let groundingMetadata; // Renamed from overallGroundingMetadata to avoid conflict

      if (enableWebAugmentation && allIdentifiedThemes.length > 0 && overallCombinedCleanedText.trim()) {
        currentOverallProgressStep++;
        updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Enhancing combined content with web research...', totalSourceCount, enableWebAugmentation, enableGapFilling);
        try {
          const result = await geminiService.augmentWithWebSearch(overallCombinedCleanedText, allIdentifiedThemes, fineTuningGoal);
          finalCombinedTextForAugmentation = result.augmentedText;
          groundingMetadata = result.groundingMetadata; // Assign to local variable
          isAnyAugmented = true;
          console.log('[DATASET_GENERATION] Web augmentation successful. New content length:', finalCombinedTextForAugmentation.length);
        } catch (err: any) {
          console.error('[DATASET_GENERATION] Web augmentation failed:', err.message);
          setError(`Web augmentation failed: ${err.message.substring(0,100)}. Proceeding without.`);
        }
      } else if (enableWebAugmentation) {
         console.warn('[DATASET_GENERATION] Web augmentation skipped due to no themes or empty combined text.');
      }


      let finalQAPairs: QAPair[] = [...allInitialQAPairs];
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      // Step 5-8: Knowledge gap filling - ADDITIONAL synthetic pairs (if enabled)
      if (enableGapFilling) {
        console.log('[DATASET_GENERATION] Knowledge gap filling enabled');
        try {
          // Step 5: Identify knowledge gaps using Gemini analysis of the generated dataset
          currentOverallProgressStep++;
          console.log('[DATASET_GENERATION] Starting knowledge gap analysis');
          updateProgress(currentOverallProgressStep, estimatedTotalSteps, 'Analyzing for knowledge gaps...', totalSourceCount, enableWebAugmentation, enableGapFilling);
          
          if (finalCombinedTextForAugmentation.trim() && allInitialQAPairs.length > 0) {
            identifiedGaps = await geminiService.identifyKnowledgeGaps(
            finalCombinedTextForAugmentation, // Use potentially augmented text
            allIdentifiedThemes,
            allInitialQAPairs, // Base Q&A pairs for gap analysis
            fineTuningGoal
          );
          console.log(`[DATASET_GENERATION] Identified ${identifiedGaps.length} knowledge gaps:`, identifiedGaps.map(g => g.id));
          } else {
            console.warn('[DATASET_GENERATION] Knowledge gap analysis skipped due to empty combined text or no initial Q&A pairs.');
          }


          if (identifiedGaps.length > 0) {
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
              validationContext = finalCombinedTextForAugmentation.substring(0, 8000); // Increased fallback length
              console.log('[DATASET_GENERATION] Using fallback validation context from combined content');
            }

            currentOverallProgressStep++;
            updateProgress(currentOverallProgressStep, estimatedTotalSteps, `Generating synthetic Q&A for ${identifiedGaps.length} gaps...`, totalSourceCount, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
            
            const totalGaps = identifiedGaps.length;

            // No longer use SYNTHETIC_QA_TARGET for minPairsPerGap.
            // Instead, prompt for as many as possible, up to a reasonable max for a single call.
            const maxPairsToRequestPerGapCall = 15; // Max to ask for in one go for a gap.
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
                  maxPairsToRequestPerGapCall // Ask for up to this many
                );

                if (gapPairs.length > 0) {
                  allSyntheticPairs.push(...gapPairs);
                  console.log(`[DATASET_GENERATION] Generated ${gapPairs.length} pairs for gap ${gap.id}`);
                } else {
                  console.warn(`[DATASET_GENERATION] No synthetic pairs for gap ${gap.id}`);
                }

                // Add a small delay between requests to avoid rate limiting
                if (gapIndex < totalGaps - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (gapError: any) {
                console.error(`[DATASET_GENERATION] Failed to generate pairs for gap ${gap.id}:`, gapError);
              }
            }
            syntheticPairCount = allSyntheticPairs.length;

            console.log(`[DATASET_GENERATION] Generated ${syntheticPairCount} total synthetic Q&A pairs`);


            if (allSyntheticPairs.length > 0 && validationContext.trim()) {
              currentOverallProgressStep++;
              updateProgress(currentOverallProgressStep, estimatedTotalSteps, `Validating ${allSyntheticPairs.length} synthetic Q&A pairs...`, totalSourceCount, enableWebAugmentation, enableGapFilling, identifiedGaps.length);
              const validatedSyntheticPairs: QAPair[] = []; // Changed name
              const validationThreshold = 0.6;

              for (let i = 0; i < allSyntheticPairs.length; i++) {
                const synthPair = allSyntheticPairs[i];
                updateProgress(
                    currentOverallProgressStep,
                    estimatedTotalSteps,
                    `Validating synthetic pair ${i + 1}/${allSyntheticPairs.length}...`,
                    totalSourceCount, enableWebAugmentation, enableGapFilling, identifiedGaps.length
                );
                try {
                  const validation = await openRouterService.validateQAPair(
                    synthPair,
                    validationContext, // Use the generated or fallback context
                    fineTuningGoal
                  );

                  console.log(`[DATASET_GENERATION] Context-based validation result for pair ${i + 1}: valid=${validation.isValid}, confidence=${validation.confidence}`);

                  if (validation.isValid && validation.confidence >= validationThreshold) {
                    validatedSyntheticPairs.push({ // Changed name
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
                  console.error(`[DATASET_GENERATION] Context-based validation failed for synthetic pair ${i}:`, validationError);
                }
              }
              validatedPairCount = validatedSyntheticPairs.length; // Changed name
              finalQAPairs.push(...validatedSyntheticPairs); // Changed name
              console.log(`[DATASET_GENERATION] Added ${validatedPairCount} validated synthetic Q&A pairs.`);
            } else if (allSyntheticPairs.length > 0) {
                console.warn('[DATASET_GENERATION] Skipping validation of synthetic pairs due to empty validation context.');
                // Optionally add unvalidated synthetic pairs or handle differently
            } else {
                 console.log('[DATASET_GENERATION] No synthetic pairs generated to validate.');
            }
          } else {
            console.log('[DATASET_GENERATION] No knowledge gaps identified or prerequisites not met, skipping synthetic Q&A generation.');
          }
        } catch (gapFillingError: any) {
          console.error('[DATASET_GENERATION] Knowledge gap filling process failed:', gapFillingError.message);
          setError(`Gap filling failed: ${gapFillingError.message.substring(0,100)}. Proceeding without.`);
        }
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
        groundingMetadata: groundingMetadata, // Use the local variable
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

      // Play sound notification
      playCompletionSound();

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
      setError(`Critical error: ${errorMessage}`); // Ensure this error is displayed prominently
      setCurrentStep('Process failed. See error details.');
      setProgress(0); // Reset progress on critical failure
      // Retain estimated time if it was calculated, or set to null
      // setEstimatedTimeRemaining(null);
      // setTotalEstimatedTime(null);

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

  return { // Ensure all returned values are defined
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