import { FileData } from '../types';
import { SUPPORTED_TEXT_MIME_TYPES, SUPPORTED_BINARY_MIME_TYPES, FILE_SIZE_LIMIT } from '../constants';

export class FileService {
  public static async processFiles(files: FileList): Promise<FileData[]> {
    const filePromises = Array.from(files).map((file, index) => 
      this.processFile(file, index)
    );
    
    return Promise.all(filePromises);
  }

  private static async processFile(file: File, index: number): Promise<FileData> {
    const fileId = `${file.name}-${file.lastModified}-${Date.now()}-${index}`;
    const mimeType = file.type || 'application/octet-stream';

    const baseFileData: FileData = {
      id: fileId,
      file,
      mimeType,
      rawContent: '',
      isBinary: false,
      status: 'reading',
    };

    // Check file size
    if (file.size > FILE_SIZE_LIMIT) {
      return {
        ...baseFileData,
        status: 'failed',
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is ${FILE_SIZE_LIMIT / 1024 / 1024}MB.`,
      };
    }

    // Check if file type is supported
    const isTextFile = SUPPORTED_TEXT_MIME_TYPES.includes(mimeType) || 
                      this.isTextFileByExtension(file.name);
    const isBinaryFile = SUPPORTED_BINARY_MIME_TYPES.includes(mimeType) || 
                        this.isBinaryFileByExtension(file.name);

    if (!isTextFile && !isBinaryFile) {
      return {
        ...baseFileData,
        status: 'failed',
        error: `Unsupported file type: ${mimeType || file.name}. Supported: .txt, .md, .html, .jsonl, .pdf, .docx`,
      };
    }

    try {
      if (isTextFile) {
        const content = await this.readAsText(file);
        return {
          ...baseFileData,
          rawContent: content,
          isBinary: false,
          status: 'read',
        };
      } else {
        const content = await this.readAsBase64(file);
        return {
          ...baseFileData,
          rawContent: content,
          isBinary: true,
          status: 'read',
        };
      }
    } catch (error) {
      return {
        ...baseFileData,
        status: 'failed',
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private static isTextFileByExtension(fileName: string): boolean {
    const extension = fileName.toLowerCase().split('.').pop();
    return ['txt', 'md', 'html', 'jsonl'].includes(extension || '');
  }

  private static isBinaryFileByExtension(fileName: string): boolean {
    const extension = fileName.toLowerCase().split('.').pop();
    return ['pdf', 'docx'].includes(extension || '');
  }

  private static readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file as text'));
      reader.readAsText(file);
    });
  }

  private static readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = () => reject(new Error('Failed to read file as base64'));
      reader.readAsDataURL(file);
    });
  }
}