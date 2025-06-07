import { QAPair, StandardFormatQAPair, StandardFormatMessage, FineTuningMethod } from '../types';

export class DownloadService {
  public static downloadAsCSV(data: QAPair[], filename: string, method: FineTuningMethod): void {
    if (data.length === 0) return;

    let csvContent: string;

    switch (method) {
      case 'huggingface':
        csvContent = this.generateHuggingFaceCSV(data);
        break;
      case 'colab':
        csvContent = this.generateColabCSV(data);
        break;
      default:
        csvContent = this.generateGenericCSV(data);
        break;
    }

    this.triggerDownload(csvContent, filename, 'text/csv');
  }

  public static downloadAsJSONL(data: QAPair[], filename: string, method: FineTuningMethod): void {
    if (data.length === 0) return;

    let jsonlContent: string;

    switch (method) {
      case 'together':
        jsonlContent = this.generateTogetherJSONL(data);
        break;
      case 'openai':
        jsonlContent = this.generateOpenAIJSONL(data);
        break;
      case 'anthropic':
        jsonlContent = this.generateAnthropicJSONL(data);
        break;
      default:
        jsonlContent = this.generateGenericJSONL(data);
        break;
    }

    this.triggerDownload(jsonlContent, filename, 'application/jsonl');
  }

  public static downloadAsJSON(data: QAPair[], filename: string, method: FineTuningMethod): void {
    if (data.length === 0) return;

    let jsonContent: string;

    switch (method) {
      case 'pytorch':
        jsonContent = this.generatePyTorchJSON(data);
        break;
      case 'huggingface':
        jsonContent = this.generateHuggingFaceJSON(data);
        break;
      case 'colab':
        jsonContent = this.generateColabJSON(data);
        break;
      default:
        jsonContent = this.generateGenericJSON(data);
        break;
    }

    this.triggerDownload(jsonContent, filename, 'application/json');
  }

  // PyTorch format
  private static generatePyTorchJSON(data: QAPair[]): string {
    const pytorchData = data.map(pair => ({
      input_text: pair.user,
      target_text: pair.model,
      label: pair.isCorrect ? 1 : 0,
      confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
      metadata: {
        is_correct: pair.isCorrect,
        quality_score: pair.confidence
      }
    }));

    return JSON.stringify({
      dataset_info: {
        name: "fine_format_dataset",
        version: "1.0",
        description: "Q&A dataset with correct/incorrect labels for fine-tuning",
        total_samples: data.length,
        correct_samples: data.filter(p => p.isCorrect).length,
        incorrect_samples: data.filter(p => !p.isCorrect).length
      },
      data: pytorchData
    }, null, 2);
  }

  // Together.ai format
  private static generateTogetherJSONL(data: QAPair[]): string {
    return data
      .map(pair => JSON.stringify({
        text: `<human>: ${pair.user}\n<bot>: ${pair.model}`,
        label: pair.isCorrect,
        metadata: {
          confidence: pair.confidence,
          is_correct: pair.isCorrect
        }
      }))
      .join('\n');
  }

  // OpenAI format
  private static generateOpenAIJSONL(data: QAPair[]): string {
    return data
      .map(pair => JSON.stringify({
        messages: [
          { role: "user", content: pair.user },
          { role: "assistant", content: pair.model }
        ],
        metadata: {
          is_correct: pair.isCorrect,
          confidence: pair.confidence
        }
      }))
      .join('\n');
  }

  // Anthropic format
  private static generateAnthropicJSONL(data: QAPair[]): string {
    return data
      .map(pair => JSON.stringify({
        prompt: `Human: ${pair.user}\n\nAssistant:`,
        completion: ` ${pair.model}`,
        label: pair.isCorrect ? "good" : "bad",
        metadata: {
          confidence: pair.confidence,
          is_correct: pair.isCorrect
        }
      }))
      .join('\n');
  }

  // Hugging Face format
  private static generateHuggingFaceJSON(data: QAPair[]): string {
    const hfData = data.map((pair, index) => ({
      id: index,
      question: pair.user,
      answer: pair.model,
      label: pair.isCorrect ? "CORRECT" : "INCORRECT",
      confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
      split: index < data.length * 0.8 ? "train" : "validation"
    }));

    return JSON.stringify({
      dataset_info: {
        features: {
          id: { dtype: "int32" },
          question: { dtype: "string" },
          answer: { dtype: "string" },
          label: { dtype: "string" },
          confidence: { dtype: "float32" },
          split: { dtype: "string" }
        },
        splits: {
          train: { num_examples: Math.floor(data.length * 0.8) },
          validation: { num_examples: Math.ceil(data.length * 0.2) }
        }
      },
      data: hfData
    }, null, 2);
  }

  private static generateHuggingFaceCSV(data: QAPair[]): string {
    const csvHeader = 'id,question,answer,label,confidence,split\n';
    const csvRows = data
      .map((pair, index) => {
        const split = index < data.length * 0.8 ? "train" : "validation";
        const label = pair.isCorrect ? "CORRECT" : "INCORRECT";
        const confidence = pair.confidence || (pair.isCorrect ? 0.9 : 0.2);
        return `${index},${this.escapeCSVField(pair.user)},${this.escapeCSVField(pair.model)},${label},${confidence},${split}`;
      })
      .join('\n');
    
    return csvHeader + csvRows;
  }

  // Colab/Jupyter format
  private static generateColabJSON(data: QAPair[]): string {
    const colabData = {
      metadata: {
        name: "Fine Format Dataset",
        description: "Q&A dataset for fine-tuning with correct/incorrect labels",
        created_at: new Date().toISOString(),
        total_pairs: data.length,
        correct_pairs: data.filter(p => p.isCorrect).length,
        incorrect_pairs: data.filter(p => !p.isCorrect).length
      },
      config: {
        task_type: "question_answering",
        evaluation_metric: "accuracy",
        train_test_split: 0.8
      },
      dataset: data.map((pair, index) => ({
        id: `qa_${index}`,
        input: pair.user,
        output: pair.model,
        correct: pair.isCorrect,
        confidence_score: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        set: index < data.length * 0.8 ? "train" : "test"
      }))
    };

    return JSON.stringify(colabData, null, 2);
  }

  private static generateColabCSV(data: QAPair[]): string {
    const csvHeader = 'id,input,output,correct,confidence_score,set\n';
    const csvRows = data
      .map((pair, index) => {
        const set = index < data.length * 0.8 ? "train" : "test";
        const confidence = pair.confidence || (pair.isCorrect ? 0.9 : 0.2);
        return `qa_${index},${this.escapeCSVField(pair.user)},${this.escapeCSVField(pair.model)},${pair.isCorrect},${confidence},${set}`;
      })
      .join('\n');
    
    return csvHeader + csvRows;
  }

  // Generic formats
  private static generateGenericCSV(data: QAPair[]): string {
    const csvHeader = 'user_question,model_answer,is_correct,confidence\n';
    const csvRows = data
      .map(pair => `${this.escapeCSVField(pair.user)},${this.escapeCSVField(pair.model)},${pair.isCorrect},${pair.confidence || 0.9}`)
      .join('\n');
    
    return csvHeader + csvRows;
  }

  private static generateGenericJSONL(data: QAPair[]): string {
    return data
      .map(pair => JSON.stringify(this.transformToStandardFormat(pair)))
      .join('\n');
  }

  private static generateGenericJSON(data: QAPair[]): string {
    const transformedData = data.map(pair => this.transformToStandardFormat(pair));
    return JSON.stringify(transformedData, null, 2);
  }

  private static escapeCSVField(field: string): string {
    if (/[",\n\r]/.test(field)) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  private static transformToStandardFormat(pair: QAPair): StandardFormatQAPair {
    return {
      input: {
        messages: [
          {
            role: 'assistant',
            content: 'This Q&A pair is part of a fine-tuning dataset with correct and incorrect examples.',
          },
          {
            role: 'user',
            content: pair.user,
          },
        ],
      },
      preferred_output: pair.isCorrect ? [
        {
          role: 'assistant',
          content: pair.model,
        },
      ] : [],
      non_preferred_output: !pair.isCorrect ? [
        {
          role: 'assistant',
          content: pair.model,
        },
      ] : [],
      metadata: {
        is_correct: pair.isCorrect,
        confidence: pair.confidence,
      },
    };
  }

  private static triggerDownload(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}