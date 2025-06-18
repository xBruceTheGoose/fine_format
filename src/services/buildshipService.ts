import { FileData, UrlData } from '../types';

interface BuildShipSource {
  type: 'file' | 'url';
  content: string;
  metadata: {
    name: string;
    mimeType?: string;
    isBinary?: boolean;
    url?: string;
  };
}

interface BuildShipResponse {
  cleanedTexts?: string[];
  error?: string;
  message?: string;
}

class BuildShipService {
  private readonly endpoint = 'https://hiqtqy.buildship.run/executeWorkflow/D4xRme6b2N2vus1EeTNX/dd746df2-b48b-4b8a-9b63-7347c80ceeda';
  private readonly apiKey: string;

  constructor() {
    // Get API key from environment variables
    this.apiKey = import.meta.env.VITE_BUILDSHIP_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('[BUILDSHIP] API key not found. Set VITE_BUILDSHIP_API_KEY in your environment variables.');
    }
  }

  public isReady(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  /**
   * Process files and URLs through BuildShip preprocessing workflow
   */
  public async preprocessContent(
    files: FileData[],
    urls: UrlData[],
    onProgress?: (current: number, total: number, item: string) => void
  ): Promise<string[]> {
    console.log('[BUILDSHIP] Starting content preprocessing');
    
    if (!this.isReady()) {
      throw new Error('BuildShip service not ready. Please check API key configuration.');
    }

    // Validate inputs
    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    const readyUrls = urls.filter(u => u.status === 'fetched' && u.rawContent.trim());
    
    if (readyFiles.length === 0 && readyUrls.length === 0) {
      throw new Error('No valid files or URLs ready for preprocessing.');
    }

    // Prepare sources for BuildShip
    const sources: BuildShipSource[] = [];
    
    // Add files
    readyFiles.forEach((file, index) => {
      if (onProgress) {
        onProgress(index, readyFiles.length + readyUrls.length, `Preparing file: ${file.file.name}`);
      }
      
      sources.push({
        type: 'file',
        content: file.rawContent,
        metadata: {
          name: file.file.name,
          mimeType: file.mimeType,
          isBinary: file.isBinary
        }
      });
    });

    // Add URLs
    readyUrls.forEach((url, index) => {
      if (onProgress) {
        onProgress(readyFiles.length + index, readyFiles.length + readyUrls.length, `Preparing URL: ${url.title || url.url}`);
      }
      
      sources.push({
        type: 'url',
        content: url.rawContent,
        metadata: {
          name: url.title || url.url,
          url: url.url
        }
      });
    });

    console.log(`[BUILDSHIP] Prepared ${sources.length} sources for preprocessing`);

    try {
      if (onProgress) {
        onProgress(sources.length, sources.length, 'Sending to BuildShip for preprocessing...');
      }

      const result = await this.callBuildShipEndpoint(sources);
      
      if (!result.cleanedTexts || !Array.isArray(result.cleanedTexts)) {
        throw new Error('Invalid response format from BuildShip. Expected cleanedTexts array.');
      }

      // Validate cleaned texts
      const validCleanedTexts = result.cleanedTexts.filter(text => 
        typeof text === 'string' && text.trim().length > 50
      );

      if (validCleanedTexts.length === 0) {
        throw new Error('No valid cleaned text content received from BuildShip preprocessing.');
      }

      console.log(`[BUILDSHIP] Successfully preprocessed ${validCleanedTexts.length} sources`);
      console.log(`[BUILDSHIP] Total cleaned content length: ${validCleanedTexts.reduce((sum, text) => sum + text.length, 0)} characters`);

      return validCleanedTexts;

    } catch (error: any) {
      console.error('[BUILDSHIP] Preprocessing failed:', error);
      throw new Error(`BuildShip preprocessing failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Call the BuildShip endpoint with proper error handling
   */
  private async callBuildShipEndpoint(sources: BuildShipSource[]): Promise<BuildShipResponse> {
    console.log('[BUILDSHIP] Calling endpoint with', sources.length, 'sources');

    const requestBody = {
      sources: sources
    };

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'BUILDSHIP_API_KEY': this.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(120000) // 2 minute timeout for preprocessing
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = await response.json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message;
          }
        } catch {
          // If we can't parse error JSON, use the HTTP status
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[BUILDSHIP] Endpoint response received');

      // Handle different response formats
      if (result.error) {
        throw new Error(result.error);
      }

      return result;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('BuildShip preprocessing timed out. Please try with smaller files or fewer sources.');
      }
      
      throw error;
    }
  }

  /**
   * Test the BuildShip connection with a simple request
   */
  public async testConnection(): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }

    try {
      const testSources: BuildShipSource[] = [{
        type: 'file',
        content: 'This is a test content for BuildShip connection.',
        metadata: {
          name: 'test.txt',
          mimeType: 'text/plain',
          isBinary: false
        }
      }];

      const result = await this.callBuildShipEndpoint(testSources);
      return !!(result.cleanedTexts && Array.isArray(result.cleanedTexts));

    } catch (error) {
      console.error('[BUILDSHIP] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get service status information
   */
  public getStatus(): { ready: boolean; hasApiKey: boolean; endpoint: string } {
    return {
      ready: this.isReady(),
      hasApiKey: !!this.apiKey,
      endpoint: this.endpoint
    };
  }
}

export const buildshipService = new BuildShipService();