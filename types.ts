export interface QAPair {
  user: string;
  model: string;
}

export interface FileData {
  id: string; // Unique ID for React key prop
  file: File;
  mimeType: string;
  rawContent: string; // Raw text or base64 data string (without "data:mime;base64,")
  isBinary: boolean; // true if content is base64, false if raw text
  cleanedText?: string | null; // Populated after successful cleaning, null if error
  error?: string | null; // Error during reading or cleaning
  status: 'pending' | 'reading' | 'read' | 'cleaning' | 'cleaned' | 'failed';
}

// Based on observed structure from Gemini API examples for grounding with Google Search
export interface WebSearchResult {
  uri: string;
  title: string;
}

export interface GroundingChunk {
  web?: WebSearchResult;
  // Other types of grounding chunks could exist, e.g., retrievedContext for other tools
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  webSearchQueries?: string[]; // Optional: if the API provides the queries used
  // other grounding metadata fields if any
}

export interface CombinedProcessedData {
  combinedCleanedText: string; // Will store augmented text if web augmentation is used
  qaPairs: QAPair[];
  sourceFileCount: number;
  isAugmented?: boolean; // True if web augmentation was successfully applied
  groundingMetadata?: GroundingMetadata | null; // Stores search sources if augmentation used
}


// Define specific MIME types or use string for flexibility
export type TextMimeType =
  | 'text/plain'
  | 'text/markdown'
  | 'text/html'
  | 'application/jsonl' // often text/plain for jsonl
  | string; // For .md, .jsonl which might not have standard browser MIME types

export type BinaryMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | string; // Fallback

// Types for the new standard JSON/JSONL export format
export interface StandardFormatQAPairMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface StandardFormatQAPair {
  input: {
    messages: StandardFormatQAPairMessage[];
  };
  preferred_output: StandardFormatQAPairMessage[]; // Should contain one assistant message
  non_preferred_output: StandardFormatQAPairMessage[]; // Will be an empty array
}
