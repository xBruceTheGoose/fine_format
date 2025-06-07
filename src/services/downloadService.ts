import { QAPair, StandardFormatQAPair, StandardFormatMessage } from '../types';

export class DownloadService {
  public static downloadAsCSV(data: QAPair[], filename: string): void {
    if (data.length === 0) return;

    const csvHeader = 'user_question,model_answer\n';
    const csvRows = data
      .map(pair => `${this.escapeCSVField(pair.user)},${this.escapeCSVField(pair.model)}`)
      .join('\n');
    
    const csvContent = csvHeader + csvRows;
    this.triggerDownload(csvContent, filename, 'text/csv');
  }

  public static downloadAsJSONL(data: QAPair[], filename: string): void {
    if (data.length === 0) return;

    const jsonlContent = data
      .map(pair => JSON.stringify(this.transformToStandardFormat(pair)))
      .join('\n');

    this.triggerDownload(jsonlContent, filename, 'application/jsonl');
  }

  public static downloadAsJSON(data: QAPair[], filename: string): void {
    if (data.length === 0) return;

    const transformedData = data.map(pair => this.transformToStandardFormat(pair));
    const jsonContent = JSON.stringify(transformedData, null, 2);

    this.triggerDownload(jsonContent, filename, 'application/json');
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
            content: 'This Q&A pair is part of a generated dataset.',
          },
          {
            role: 'user',
            content: pair.user,
          },
        ],
      },
      preferred_output: [
        {
          role: 'assistant',
          content: pair.model,
        },
      ],
      non_preferred_output: [],
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