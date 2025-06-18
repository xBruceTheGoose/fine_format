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
  sourcesProcessed?: number;
  keyUsed?: number;
  error?: string;
  message?: string;
}

class BuildShipService {
  private baseUrl = '/.netlify/functions/buildship-preprocess';

  constructor() {
    console.log('[BUILDSHIP] Service initialized - using Netlify functions');
  }

  public isReady(): boolean {
    // Always ready since we're using Netlify functions
    return true;
  }

  /**
   * Process files and URLs through BuildShip preprocessing workflow
   */
  public async preprocessContent(
    files: FileData[],
    urls: UrlData[],
    onProgress?: (current: number, total: number, item: string) => void
  ): Promise<string[]> {
    console.log('[BUILDSHIP] Starting content preprocessing via Netlify function');
    
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
   * Call the BuildShip endpoint via Netlify function
   */
  private async callBuildShipEndpoint(sources: BuildShipSource[]): Promise<BuildShipResponse> {
    console.log('[BUILDSHIP] Calling Netlify function with', sources.length, 'sources');

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sources: sources
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Netlify function error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      
      if (!result.cleanedTexts) {
        throw new Error('No cleanedTexts received from Netlify function');
      }

      console.log('[BUILDSHIP] Netlify function response received:', {
        cleanedTexts: result.cleanedTexts.length,
        sourcesProcessed: result.sourcesProcessed,
        keyUsed: result.keyUsed
      });

      return result;

    } catch (error: any) {
      console.error('[BUILDSHIP] Netlify function call failed:', error);
      throw new Error(`BuildShip service request failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Test the BuildShip connection with a simple request
   */
  public async testConnection(): Promise<boolean> {
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
      hasApiKey: true, // Always true since API key is handled server-side
      endpoint: this.baseUrl
    };
  }
}

export const buildshipService = new BuildShipService();