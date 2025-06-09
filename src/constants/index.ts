import { TextMimeType, BinaryMimeType, FineTuningConfig, FineTuningGoalConfig } from '../types';

export const GEMINI_MODEL = 'gemini-2.0-flash-exp'; // Revert to original model
export const QA_PAIR_COUNT_TARGET = 100; // Target 100 Q&A pairs from original content
export const SYNTHETIC_QA_TARGET = 75; // Target 50-100 additional synthetic pairs
export const INCORRECT_ANSWER_RATIO = 0.08; // 8% incorrect answers (within 5-10% range)

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

export const FINE_TUNING_METHODS: FineTuningConfig[] = [
  {
    id: 'pytorch',
    name: 'PyTorch',
    description: 'Native PyTorch training with custom datasets',
    formats: ['json', 'jsonl'],
    defaultFormat: 'json'
  },
  {
    id: 'together',
    name: 'Together.ai',
    description: 'Together.ai fine-tuning service',
    formats: ['jsonl'],
    defaultFormat: 'jsonl'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    description: 'Hugging Face Transformers and Datasets',
    formats: ['json', 'jsonl', 'csv'],
    defaultFormat: 'json'
  },
  {
    id: 'colab',
    name: 'Colab/Jupyter',
    description: 'Google Colab and Jupyter notebook environments',
    formats: ['json', 'csv'],
    defaultFormat: 'json'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI fine-tuning API',
    formats: ['jsonl'],
    defaultFormat: 'jsonl'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Anthropic Claude fine-tuning',
    formats: ['jsonl'],
    defaultFormat: 'jsonl'
  },
  {
    id: 'generic',
    name: 'Generic/Custom',
    description: 'Standard formats for custom implementations',
    formats: ['json', 'jsonl', 'csv'],
    defaultFormat: 'json'
  }
];

export const FINE_TUNING_GOALS: FineTuningGoalConfig[] = [
  {
    id: 'topic',
    name: 'Topic/Theme Focus',
    description: 'Generate Q&A pairs focused on the main topics and themes within the content',
    icon: '🎯',
    promptFocus: 'topic and theme understanding'
  },
  {
    id: 'knowledge',
    name: 'Knowledge Base',
    description: 'Create comprehensive Q&A pairs for business knowledge bases and factual content',
    icon: '📚',
    promptFocus: 'factual knowledge and information retrieval'
  },
  {
    id: 'style',
    name: 'Writing/Communication Style',
    description: 'Focus on mimicking the writing style, tone, and communication patterns',
    icon: '✍️',
    promptFocus: 'writing style, tone, and communication patterns'
  }
];