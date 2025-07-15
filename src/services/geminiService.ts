import type { QAPair, FineTuningGoal } from '../types';

class GeminiService {
  private isInitialized = false;
  private baseUrl = '/.netlify/functions/gemini-chat';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // API key will be handled by the Netlify function
    this.isInitialized = true;
    console.log('[GEMINI] Service initialized - using Netlify function proxy');
  }

  public isReady(): boolean {
    return this.isInitialized;
  }

  private async makeRequest(
    messages: Array<{ role: string; parts: Array<{ text?: string; inlineData?: any }> }>,
    temperature = 0.7,
    maxTokens = 2000,
    tools?: any
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Gemini service not initialized');
    }

    console.log('[GEMINI] Making API request with', messages.length, 'messages, max tokens:', maxTokens);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens: maxTokens,
          tools,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.content) {
        throw new Error('Invalid response from Gemini API');
      }

      console.log('[GEMINI] Request successful, response length:', data.content.length);
      return data.content;
    } catch (error) {
      console.error('[GEMINI] Request failed:', error);
      throw error;
    }
  }

  async identifyThemes(content: Array<{type: 'file' | 'url', name?: string, url?: string, content: string}>, goal: FineTuningGoal): Promise<string[]> {
    const prompt = `Analyze the following content and identify key themes for ${goal} fine-tuning:

${content.map(c => `${c.type === 'file' ? `File: ${c.name}` : `URL: ${c.url}`}\n${c.content.substring(0, 2000)}`).join('\n\n')}

Return a JSON array of theme names (strings only).`;

    try {
      const response = await this.makeRequest([{
        role: 'user',
        parts: [{ text: prompt }]
      }]);

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error identifying themes:', error);
    }

    return [];
  }

  async generateQAPairs(content: Array<{type: 'file' | 'url', name?: string, url?: string, content: string}>, themes: string[], goal: FineTuningGoal): Promise<any[]> {
    const prompt = `Generate high-quality question-answer pairs from this content for ${goal} fine-tuning:

Content:
${content.map(c => c.content.substring(0, 1500)).join('\n\n')}

Themes to focus on:
${themes.join(', ')}

Generate 10-15 diverse Q&A pairs. Return JSON array with: user (question), model (answer), isCorrect (always true).`;

    try {
      const response = await this.makeRequest([{
        role: 'user',
        parts: [{ text: prompt }]
      }]);

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const pairs = JSON.parse(jsonMatch[0]);
        return pairs.map((pair: any) => ({
          question: pair.user || pair.question,
          answer: pair.model || pair.answer,
          isCorrect: true,
          confidence: 0.9,
          source: 'original'
        }));
      }
    } catch (error) {
      console.error('Error generating Q&A pairs:', error);
    }

    return [];
  }

  async validateQAPairs(pairs: QAPair[]): Promise<any[]> {
    // Mock validation
    return pairs.map(() => ({
      pairId: undefined,
      isValid: Math.random() > 0.1,
      confidence: Math.random() * 0.2 + 0.8,
      factualAccuracy: Math.random() * 0.1 + 0.9,
    }));
  }
}

export const geminiService = new GeminiService();