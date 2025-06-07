import { UrlData } from '../types';

export class UrlService {
  public static async processUrls(urls: string[]): Promise<UrlData[]> {
    const urlPromises = urls.map((url, index) => 
      this.processUrl(url, index)
    );
    
    return Promise.all(urlPromises);
  }

  private static async processUrl(url: string, index: number): Promise<UrlData> {
    const urlId = `url-${Date.now()}-${index}`;
    
    const baseUrlData: UrlData = {
      id: urlId,
      url,
      rawContent: '',
      status: 'fetching',
    };

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return {
        ...baseUrlData,
        status: 'failed',
        error: 'Invalid URL format',
      };
    }

    try {
      // Use a CORS proxy service for fetching URLs
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('No content received from URL');
      }

      // Extract title from HTML if possible
      const titleMatch = data.contents.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : url;

      return {
        ...baseUrlData,
        title,
        rawContent: data.contents,
        status: 'fetched',
      };
    } catch (error) {
      return {
        ...baseUrlData,
        status: 'failed',
        error: `Failed to fetch URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  public static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}