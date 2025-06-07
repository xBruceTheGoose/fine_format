import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import { QAPair, GroundingMetadata } from '../types';
import { GEMINI_MODEL, QA_PAIR_COUNT_TARGET } from '../constants';

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = import.meta.env.VITE_API_KEY;
    
    if (!apiKey?.trim()) {
      console.error('Gemini API key not found in environment variables');
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize GoogleGenAI:', error);
      this.isInitialized = false;
    }
  }

  public isReady(): boolean {
    return this.isInitialized && this.ai !== null;
  }

  private parseJsonResponse(responseText: string): any {
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      throw new Error(`Invalid JSON response from Gemini: ${responseText.substring(0, 200)}...`);
    }
  }

  public async cleanTextContent(
    textContent: string,
    fileName: string
  ): Promise<string> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const prompt = `
Clean the following text content from "${fileName}":

1. Remove advertisements, navigation elements, headers, footers
2. Remove non-essential formatting and syntax
3. Preserve only the core textual information
4. Return clean, readable plain text
5. Do not add commentary or explanations

Content:
${textContent}
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      return response.text?.trim() || '';
    } catch (error: any) {
      throw new Error(`Text cleaning failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async cleanBinaryContent(
    base64Data: string,
    mimeType: string,
    fileName: string
  ): Promise<string> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const userParts: Part[] = [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      {
        text: `
Extract clean text content from this file: "${fileName}" (${mimeType})

Requirements:
- Extract all relevant textual content
- Ignore images, complex layouts, advertisements
- Remove headers, footers, and stylistic elements
- Return only clean, plain text
- If no text found, return empty string

Do not add commentary or explanations.
        `.trim(),
      },
    ];

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: userParts }],
      });

      return response.text?.trim() || '';
    } catch (error: any) {
      throw new Error(`Binary content cleaning failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async augmentWithWebSearch(
    originalContent: string
  ): Promise<{ augmentedText: string; groundingMetadata?: GroundingMetadata }> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const prompt = `
You are a content augmentation expert. Your task:

1. Analyze the core themes and topics in the provided text
2. Use Google Search to find relevant, factual, up-to-date information
3. Integrate web-sourced information with the original text
4. Create a comprehensive, coherent narrative
5. Focus on enhancing value while maintaining original themes

Return ONLY the augmented text without commentary.

Original Text:
---
${originalContent}
---
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const augmentedText = response.text?.trim() || originalContent;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata as GroundingMetadata;

      return { augmentedText, groundingMetadata };
    } catch (error: any) {
      throw new Error(`Web augmentation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async generateQAPairs(content: string): Promise<QAPair[]> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    if (content.length < 100) {
      throw new Error('Content too short for Q&A generation (minimum 100 characters)');
    }

    const prompt = `
Generate ${QA_PAIR_COUNT_TARGET} high-quality question-answer pairs from the provided text.

Requirements:
- Questions should be natural user queries answerable from the text
- Answers must be factual and directly derived from the content
- Avoid self-referential phrases like "according to the text" or "based on the document"
- Vary question types (factual, conceptual, analytical)
- Ensure answers are complete and informative

Format as valid JSON array with objects containing "user" and "model" keys.

Example: [{"user": "What is the main topic?", "model": "The main topic is..."}]

Text:
---
${content}
---

JSON Output:
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const qaData = this.parseJsonResponse(response.text);

      if (!Array.isArray(qaData)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validPairs = qaData.filter(
        (item): item is QAPair =>
          item &&
          typeof item.user === 'string' &&
          typeof item.model === 'string' &&
          item.user.trim().length > 0 &&
          item.model.trim().length > 0
      );

      return validPairs;
    } catch (error: any) {
      throw new Error(`Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }
}

export const geminiService = new GeminiService();