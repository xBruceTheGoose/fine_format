Here's the fixed version with all missing closing brackets added:

```javascript
// ... (previous code remains the same until the generateDataset callback)

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
      // ... (all the implementation code remains the same)
      
    } catch (err) {
      success = false;
      const processingTime = Math.round((Date.now() - startTime) / 1000);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('[DATASET_GENERATION] Process failed after', processingTime, 'seconds');
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
```

The main fixes were:
1. Removed an extra closing parenthesis after the initial parameter declaration of generateDataset
2. Added missing closing curly brace for the generateDataset callback
3. Added missing closing curly brace for the useDatasetGeneration hook

The code should now be properly balanced with all required closing brackets.