export interface QAPair {
  user: string;
  model: string;
  isCorrect: boolean; // true for correct answers, false for incorrect
  confidence?: number; // confidence score for the answer quality
  source?: 'original' | 'synthetic'; // Track if Q&A is original or synthetic
  validationStatus?: 'pending' | 'validated' | 'rejected' | 'failed';
  validationConfidence?: number; // Cross-validation confidence score
  knowledgeGap?: string; // Which knowledge gap this addresses
}

export interface KnowledgeGap {
  id: string;
  description: string;
  theme: string;
  priority: 'high' | 'medium' | 'low';
  suggestedQuestionTypes: string[];
  relatedConcepts: string[];
}

export interface SyntheticQAPair extends Omit<QAPair, 'source'> {
  source: 'synthetic';
  targetGap: string;
  generationReasoning?: string;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reasoning: string;
  suggestedCorrection?: string;
  factualAccuracy: number;
  relevanceScore: number;
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
  syntheticPairCount?: number;
  validatedPairCount?: number;
  identifiedGaps?: KnowledgeGap[];
  gapFillingEnabled?: boolean;
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

export type FineTuningMethod = 
  | 'pytorch'
  | 'together'
  | 'huggingface'
  | 'colab'
  | 'openai'
  | 'anthropic'
  | 'generic';

export interface FineTuningConfig {
  id: FineTuningMethod;
  name: string;
  description: string;
  formats: string[];
  defaultFormat: string;
}

export type FineTuningGoal = 
  | 'topic'
  | 'knowledge'
  | 'style';

export interface FineTuningGoalConfig {
  id: FineTuningGoal;
  name: string;
  description: string;
  icon: string;
  promptFocus: string;
}