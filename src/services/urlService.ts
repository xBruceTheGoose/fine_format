import { UrlData } from '../types';

export class UrlService {
  // Multiple CORS proxy services for fallback
  private static readonly PROXY_SERVICES = [
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  // Simple web scraping patterns for common content
  private static readonly CONTENT_SELECTORS = [
    'article',
    'main',
    '.content',
    '.post-content',
    '.entry-content',
    'p'
  ];

  public static async processUrls(urls: string[]): Promise<UrlData[]> {
    const urlPromises = urls.map((url, index) => 
      this.processUrl(url, index)
    );
    
    return Promise.all(urlPromises);
  }

  private static async processUrl(url: string, index: number): Promise<UrlData> {
    const urlId = `${url}-${Date.now()}-${index}`;

    const baseUrlData: UrlData = {
      id: urlId,
      url,
      rawContent: '',
      status: 'fetching',
    };

    if (!this.isValidUrl(url)) {
      return {
        ...baseUrlData,
        status: 'failed',
        error: 'Invalid URL format. Please use http:// or https://',
      };
    }

    try {
      const content = await this.fetchUrlContent(url);
      
      if (!content || content.trim().length < 10) {
        return {
          ...baseUrlData,
          status: 'failed',
          error: 'URL appears to contain no readable content.',
        };
      }

      return {
        ...baseUrlData,
        rawContent: content,
        title: this.extractTitle(content),
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

  private static async fetchUrlContent(url: string): Promise<string> {
    // Try direct fetch first (will work for CORS-enabled sites)
    try {
      const response = await fetch(url);
      const content = await response.text();
      return this.extractTextContent(content);
    } catch (corsError) {
      // Fallback to proxy service
      try {
        const proxyUrl = `${this.PROXY_SERVICES[0]}${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        return this.extractTextContent(data.contents);
      } catch (proxyError) {
        throw new Error('Unable to fetch URL content due to CORS restrictions');
      }
    }
  }

  private static extractTextContent(html: string): string {
    // Parse HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract main content using selectors
    let mainContent = '';
    for (const selector of this.CONTENT_SELECTORS) {
      const element = doc.querySelector(selector);
      if (element && element.textContent && element.textContent.length > 100) {
        mainContent = element.textContent;
        break;
      }
    }

    // Fallback to body text if no main content found
    if (!mainContent) {
      mainContent = doc.body?.textContent || html;
    }

    return this.cleanText(mainContent);
  }

  private static extractTitle(content: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    return doc.querySelector('title')?.textContent || 
           doc.querySelector('h1')?.textContent || 
           'Untitled';
  }

  private static cleanText(text: string): string {
    return text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters but keep basic punctuation
      .replace(/[^\w\s.,!?;:()\-"']/g, '')
      // Remove multiple consecutive punctuation
      .replace(/[.,!?;:]{2,}/g, '.')
      // Trim and remove empty lines
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n')
      .trim();
  }
}