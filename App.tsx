import React, { useState, useCallback, ChangeEvent, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { QAPair, FileData, CombinedProcessedData, GroundingMetadata } from './types';
import { SUPPORTED_TEXT_MIME_TYPES, SUPPORTED_BINARY_MIME_TYPES } from './constants';
import { getCleanedTextFromString, getCleanedTextFromBase64, generateQAPairs, getAugmentedContentWithWebSearch } from './services/geminiService';
import { downloadAsCSV, downloadAsJSONL, downloadAsJSON } from './services/fileHelper';
import FileUploadArea from './components/FileUploadArea';
import DatasetPreview from './components/DatasetPreview';
import DownloadButtons from './components/DownloadButtons';
import Spinner from './components/Spinner';
import AlertMessage from './components/AlertMessage';
import { FileText, UploadCloud, Zap, CheckCircle, XCircle, Info, Search, HelpCircle } from 'lucide-react';

let ai: GoogleGenAI | null = null;
let apiKeyAvailable = false;

const apiKey = import.meta.env.VITE_API_KEY || process.env.API_KEY;
if (!apiKey) {
  console.error("API key not found in environment variables");
} else {
  try {
    ai = new GoogleGenAI(apiKey);
    apiKeyAvailable = true;
  } catch (error) {
    console.error("Failed to initialize GoogleGenAI:", error);
  }
}

const App: React.FC = () => {
  const [filesData, setFilesData] = useState<FileData[]>([]);
  const [processedData, setProcessedData] = useState<CombinedProcessedData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [overallError, setOverallError] = useState<string | null>(null);
  const [apiKeyMissingWarning, setApiKeyMissingWarning] = useState<boolean>(!apiKeyAvailable);
  const [isWebAugmentationEnabled, setIsWebAugmentationEnabled] = useState<boolean>(false);

  useEffect(() => {
    if (!apiKeyAvailable && !apiKeyMissingWarning) {
        setApiKeyMissingWarning(true);
    }
  }, []);


  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setOverallError(null); 
    setProcessedData(null); 

    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFilesPromises: Promise<FileData>[] = Array.from(selectedFiles).map((file, index) => {
        return new Promise<FileData>((resolve) => {
          const reader = new FileReader();
          const fileId = `${file.name}-${file.lastModified}-${Date.now()}-${index}`;
          const mimeType = file.type || 'application/octet-stream';

          const initialFileData: FileData = {
            id: fileId,
            file,
            mimeType,
            rawContent: '',
            isBinary: false,
            status: 'reading',
          };

          if (SUPPORTED_TEXT_MIME_TYPES.includes(mimeType) || file.name.endsWith('.md') || file.name.endsWith('.jsonl') || file.name.endsWith('.txt') || file.name.endsWith('.html')) {
            reader.onload = (e) => {
              resolve({
                ...initialFileData,
                rawContent: e.target?.result as string,
                isBinary: false,
                status: 'read',
              });
            };
            reader.onerror = () => {
                resolve({ ...initialFileData, status: 'failed', error: 'Error reading file as text.' });
            }
            reader.readAsText(file);
          } else if (SUPPORTED_BINARY_MIME_TYPES.includes(mimeType) || file.name.endsWith('.pdf') || file.name.endsWith('.docx')) {
            reader.onload = (e) => {
              const result = e.target?.result as string;
              resolve({
                ...initialFileData,
                rawContent: result.split(',')[1], 
                isBinary: true,
                status: 'read',
              });
            };
            reader.onerror = () => {
                resolve({ ...initialFileData, status: 'failed', error: 'Error reading file as data URL.' });
            }
            reader.readAsDataURL(file);
          } else {
            resolve({
              ...initialFileData,
              status: 'failed',
              error: `Unsupported file type: ${mimeType || file.name}.`,
            });
          }
        });
      });

      Promise.all(newFilesPromises).then(newlyReadFiles => {
        setFilesData(prevFilesData => {
            const combined = [...prevFilesData, ...newlyReadFiles];
            const uniqueFiles = combined.filter((file, index, self) =>
                index === self.findIndex((f) => (
                    f.file.name === file.file.name && f.file.lastModified === file.file.lastModified && f.id === file.id
                ))
            );
            return uniqueFiles;
        });

        const unsupportedFoundInNewBatch = newlyReadFiles.some(f => f.status === 'failed' && f.error?.startsWith('Unsupported'));
        if (unsupportedFoundInNewBatch) {
            setOverallError(prevError => prevError ? `${prevError} Some newly selected files are unsupported.` : `One or more newly selected files are of an unsupported type. Supported types: .txt, .md, .html, .jsonl, .pdf, .docx.`);
        }
      });
    }
  }, []);

  const handleGenerateDataset = useCallback(async () => {
    const filesToProcess = filesData.filter(f => f.status === 'read' && !!f.rawContent);
    if (filesToProcess.length === 0) {
      setOverallError('Please select valid files that are ready for processing.');
      return;
    }
    if (!ai) {
      setOverallError(apiKeyAvailable ? 'Gemini AI client failed to initialize. Check console.' : 'Gemini API key not configured. Cannot proceed.');
      return;
    }

    setIsLoading(true);
    setOverallError(null);
    setProcessedData(null); 
    
    setFilesData(prevFilesData => 
        prevFilesData.map(fd => 
            filesToProcess.find(ftp => ftp.id === fd.id) ? { ...fd, status: 'cleaning', error: null } : fd
        )
    );

    const cleanedTexts: string[] = [];
    const successfullyCleanedFileDetails: {name: string, id: string}[] = [];
    let anyCleaningFailed = false;

    for (let i = 0; i < filesToProcess.length; i++) {
      const item = filesToProcess[i];
      setLoadingStep(`Cleaning ${item.file.name} (${i + 1}/${filesToProcess.length})...`);
      
      try {
        let cleanedText: string;
        if (item.isBinary) {
          cleanedText = await getCleanedTextFromBase64(ai, item.rawContent, item.mimeType, item.file.name);
        } else {
          cleanedText = await getCleanedTextFromString(ai, item.rawContent, item.file.name);
        }
        
        if (!cleanedText.trim()) {
            throw new Error("Could not extract meaningful text from the file.");
        }
        
        setFilesData(prev => prev.map(fd => fd.id === item.id ? { ...fd, cleanedText, status: 'cleaned', error: null } : fd));
        cleanedTexts.push(cleanedText);
        successfullyCleanedFileDetails.push({name: item.file.name, id: item.id});

      } catch (err: any) {
        console.error(`Error cleaning file ${item.file.name}:`, err);
        setFilesData(prev => prev.map(fd => fd.id === item.id ? { ...fd, status: 'failed', error: `Cleaning failed: ${err.message || 'Unknown error'}` } : fd));
        anyCleaningFailed = true;
      }
    }

    if (cleanedTexts.length === 0) {
      setOverallError('No text could be extracted from any of the selected files. Please check file contents or try different files.');
      setIsLoading(false);
      setLoadingStep('');
      return;
    }
     if (anyCleaningFailed) {
        setOverallError('Some files could not be processed. Dataset will be generated from successfully processed files only.');
    }

    let currentContentForQA = cleanedTexts.join('\n\n---\n\n');
    let groundingMetadataForUI: GroundingMetadata | undefined | null = null;
    let augmentationApplied = false;
    let augmentationError: string | null = null;

    if (isWebAugmentationEnabled) {
      setLoadingStep("Augmenting content with web search...");
      try {
        const augmentedResult = await getAugmentedContentWithWebSearch(ai, currentContentForQA);
        currentContentForQA = augmentedResult.augmentedText;
        groundingMetadataForUI = augmentedResult.groundingMetadata;
        augmentationApplied = true;
        if (!currentContentForQA.trim()) {
            throw new Error("Web augmentation resulted in empty content.");
        }
      } catch (err: any) {
        console.error('Error during web augmentation:', err);
        augmentationError = `Web augmentation failed: ${err.message || 'Unknown error'}. Proceeding with original content for Q&A.`;
        // Do not set overallError here yet, combine it later
      }
    }

    setLoadingStep('Generating Q&A dataset...');
    try {
      const qaPairs = await generateQAPairs(ai, currentContentForQA);
      setProcessedData({ 
        combinedCleanedText: currentContentForQA, 
        qaPairs, 
        sourceFileCount: successfullyCleanedFileDetails.length,
        isAugmented: augmentationApplied,
        groundingMetadata: groundingMetadataForUI
      });
      
      let finalError = overallError; // from cleaning stage
      if (augmentationError) {
        finalError = finalError ? `${finalError} ${augmentationError}` : augmentationError;
      }

      if (qaPairs.length === 0 && currentContentForQA.trim().length > 0) {
        const qaGenMessage = `Successfully processed content${augmentationApplied ? ' (with web augmentation)' : ''}, but no Q&A pairs were generated. The content might be too short or not suitable for Q&A.`;
        finalError = finalError ? `${finalError} ${qaGenMessage}` : qaGenMessage;
      }
      if(finalError) setOverallError(finalError);

    } catch (err: any) {
      console.error('Error during Q&A generation:', err);
      const qaGenFailureMsg = `Q&A generation failed: ${err.message || 'Unknown error'}`;
      setOverallError(prevError => prevError ? `${prevError} ${qaGenFailureMsg}` : qaGenFailureMsg);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [filesData, ai, apiKeyAvailable, isWebAugmentationEnabled, overallError]); // Added overallError to ensure it's current if appended

  const handleDownload = useCallback((format: 'csv' | 'jsonl' | 'json') => {
    if (processedData?.qaPairs && processedData.qaPairs.length > 0) {
      const cleanedFiles = filesData.filter(f => f.status === 'cleaned');
      const baseFileName = cleanedFiles.length > 1 
        ? `dataset_${cleanedFiles.length}_files${processedData.isAugmented ? "_augmented" : ""}`
        : cleanedFiles.length === 1 
          ? `${cleanedFiles[0].file.name.substring(0, cleanedFiles[0].file.name.lastIndexOf('.')) || cleanedFiles[0].file.name}_dataset${processedData.isAugmented ? "_augmented" : ""}`
          : `dataset${processedData.isAugmented ? "_augmented" : ""}`;
      
      switch (format) {
        case 'csv':
          downloadAsCSV(processedData.qaPairs, `${baseFileName}.csv`);
          break;
        case 'jsonl':
          downloadAsJSONL(processedData.qaPairs, `${baseFileName}.jsonl`);
          break;
        case 'json':
          downloadAsJSON(processedData.qaPairs, `${baseFileName}.json`);
          break;
      }
    }
  }, [processedData, filesData]);
  
  const getFileStatusIcon = (status: FileData['status'], error?: string | null) => {
    if (status === 'cleaning' || status === 'reading') return <Spinner />;
    if (status === 'cleaned') return <CheckCircle size={18} className="text-green-400" aria-label="Cleaned successfully" />;
    if (status === 'failed') return <XCircle size={18} className="text-red-400" aria-label={error ? `Failed: ${error}` : 'Processing failed'}/>;
    if (status === 'read' && !error) return <Info size={18} className="text-blue-400" aria-label="Ready for processing"/>;
    return null;
  };

  const processableFileCount = filesData.filter(f => f.status === 'read' && !!f.rawContent).length;
  const successfulFileCount = filesData.filter(f => f.status === 'cleaned').length;


  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 to-neutral-800 text-neutral-100 p-4 sm:p-8 flex flex-col items-center">
      <header className="w-full max-w-3xl mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Zap size={48} className="text-primary mr-3" />
          <h1 className="text-4xl sm:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-light to-primary">
            AI Fine-Tuning Dataset Generator
          </h1>
        </div>
        <p className="text-neutral-400 text-lg">
          Upload content, optionally augment with web data, and generate Q&A datasets.
        </p>
      </header>

      <main className="w-full max-w-3xl bg-neutral-800 shadow-2xl rounded-lg p-6 sm:p-8 space-y-6">
        <FileUploadArea onChange={handleFileChange} disabled={isLoading} multiple={true} />
        
        {apiKeyMissingWarning && (
            <AlertMessage type="warning\" message="Warning: API_KEY is not set. The application will not be able to communicate with the Gemini API." />
        )}
        {overallError && <AlertMessage type="error\" message={overallError} onClose={() => setOverallError(null)} />}

        {filesData.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-neutral-300">Selected Files ({filesData.length}):</h3>
            <ul className="max-h-60 overflow-y-auto bg-neutral-700 p-3 rounded-md space-y-2">
              {filesData.map((item) => (
                <li key={item.id} className={`flex justify-between items-center p-2 rounded ${item.status === 'failed' ? 'bg-red-900/30' : item.status === 'cleaned' ? 'bg-green-900/20' : 'bg-neutral-600/50'}`}>
                  <div className="flex items-center truncate">
                    <FileText size={20} className="text-primary-light mr-2 flex-shrink-0" />
                    <span className="truncate" title={item.file.name}>{item.file.name}</span>
                    <span className="ml-2 text-xs text-neutral-400">({item.mimeType || 'unknown type'})</span>
                  </div>
                  <div className="ml-2 flex-shrink-0" title={item.error || item.status}>
                    {getFileStatusIcon(item.status, item.error)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="flex items-center space-x-3 my-4 p-3 bg-neutral-700/50 rounded-md" role="group" aria-labelledby="webAugmentationLabel">
            <input
              type="checkbox"
              id="webAugmentationToggle"
              checked={isWebAugmentationEnabled}
              onChange={(e) => setIsWebAugmentationEnabled(e.target.checked)}
              disabled={isLoading || !apiKeyAvailable}
              className="h-5 w-5 text-primary rounded border-neutral-500 focus:ring-primary-light bg-neutral-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              aria-describedby="webAugmentationHelp"
            />
            <label htmlFor="webAugmentationToggle" id="webAugmentationLabel" className="text-neutral-200 text-sm font-medium cursor-pointer">
              Augment with Web Content
            </label>
            <span
              className="inline-flex items-center justify-center"
              data-tooltip-id="webAugmentationTooltip"
              title="When enabled, the AI will identify the main theme, find relevant information online using Google Search, and incorporate it to enrich the Q&A dataset. May increase processing time. Search sources will be listed."
            >
              <HelpCircle
                size={18}
                className="text-neutral-400 cursor-help"
                aria-hidden="true"
              />
            </span>
        </div>


        <button
          onClick={handleGenerateDataset}
          disabled={(processableFileCount === 0 && successfulFileCount === 0) || isLoading || !apiKeyAvailable}
          className="w-full flex items-center justify-center bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-4 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={isLoading ? loadingStep : `Generate Dataset from ${processableFileCount > 0 ? processableFileCount : successfulFileCount} files ${isWebAugmentationEnabled ? 'with web augmentation' : ''}`}
        >
          {isLoading ? (
            <>
              <Spinner />
              <span className="ml-2">{loadingStep || 'Processing...'}</span>
            </>
          ) : (
            <>
              <UploadCloud size={20} className="mr-2" />
              Generate Dataset ({processableFileCount > 0 ? processableFileCount : successfulFileCount} file(s) ready)
            </>
          )}
        </button>

        {processedData?.combinedCleanedText && !isLoading && (
           <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-primary-light mb-2">
                {processedData.isAugmented ? "Combined Augmented Content Preview" : "Combined Cleaned Content Preview"} (from {processedData.sourceFileCount} file{processedData.sourceFileCount === 1 ? '' : 's'}):
              </h3>
              <div className="bg-neutral-700 p-3 rounded-md max-h-40 overflow-y-auto text-sm text-neutral-300 prose prose-sm prose-invert max-w-none">
                <pre className="whitespace-pre-wrap break-words">{processedData.combinedCleanedText.substring(0, 1000)}{processedData.combinedCleanedText.length > 1000 ? '...' : ''}</pre>
              </div>
            </div>
           </div>
        )}
        
        {processedData?.isAugmented && processedData.groundingMetadata?.groundingChunks && processedData.groundingMetadata.groundingChunks.filter(chunk => chunk.web && chunk.web.uri).length > 0 && !isLoading && (
          <div className="space-y-3 mt-4">
            <h3 className="text-lg font-semibold text-neutral-300 flex items-center">
              <Search size={20} className="mr-2 text-primary-light flex-shrink-0" />
              Web Sources Used for Augmentation:
            </h3>
            <ul className="max-h-40 overflow-y-auto bg-neutral-700 p-3 rounded-md space-y-1 text-sm">
              {processedData.groundingMetadata.groundingChunks.map((chunk, index) => {
                if (chunk.web && chunk.web.uri) {
                  return (
                    <li key={index} className="text-neutral-400 truncate">
                      <a
                        href={chunk.web.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-light hover:text-primary hover:underline"
                        title={`${chunk.web.title || 'Unknown title'} - ${chunk.web.uri}`}
                      >
                        {chunk.web.title || chunk.web.uri}
                      </a>
                    </li>
                  );
                }
                return null;
              }).filter(Boolean)}
            </ul>
          </div>
        )}


        {processedData?.qaPairs && processedData.qaPairs.length > 0 && !isLoading && (
          <div className="space-y-4 mt-6">
            <DatasetPreview qaPairs={processedData.qaPairs} />
            <DownloadButtons onDownload={handleDownload} disabled={isLoading} />
          </div>
        )}
         {isLoading && !loadingStep && !overallError && filesData.length === 0 && ( 
             <div className="text-center py-4">
                <Spinner />
                <p className="text-neutral-400 mt-2">Initializing...</p>
             </div>
         )}
      </main>
      <footer className="w-full max-w-3xl mt-8 text-center text-neutral-500 text-sm">
        <p>&copy; {new Date().getFullYear()} AI Dataset Generator. Powered by Gemini.</p>
        <p className="mt-1">Supported file types: .txt, .md, .html, .jsonl, .pdf, .docx</p>
      </footer>
    </div>
  );
};

export default App;