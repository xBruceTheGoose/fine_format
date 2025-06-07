export interface QAPair {
  user: string;
  model: string;
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
  isAugmented?: boolean;
  groundingMetadata?: GroundingMetadata;
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