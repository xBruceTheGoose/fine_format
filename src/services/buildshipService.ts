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
  error?: string;
  message?: string;
}

class BuildShipService {
  private baseUrl = '/.netlify/functions/buildship-preprocess';

  constructor() {
    console.log('[BUILDSHIP] Service initialized - using multiFormatContentCleaner workflow');
  }

  public isReady(): boolean {
    // Always ready since we're using Netlify functions with embedded API key
    return true;
  }

  /**
   * Process files and URLs through BuildShip multiFormatContentCleaner workflow
   */
  public async preprocessContent(
    files: FileData[],
    urls: UrlData[],
    onProgress?: (current: number, total: number, item: string) => void
  ): Promise<string[]> {
    console.log('[BUILDSHIP] Starting content preprocessing via multiFormatContentCleaner workflow');
    
    // Validate inputs
    const readyFiles = files.filter(f => f.status === 'read' && f.rawContent.trim());
    const readyUrls = urls.filter(u => u.status === 'fetched' && u.rawContent.trim());
    
    if (readyFiles.length === 0 && readyUrls.length === 0) {
      throw new Error('No valid files or URLs ready for preprocessing.');
    }

    // Prepare sources for BuildShip multiFormatContentCleaner
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

    console.log(`[BUILDSHIP] Prepared ${sources.length} sources for multiFormatContentCleaner workflow`);

    try {
      if (onProgress) {
        onProgress(sources.length, sources.length, 'Sending to BuildShip multiFormatContentCleaner...');
      }

      const result = await this.callBuildShipWorkflow(sources);
      
      if (!result.cleanedTexts || !Array.isArray(result.cleanedTexts)) {
        throw new Error('Invalid response format from BuildShip multiFormatContentCleaner. Expected cleanedTexts array.');
      }

      // Validate cleaned texts
      const validCleanedTexts = result.cleanedTexts.filter(text => 
        typeof text === 'string' && text.trim().length > 50
      );

      if (validCleanedTexts.length === 0) {
        throw new Error('No valid cleaned text content received from BuildShip multiFormatContentCleaner workflow.');
      }

      console.log(`[BUILDSHIP] Successfully preprocessed ${validCleanedTexts.length} sources via multiFormatContentCleaner`);
      console.log(`[BUILDSHIP] Total cleaned content length: ${validCleanedTexts.reduce((sum, text) => sum + text.length, 0)} characters`);

      return validCleanedTexts;

    } catch (error: any) {
      console.error('[BUILDSHIP] multiFormatContentCleaner preprocessing failed:', error);
      throw new Error(`BuildShip multiFormatContentCleaner preprocessing failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Call the BuildShip multiFormatContentCleaner workflow via Netlify function
   */
  private async callBuildShipWorkflow(sources: BuildShipSource[]): Promise<BuildShipResponse> {
    console.log('[BUILDSHIP] Calling multiFormatContentCleaner workflow via Netlify function with', sources.length, 'sources');

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
        throw new Error('No cleanedTexts received from multiFormatContentCleaner workflow');
      }

      console.log('[BUILDSHIP] multiFormatContentCleaner workflow response received:', {
        cleanedTexts: result.cleanedTexts.length,
        sourcesProcessed: result.sourcesProcessed
      });

      return result;

    } catch (error: any) {
      console.error('[BUILDSHIP] multiFormatContentCleaner workflow call failed:', error);
      throw new Error(`BuildShip multiFormatContentCleaner workflow request failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Test the BuildShip multiFormatContentCleaner workflow connection
   */
  public async testConnection(): Promise<boolean> {
    try {
      const testSources: BuildShipSource[] = [{
        type: 'file',
        content: 'This is a test content for BuildShip multiFormatContentCleaner workflow connection.',
        metadata: {
          name: 'test.txt',
          mimeType: 'text/plain',
          isBinary: false
        }
      }];

      const result = await this.callBuildShipWorkflow(testSources);
      return !!(result.cleanedTexts && Array.isArray(result.cleanedTexts));

    } catch (error) {
      console.error('[BUILDSHIP] multiFormatContentCleaner connection test failed:', error);
      return false;
    }
  }

  /**
   * Get service status information
   */
  public getStatus(): { ready: boolean; hasApiKey: boolean; endpoint: string; workflow: string } {
    return {
      ready: this.isReady(),
      hasApiKey: true, // Always true since API key is handled server-side
      endpoint: this.baseUrl,
      workflow: 'multiFormatContentCleaner'
    };
  }
}

export const buildshipService = new BuildShipService();