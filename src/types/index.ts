export interface QAPair {
  user: string;
  model: string;
  isCorrect: boolean; // true for correct answers, false for incorrect
  confidence?: number; // confidence score for the answer quality
}

export interface FileData {
  id: string;
  file: File;
  mimeType: string;
  rawContent: string;
  isBinary: boolean;
  cleanedText?: string;
  error?: string;
  status: 'pending' | 'reading' | 'read' | 'cleaning' | 'cleaned' | 'failed';
}

export interface UrlData {
  id: string;
  url: string;
  title?: string;
  rawContent: string;
  error?: string;
  status: 'pending' | 'fetching' | 'fetched' | 'cleaning' | 'cleaned' | 'failed';
}

export interface WebSearchResult {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: WebSearchResult;
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  webSearchQueries?: string[];
}

export interface ProcessedData {
  combinedCleanedText: string;
  qaPairs: QAPair[];
  sourceFileCount: number;
  sourceUrlCount: number;
  identifiedThemes: string[];
  isAugmented?: boolean;
  groundingMetadata?: GroundingMetadata;
  correctAnswerCount: number;
  incorrectAnswerCount: number;
}

export interface StandardFormatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface StandardFormatQAPair {
  input: {
    messages: StandardFormatMessage[];
  };
  preferred_output: StandardFormatMessage[];
  non_preferred_output: StandardFormatMessage[];
  metadata: {
    is_correct: boolean;
    confidence?: number;
    theme?: string;
  };
}

export type TextMimeType = 
  | 'text/plain'
  | 'text/markdown'
  | 'text/html'
  | 'application/jsonl'
  | string;

export type BinaryMimeType = 
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | string;