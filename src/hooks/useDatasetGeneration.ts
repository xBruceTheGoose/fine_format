import { useState, useCallback } from 'react';
import { geminiService } from '../services/geminiService';
import { downloadService } from '../services/downloadService';
import type { FileData, UrlData, ProcessedData, FineTuningGoal } from '../types';

export function useDatasetGeneration() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [totalEstimatedTime, setTotalEstimatedTime] = useState(0);

  const generateDataset = useCallback(async (
    files: FileData[],
    urls: UrlData[],
    fineTuningGoal: FineTuningGoal
  ) => {
    setIsProcessing(true);
    setError(null);
    setProgress(0);
    setCurrentStep('Initializing...');

    try {
      // Step 1: Process content and identify themes
      setCurrentStep('Processing content and identifying themes...');
      setProgress(10);

      const allContent = [
        ...files.map(f => ({ type: 'file' as const, name: f.name, content: f.cleanedText || f.rawContent })),
        ...urls.map(u => ({ type: 'url' as const, url: u.url, content: u.cleanedText || u.rawContent }))
      ];

      const themes = await geminiService.identifyThemes(allContent, fineTuningGoal);
      setProgress(25);

      // Step 2: Perform web research for knowledge gaps
      setCurrentStep('Performing web research for knowledge gaps...');
      const researchData = await geminiService.performWebResearch(themes, fineTuningGoal);
      setProgress(40);

      // Step 3: Generate Q&A pairs from original content
      setCurrentStep('Generating Q&A pairs from content...');
      let qaPairs;
      try {
        qaPairs = await geminiService.generateQAPairs(allContent, themes, fineTuningGoal);
      } catch (qaError) {
        console.error('Error generating Q&A pairs:', qaError);
        throw new Error(`Failed to generate Q&A pairs: ${qaError instanceof Error ? qaError.message : 'Unknown error'}`);
      }
      setProgress(60);

      // Step 4: Generate synthetic Q&A pairs
      setCurrentStep('Generating synthetic Q&A pairs...');
      const syntheticPairs = await geminiService.generateSyntheticQAPairs(
        researchData.knowledgeGaps,
        themes,
        fineTuningGoal
      );
      setProgress(75);

      // Step 5: Validate all Q&A pairs
      setCurrentStep('Validating Q&A pairs...');
      const allPairs = [...qaPairs, ...syntheticPairs];
      const validationResults = await geminiService.validateQAPairs(allPairs);
      setProgress(85);

      // Step 6: Generate incorrect answers for training
      setCurrentStep('Generating incorrect answers...');
      const incorrectAnswers = await geminiService.generateIncorrectAnswers(qaPairs);
      setProgress(95);

      // Step 7: Compile final dataset
      setCurrentStep('Compiling final dataset...');
      const finalData: ProcessedData = {
        qaPairs: qaPairs.map((pair, index) => ({
          id: `qa-${index}`,
          user: pair.question,
          model: pair.answer,
          isCorrect: true,
          difficulty: pair.difficulty,
          category: pair.category,
          source: 'original'
        })),
        syntheticPairs: syntheticPairs,
        themes,
        validationResults,
        incorrectAnswers,
        metadata: {
          totalPairs: allPairs.length,
          validPairs: validationResults.filter(r => r.isValid).length,
          averageConfidence: validationResults.reduce((acc, r) => acc + (r.confidence || 0), 0) / validationResults.length,
          fineTuningGoal,
          generatedAt: new Date().toISOString(),
          sources: {
            files: files.length,
            urls: urls.length
          }
        }
      };

      setProcessedData(finalData);
      setProgress(100);
      setCurrentStep('Dataset generation complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      console.error('Dataset generation error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const downloadDataset = useCallback(() => {
    if (processedData) {
      downloadService.downloadDataset(processedData);
    }
  }, [processedData]);

  const resetGeneration = useCallback(() => {
    setProcessedData(null);
    setCurrentStep('');
    setProgress(0);
    setError(null);
    setIsProcessing(false);
  }, []);

  return {
    isProcessing,
    processedData,
    currentStep,
    progress,
    error,
    generateDataset,
    downloadDataset,
    resetGeneration
  };
}