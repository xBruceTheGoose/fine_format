export class UrlService {
  // Multiple CORS proxy services for fallback
  private readonly PROXY_SERVICES = [
    'https://api.allorigins.win/get?url=',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/'
  ];

  // Simple web scraping patterns for common content
  private readonly CONTENT_SELECTORS = [
    'article',
    'main',
    '.content',
    '.post-content',
    '.entry-content',
    'p'
  ];

  async fetchUrlContent(url: string): Promise<{
    title: string;
    rawContent: string;
    cleanedText: string;
    metadata: {
      url: string;
      fetchedAt: string;
      contentLength: number;
      domain: string;
    };
  }> {
    try {
      // Try direct fetch first (will work for CORS-enabled sites)
      let response: Response;
      let content: string;

      try {
        response = await fetch(url);
        content = await response.text();
      } catch (corsError) {
        // Fallback to proxy service
        const proxyUrl = `${this.PROXY_SERVICES[0]}${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
        const data = await response.json();
        content = data.contents;
      }

      // Parse HTML content
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');

      // Extract title
      const title = doc.querySelector('title')?.textContent || 
                   doc.querySelector('h1')?.textContent || 
                   'Untitled';

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
        mainContent = doc.body?.textContent || content;
      }

      // Clean the text
      const cleanedText = this.cleanText(mainContent);

      return {
        title: title.trim(),
        rawContent: content,
        cleanedText,
        metadata: {
          url,
          fetchedAt: new Date().toISOString(),
          contentLength: cleanedText.length,
          domain: new URL(url).hostname
        }
      };
    } catch (error) {
      throw new Error(`Failed to fetch URL content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private cleanText(text: string): string {
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

  validateUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }
}

export const urlService = new UrlService();