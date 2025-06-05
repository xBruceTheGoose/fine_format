
import { TextMimeType, BinaryMimeType } from './types';

export const GEMINI_TEXT_MODEL = 'gemini-2.5-flash-preview-04-17';

export const SUPPORTED_TEXT_MIME_TYPES: TextMimeType[] = [
  'text/plain',
  'text/markdown', // browsers might not set this, check extension
  'text/html',
  'application/jsonl', // often text/plain, check extension
];

export const SUPPORTED_BINARY_MIME_TYPES: BinaryMimeType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ACCEPTED_FILE_EXTENSIONS = ".txt,.md,.html,.jsonl,.pdf,.docx";
export const QA_PAIR_COUNT_TARGET = 100; // Target number of Q&A pairs