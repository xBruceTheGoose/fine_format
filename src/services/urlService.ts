import { UrlData } from '../types';

export class UrlService {
  // Multiple CORS proxy services for fallback
  private static readonly PROXY_SERVICES = [
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
    'https://cors-anywhere.herokuapp.com/',
    'https://thingproxy.freeboard.io/fetch/',
    'https://api.codetabs.com/v1/proxy?quest='
  ];

  // Simple web scraping patterns for common content
  private static readonly CONTENT_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    'p'
  ];

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

    // Try multiple fallback strategies
    const strategies = [
      () => this.fetchWithAllOrigins(url),
      () => this.fetchWithCorsProxy(url),
      () => this.fetchWithThingProxy(url),
      () => this.fetchWithCodeTabs(url),
      () => this.fetchDirect(url), // Last resort - might fail due to CORS
    ];

    let lastError = '';
    
    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result.content && result.content.trim().length > 100) {
          return {
            ...baseUrlData,
            title: result.title || this.extractDomainFromUrl(url),
            rawContent: result.content,
            status: 'fetched',
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`URL fetch strategy failed for ${url}:`, lastError);
        continue;
      }
    }

    return {
      ...baseUrlData,
      status: 'failed',
      error: `All fetch strategies failed. Last error: ${lastError}`,
    };
  }

  private static async fetchWithAllOrigins(url: string): Promise<{ content: string; title?: string }> {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`AllOrigins HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.contents) {
      throw new Error('No content received from AllOrigins');
    }

    const { content, title } = this.extractContentFromHtml(data.contents);
    return { content, title };
  }

  private static async fetchWithCorsProxy(url: string): Promise<{ content: string; title?: string }> {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; FineFormat/1.0)',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      throw new Error(`CorsProxy HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const { content, title } = this.extractContentFromHtml(html);
    return { content, title };
  }

  private static async fetchWithThingProxy(url: string): Promise<{ content: string; title?: string }> {
    const proxyUrl = `https://thingproxy.freeboard.io/fetch/${url}`;
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      throw new Error(`ThingProxy HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const { content, title } = this.extractContentFromHtml(html);
    return { content, title };
  }

  private static async fetchWithCodeTabs(url: string): Promise<{ content: string; title?: string }> {
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      throw new Error(`CodeTabs HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const { content, title } = this.extractContentFromHtml(html);
    return { content, title };
  }

  private static async fetchDirect(url: string): Promise<{ content: string; title?: string }> {
    // This will likely fail due to CORS, but worth trying as last resort
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      throw new Error(`Direct fetch HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const { content, title } = this.extractContentFromHtml(html);
    return { content, title };
  }

  private static extractContentFromHtml(html: string): { content: string; title?: string } {
    // Create a temporary DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract title
    const titleElement = doc.querySelector('title');
    const title = titleElement?.textContent?.trim() || '';

    // Try to extract main content using various selectors
    let content = '';
    
    for (const selector of this.CONTENT_SELECTORS) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        const extractedText = Array.from(elements)
          .map(el => el.textContent?.trim() || '')
          .filter(text => text.length > 50) // Filter out short snippets
          .join('\n\n');
        
        if (extractedText.length > content.length) {
          content = extractedText;
        }
      }
    }

    // Fallback: extract all paragraph text
    if (content.length < 200) {
      const paragraphs = doc.querySelectorAll('p');
      content = Array.from(paragraphs)
        .map(p => p.textContent?.trim() || '')
        .filter(text => text.length > 20)
        .join('\n\n');
    }

    // Final fallback: get all text content
    if (content.length < 100) {
      content = doc.body?.textContent?.trim() || '';
    }

    // Clean up the content
    content = this.cleanExtractedContent(content);

    return { content, title };
  }

  private static cleanExtractedContent(content: string): string {
    return content
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove multiple newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Remove common navigation/footer text patterns
      .replace(/\b(Home|About|Contact|Privacy|Terms|Cookie|Menu|Navigation|Footer|Header)\b/gi, '')
      // Remove social media patterns
      .replace(/\b(Share|Tweet|Like|Follow|Subscribe)\b/gi, '')
      // Remove advertisement patterns
      .replace(/\b(Advertisement|Sponsored|Ad)\b/gi, '')
      // Trim and normalize
      .trim();
  }

  private static extractDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
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

  // Enhanced URL processing with retry logic
  public static async processUrlWithRetry(url: string, maxRetries: number = 3): Promise<UrlData> {
    let lastError = '';
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.processUrl(url, 0);
        if (result.status === 'fetched') {
          return result;
        }
        lastError = result.error || 'Unknown error';
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
      }
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return {
      id: `url-${Date.now()}-retry`,
      url,
      rawContent: '',
      status: 'failed',
      error: `Failed after ${maxRetries} attempts. Last error: ${lastError}`,
    };
  }
}