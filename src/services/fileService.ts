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

    // CRITICAL: Much more restrictive size limits for binary files to prevent 502 errors
    const isBinaryFile = SUPPORTED_BINARY_MIME_TYPES.includes(mimeType) || 
                        this.isBinaryFileByExtension(file.name);
    
    // Drastically reduce binary file size limit to prevent Netlify function failures
    const maxSize = isBinaryFile 
      ? 200 * 1024 // 200KB max for binary files (was 8MB)
      : FILE_SIZE_LIMIT; // 5MB for text files

    if (file.size > maxSize) {
      return {
        ...baseFileData,
        status: 'failed',
        error: `File too large (${(file.size / 1024).toFixed(1)}KB). Maximum size is ${maxSize / 1024}KB for ${isBinaryFile ? 'PDF/DOCX' : 'text'} files. Large files cause processing timeouts.`,
      };
    }

    // Check if file type is supported
    const isTextFile = SUPPORTED_TEXT_MIME_TYPES.includes(mimeType) || 
                      this.isTextFileByExtension(file.name);

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
        
        // Validate text content
        if (!content || content.trim().length < 10) {
          return {
            ...baseFileData,
            status: 'failed',
            error: 'File appears to be empty or contains insufficient text content.',
          };
        }

        return {
          ...baseFileData,
          rawContent: content,
          isBinary: false,
          status: 'read',
        };
      } else {
        const content = await this.readAsBase64(file);
        
        // Validate base64 content and size
        if (!content || content.length < 100) {
          return {
            ...baseFileData,
            status: 'failed',
            error: 'File appears to be empty or corrupted.',
          };
        }

        // Additional check for base64 size (this is what gets sent to API)
        if (content.length > 300 * 1024) { // 300KB base64 limit
          return {
            ...baseFileData,
            status: 'failed',
            error: 'File too large for processing. Base64 encoding exceeds API limits.',
          };
        }

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