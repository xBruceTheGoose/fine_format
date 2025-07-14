import type { ProcessedData } from '../types';

class DownloadService {
  downloadDataset(data: ProcessedData) {
    // Create different format options
    const formats = {
      jsonl: this.createJSONL(data),
      csv: this.createCSV(data),
      json: this.createJSON(data)
    };

    // Download all formats
    Object.entries(formats).forEach(([format, content]) => {
      this.downloadFile(content, `dataset.${format}`, this.getMimeType(format));
    });
  }

  private createJSONL(data: ProcessedData): string {
    const lines: string[] = [];
    
    // Add original Q&A pairs
    data.qaPairs.forEach(pair => {
      lines.push(JSON.stringify({
        messages: [
          { role: 'user', content: pair.user },
          { role: 'assistant', content: pair.model }
        ],
        metadata: {
          difficulty: pair.difficulty,
          category: pair.category,
          source: pair.source,
          isCorrect: pair.isCorrect
        }
      }));
    });

    // Add synthetic pairs
    data.syntheticPairs?.forEach(pair => {
      lines.push(JSON.stringify({
        messages: [
          { role: 'user', content: pair.user },
          { role: 'assistant', content: pair.model }
        ],
        metadata: {
          difficulty: pair.difficulty,
          category: pair.category,
          source: pair.source,
          isCorrect: pair.isCorrect,
          synthetic: true
        }
      }));
    });

    return lines.join('\n');
  }

  private createCSV(data: ProcessedData): string {
    const headers = ['question', 'answer', 'difficulty', 'category', 'source', 'is_correct', 'is_synthetic'];
    const rows = [headers.join(',')];

    // Add original pairs
    data.qaPairs.forEach(pair => {
      rows.push([
        this.escapeCSV(pair.user),
        this.escapeCSV(pair.model),
        pair.difficulty || '',
        pair.category || '',
        pair.source || '',
        pair.isCorrect.toString(),
        'false'
      ].join(','));
    });

    // Add synthetic pairs
    data.syntheticPairs?.forEach(pair => {
      rows.push([
        this.escapeCSV(pair.user),
        this.escapeCSV(pair.model),
        pair.difficulty || '',
        pair.category || '',
        pair.source || '',
        pair.isCorrect.toString(),
        'true'
      ].join(','));
    });

    return rows.join('\n');
  }

  private createJSON(data: ProcessedData): string {
    return JSON.stringify(data, null, 2);
  }

  private escapeCSV(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private getMimeType(format: string): string {
    const mimeTypes = {
      jsonl: 'application/jsonl',
      csv: 'text/csv',
      json: 'application/json'
    };
    return mimeTypes[format as keyof typeof mimeTypes] || 'text/plain';
  }

  private downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const downloadService = new DownloadService();