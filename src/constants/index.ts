import { TextMimeType, BinaryMimeType } from '../types';

export const GEMINI_MODEL = 'gemini-2.0-flash-exp';
export const QA_PAIR_COUNT_TARGET = 50;

export const SUPPORTED_TEXT_MIME_TYPES: TextMimeType[] = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/jsonl',
];

export const SUPPORTED_BINARY_MIME_TYPES: BinaryMimeType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ACCEPTED_FILE_EXTENSIONS = '.txt,.md,.html,.jsonl,.pdf,.docx';

export const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB