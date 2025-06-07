import { useState, useCallback } from 'react';
import { FileData, UrlData, ProcessedData, FineTuningGoal, QAPair, KnowledgeGap, SyntheticQAPair } from '../types';
import { geminiService } from '../services/geminiService';
import { deepseekService } from '../services/deepseekService';

interface UseDatasetGenerationReturn {
  processedData: ProcessedData | null;
  isProcessing: boolean;
  currentStep: string;
  progress: number;
  error: string | null;
  generateDataset: (files: FileData[], urls: UrlData[], enableWebAugmentation: boolean, fineTuningGoal: FineTuningGoal, enableGapFilling?: boolean) => Promise<void>;
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

    setIsProcessing(true);
    setError(null);
    setProcessedData(null);
    setProgress(0);

    try {
      const totalSources = readyFiles.length + readyUrls.length;
      
      // Calculate total steps based on enabled features
      let totalSteps = totalSources + 2; // Base: source processing + theme identification + Q&A generation
      if (enableWebAugmentation) totalSteps += 2; // +2 for web search steps
      if (enableGapFilling && deepseekService.isReady()) totalSteps += 3; // +3 for gap analysis, synthetic generation, validation
      
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

      // Step 4: Generate initial Q&A pairs
      currentStepIndex++;
      updateProgress(currentStepIndex, totalSteps, 'Generating comprehensive Q&A pairs...');
      const initialQAPairs = await geminiService.generateQAPairs(combinedContent, identifiedThemes, fineTuningGoal);

      let finalQAPairs: QAPair[] = [...initialQAPairs];
      let identifiedGaps: KnowledgeGap[] = [];
      let syntheticPairCount = 0;
      let validatedPairCount = 0;

      // Step 5-7: Knowledge gap filling (if enabled and DeepSeek is available)
      if (enableGapFilling && deepseekService.isReady()) {
        try {
          // Step 5: Identify knowledge gaps
          currentStepIndex++;
          updateProgress(currentStepIndex, totalSteps, 'Analyzing dataset for knowledge gaps...');
          
          identifiedGaps = await deepseekService.identifyKnowledgeGaps(
            combinedContent,
            identifiedThemes,
            initialQAPairs,
            fineTuningGoal
          );

          if (identifiedGaps.length > 0) {
            // Step 6: Generate synthetic Q&A pairs
            currentStepIndex++;
            updateProgress(currentStepIndex, totalSteps, `Generating synthetic Q&A pairs for ${identifiedGaps.length} knowledge gaps...`);
            
            const syntheticPairs = await deepseekService.generateSyntheticQAPairs(
              combinedContent,
              identifiedGaps,
              fineTuningGoal,
              Math.min(30, identifiedGaps.length * 4) // Target 4 pairs per gap, max 30
            );

            syntheticPairCount = syntheticPairs.length;

            // Step 7: Cross-validate synthetic pairs
            currentStepIndex++;
            updateProgress(currentStepIndex, totalSteps, `Cross-validating ${syntheticPairs.length} synthetic Q&A pairs...`);
            
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
                    `Cross-validating synthetic Q&A pairs... (${i + 1}/${syntheticPairs.length}, ${validatedPairCount} validated)`
                  );
                }
              } catch (validationError) {
                console.error(`Validation failed for synthetic pair ${i}:`, validationError);
                // Continue with other pairs
              }
            }

            // Add validated synthetic pairs to the final dataset
            finalQAPairs = [...initialQAPairs, ...validatedPairs];
          }
        } catch (gapFillingError) {
          console.error('Knowledge gap filling failed:', gapFillingError);
          // Continue with original Q&A pairs only
          setError('Knowledge gap filling encountered issues, proceeding with original dataset.');
        }
      } else if (enableGapFilling && !deepseekService.isReady()) {
        console.warn('Knowledge gap filling requested but DeepSeek service not available');
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
        gapFillingEnabled: enableGapFilling && deepseekService.isReady()
      });

      setProgress(100);
      
      let completionMessage = `Successfully generated ${finalQAPairs.length} Q&A pairs (${correctAnswers.length} correct, ${incorrectAnswers.length} incorrect) from ${successfulSources.length} sources!`;
      
      if (syntheticPairCount > 0) {
        completionMessage += ` Includes ${validatedPairCount} validated synthetic pairs addressing ${identifiedGaps.length} knowledge gaps.`;
      }
      
      setCurrentStep(completionMessage);
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