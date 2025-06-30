import { QAPair, GroundingMetadata, FineTuningGoal, KnowledgeGap } from '../types';
import { FINE_TUNING_GOALS, INCORRECT_ANSWER_RATIO } from '../constants';

class GeminiService {
  private baseUrl = '/.netlify/functions/gemini-chat';

  constructor() {
    console.log('[GEMINI] Service initialized - using Netlify functions');
  }

  public isReady(): boolean {
    return true;
  }

  private async makeRequest(
    messages: Array<{ role: string; content?: string; parts?: any[] }>,
    temperature = 0.7,
    maxTokens = 4000,
    tools?: any,
    config?: any
  ): Promise<{ content: string; groundingMetadata?: GroundingMetadata; truncated?: boolean }> {
    console.log('[GEMINI] Making request to Netlify function');

    // Comprehensive input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    // Validate each message
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || typeof msg !== 'object') {
        throw new Error(`Message ${i} is not a valid object`);
      }
      if (!msg.role) {
        throw new Error(`Message ${i} missing role`);
      }
      if (!msg.content && !msg.parts) {
        throw new Error(`Message ${i} missing content or parts`);
      }
    }

    // Validate and sanitize parameters
    const validatedTemperature = typeof temperature === 'number' && !isNaN(temperature) 
      ? Math.max(0, Math.min(1, temperature)) 
      : 0.7;

    const validatedMaxTokens = typeof maxTokens === 'number' && !isNaN(maxTokens)
      ? Math.min(Math.max(1, Math.floor(maxTokens)), 8000)
      : 4000;

    console.log('[GEMINI] Validated parameters:', {
      originalTemperature: temperature,
      validatedTemperature,
      originalMaxTokens: maxTokens,
      validatedMaxTokens,
      messageCount: messages.length
    });

    try {
      console.log('[GEMINI] Sending request with', messages.length, 'messages');
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          temperature: validatedTemperature,
          max_tokens: validatedMaxTokens,
          tools,
          config
        }),
      });

      console.log('[GEMINI] Response status:', response.status);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          console.error('[GEMINI] Failed to parse error response:', parseError);
          errorData = { error: 'Failed to parse error response', type: 'PARSE_ERROR' };
        }
        
        console.error('[GEMINI] Netlify function error:', response.status, errorData);
        
        // Handle specific error types with user-friendly messages
        if (errorData.type === 'TIMEOUT_ERROR') {
          throw new Error('Request timed out - content may be too large. Try using smaller content or files.');
        } else if (errorData.type === 'QUOTA_EXCEEDED') {
          throw new Error('API quota exceeded - please try again later.');
        } else if (errorData.type === 'PAYLOAD_TOO_LARGE') {
          throw new Error('Content too large for processing. Please use smaller files.');
        } else if (errorData.type === 'SERVICE_UNAVAILABLE') {
          throw new Error('Gemini API service is temporarily unavailable. Please try again.');
        } else if (errorData.type === 'AUTH_ERROR') {
          throw new Error('API authentication failed. Please check your API key configuration.');
        } else if (errorData.type === 'INVALID_REQUEST') {
          throw new Error('Invalid request format. Please check your input.');
        } else if (errorData.type === 'SAFETY_FILTER') {
          throw new Error('Content was blocked by safety filters. Please modify your content.');
        }
        
        throw new Error(`Netlify function error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('[GEMINI] Failed to parse response JSON:', parseError);
        throw new Error('Failed to parse response from Gemini service');
      }
      
      if (!data.content) {
        console.error('[GEMINI] No content in response:', data);
        throw new Error('No content received from Gemini service');
      }

      console.log('[GEMINI] Request successful, response length:', data.content.length);
      
      if (data.truncated) {
        console.warn('[GEMINI] ⚠️ Response was truncated due to token limit');
      }

      return {
        content: data.content,
        groundingMetadata: data.candidates?.[0]?.groundingMetadata,
        truncated: data.truncated
      };

    } catch (error: any) {
      console.error('[GEMINI] Request failed:', error);
      
      // Re-throw with more context if it's a network error
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error - unable to connect to Gemini service. Please check your connection.');
      }
      
      // Re-throw with original message if it's already a user-friendly error
      if (error.message.includes('timed out') || 
          error.message.includes('quota') || 
          error.message.includes('too large') ||
          error.message.includes('unavailable') ||
          error.message.includes('authentication') ||
          error.message.includes('safety filters')) {
        throw error;
      }
      
      throw new Error(`Gemini service request failed: ${error.message || 'Unknown error'}`);
    }
  }

  private parseJsonResponse(responseText: string): any {
    console.log('[GEMINI] Parsing JSON response, length:', responseText.length);
    
    if (!responseText || responseText.trim().length === 0) {
      throw new Error('Empty response received from Gemini service');
    }
    
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
      console.log('[GEMINI] Removed code fences from response');
    }

    // Enhanced JSON extraction with multiple strategies
    return this.parseWithMultipleStrategies(jsonStr, responseText);
  }

  private parseWithMultipleStrategies(jsonStr: string, originalResponse: string): any {
    // Strategy 1: Direct parsing
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[GEMINI] ✅ Direct parsing successful with', parsed.length, 'items');
        return parsed;
      }
    } catch (error) {
      console.warn('[GEMINI] Direct parsing failed:', error.message);
    }

    // Strategy 2: Extract JSON array boundaries
    try {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const extracted = arrayMatch[0];
        const parsed = JSON.parse(extracted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[GEMINI] ✅ Array extraction successful with', parsed.length, 'items');
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[GEMINI] Array extraction failed:', error.message);
    }

    // Strategy 3: Fix common JSON issues and retry
    try {
      const fixedJson = this.fixCommonJsonIssues(jsonStr);
      const parsed = JSON.parse(fixedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[GEMINI] ✅ Fixed JSON parsing successful with', parsed.length, 'items');
        return parsed;
      }
    } catch (error) {
      console.warn('[GEMINI] Fixed JSON parsing failed:', error.message);
    }

    // Strategy 4: Extract individual objects
    try {
      const extractedObjects = this.extractIndividualObjects(originalResponse);
      if (extractedObjects.length > 0) {
        console.log('[GEMINI] ✅ Object extraction successful with', extractedObjects.length, 'items');
        return extractedObjects;
      }
    } catch (error) {
      console.warn('[GEMINI] Object extraction failed:', error.message);
    }

    // Strategy 5: Partial recovery from truncated response
    try {
      const partialObjects = this.recoverPartialResponse(originalResponse);
      if (partialObjects.length > 0) {
        console.log('[GEMINI] ⚠️ Partial recovery successful with', partialObjects.length, 'items');
        return partialObjects;
      }
    } catch (error) {
      console.warn('[GEMINI] Partial recovery failed:', error.message);
    }

    // All strategies failed
    console.error('[GEMINI] ❌ All parsing strategies failed');
    console.error('[GEMINI] Response length:', originalResponse.length);
    console.error('[GEMINI] First 500 chars of failed response:', originalResponse.substring(0, 500));
    console.error('[GEMINI] Last 500 chars of failed response:', originalResponse.substring(Math.max(0, originalResponse.length - 500)));
    
    if (originalResponse.trim().startsWith('<')) {
      console.error('[GEMINI] Critical: Response appears to be HTML/XML, not JSON. This indicates a server-side error.');
      throw new Error('Received HTML response instead of JSON. This indicates a server configuration issue.');
    }
    
    throw new Error(`Failed to parse JSON response after all recovery attempts. Response length: ${originalResponse.length}`);
  }

  private fixCommonJsonIssues(jsonStr: string): string {
    return jsonStr
      // Remove trailing commas
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix unescaped quotes in strings (basic fix)
      .replace(/(?<!\\)"/g, '\\"')
      .replace(/\\\\"/g, '\\"')
      // Fix incomplete objects at the end
      .replace(/,\s*$/, '')
      // Ensure proper array closure
      .replace(/}\s*$/, '}]')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '');
  }

  private extractIndividualObjects(text: string): any[] {
    console.log('[GEMINI] Extracting individual JSON objects');
    
    // Enhanced regex to match complete JSON objects
    const objectPattern = /\{\s*"user"\s*:\s*"[^"]*(?:\\.[^"]*)*"\s*,\s*"model"\s*:\s*"[^"]*(?:\\.[^"]*)*"\s*,\s*"isCorrect"\s*:\s*(?:true|false)\s*(?:,\s*"confidence"\s*:\s*[\d.]+)?\s*\}/g;
    
    const matches = text.match(objectPattern) || [];
    console.log('[GEMINI] Found', matches.length, 'potential objects');
    
    const validObjects = [];
    for (const match of matches) {
      try {
        const obj = JSON.parse(match);
        if (this.isValidQAPair(obj)) {
          validObjects.push(obj);
        }
      } catch (error) {
        console.warn('[GEMINI] Failed to parse extracted object:', error.message);
      }
    }
    
    return validObjects;
  }

  private recoverPartialResponse(text: string): any[] {
    console.log('[GEMINI] Attempting partial response recovery');
    
    // Look for the start of the JSON array
    const arrayStart = text.indexOf('[');
    if (arrayStart === -1) {
      return [];
    }
    
    // Extract everything from the array start
    const arrayContent = text.substring(arrayStart);
    
    // Find complete objects before any truncation
    const objects = [];
    let currentPos = 1; // Skip the opening bracket
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let objectStart = -1;
    
    for (let i = currentPos; i < arrayContent.length; i++) {
      const char = arrayContent[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        if (braceCount === 0) {
          objectStart = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && objectStart !== -1) {
          // Complete object found
          const objectStr = arrayContent.substring(objectStart, i + 1);
          try {
            const obj = JSON.parse(objectStr);
            if (this.isValidQAPair(obj)) {
              objects.push(obj);
            }
          } catch (error) {
            console.warn('[GEMINI] Failed to parse recovered object:', error.message);
          }
          objectStart = -1;
        }
      }
    }
    
    console.log('[GEMINI] Recovered', objects.length, 'complete objects from partial response');
    return objects;
  }

  private isValidQAPair(obj: any): boolean {
    return obj &&
           typeof obj.user === 'string' &&
           typeof obj.model === 'string' &&
           typeof obj.isCorrect === 'boolean' &&
           obj.user.trim().length > 0 &&
           obj.model.trim().length > 0;
  }

  public async identifyThemes(
    combinedContent: string,
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<string[]> {
    if (!combinedContent || combinedContent.trim().length < 50) {
      console.warn('[GEMINI] Content too short for theme identification');
      return [];
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);

    const systemPrompt = `You are an expert content analyst specializing in theme identification for fine-tuning dataset optimization.

OBJECTIVE: Identify 5-8 key themes that will optimize Q&A generation for ${goalConfig?.name} fine-tuning.

CRITICAL: Respond with ONLY a valid JSON array of theme strings. No explanations, markdown, or code blocks.

Example format: ["Theme 1", "Theme 2", "Theme 3"]`;

    const userPrompt = `Analyze the content and identify 5-8 key themes optimized for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

CONTENT TO ANALYZE:
---
${combinedContent.substring(0, 8000)}${combinedContent.length > 8000 ? '\n[Content truncated for analysis focus]' : ''}
---

Return ONLY a JSON array of 5-8 theme strings:`;

    try {
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'I understand. I will analyze the content and return only a JSON array of key themes.' },
        { role: 'user', content: userPrompt }
      ], 0.3, 1200);

      const themes = this.parseJsonResponse(response.content);

      if (!Array.isArray(themes)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validThemes = themes.filter(
        (theme): theme is string =>
          typeof theme === 'string' && theme.trim().length > 0
      );

      console.log('[GEMINI] Identified themes:', validThemes);
      return validThemes.slice(0, 8);
    } catch (error: any) {
      console.error('[GEMINI] Theme identification failed:', error);
      return [];
    }
  }

  public async augmentWithWebSearch(
    originalContent: string,
    identifiedThemes: string[] = [],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<{ augmentedText: string; groundingMetadata?: GroundingMetadata }> {
    if (!originalContent || originalContent.trim().length < 100) {
      console.warn('[GEMINI] Content too short for web augmentation');
      return { augmentedText: originalContent };
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const themeGuidance = identifiedThemes.length > 0 
      ? `\n\nPRIORITY THEMES FOR WEB SEARCH: ${identifiedThemes.join(', ')}`
      : '';

    const systemPrompt = `You are an expert content augmentation specialist with access to real-time web search capabilities, optimizing content for ${goalConfig?.name} fine-tuning.

OBJECTIVE: Enhance the original content with targeted web research to create a comprehensive, coherent resource optimized for generating high-quality Q&A pairs for ${goalConfig?.name} fine-tuning.

CRITICAL: Return ONLY the enhanced, integrated content without commentary or source citations.`;

    const userPrompt = `Enhance the original content with targeted web research for ${goalConfig?.name} fine-tuning optimization.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}${themeGuidance}

ORIGINAL CONTENT TO ENHANCE:
---
${originalContent}
---

Return ONLY the enhanced, integrated content:`;

    try {
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'I understand. I will enhance the content with targeted web research while maintaining coherence.' },
        { role: 'user', content: userPrompt }
      ], 0.4, 12000, [{ googleSearch: {} }]);

      const augmentedText = response.content?.trim() || originalContent;
      const groundingMetadata = response.groundingMetadata;

      console.log('[GEMINI] Web augmentation completed, enhanced content length:', augmentedText.length);
      return { augmentedText, groundingMetadata };
    } catch (error: any) {
      console.error('[GEMINI] Web augmentation failed:', error);
      throw new Error(`Web augmentation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async generateQAPairs(
    content: string, 
    themes: string[] = [],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<QAPair[]> {
    if (!content || content.length < 50) {
      throw new Error('Content too short for Q&A generation (minimum 50 characters)');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const themeGuidance = themes.length > 0 
      ? `\n\nKEY THEMES TO COVER: ${themes.join(', ')}\nEnsure comprehensive coverage of these themes across the generated Q&A pairs.`
      : '';

    console.log(`[GEMINI] Starting Q&A generation for content length: ${content.length}`);

    const systemPrompt = `You are an expert Q&A dataset generator specializing in creating high-quality training data for ${goalConfig?.name} fine-tuning.

OBJECTIVE: Generate comprehensive Q&A pairs from the provided content. Focus on creating diverse, relevant questions with accurate answers that will optimize ${goalConfig?.name} fine-tuning.

CRITICAL SUCCESS FACTORS:
- Extract maximum value from every piece of content
- Create questions that test different aspects of understanding
- Ensure answers are comprehensive yet concise
- Include both correct and strategically incorrect answers for discrimination training
- Maintain high quality standards throughout

CRITICAL JSON FORMAT REQUIREMENTS:
1. Respond with ONLY a valid JSON array
2. No explanations, markdown, or code blocks
3. Start immediately with [ and end with ]
4. Each object must have: "user", "model", "isCorrect", "confidence"
5. Properly escape all strings (use \\" for quotes, \\n for newlines)
6. No unescaped control characters

Example format:
[
  {
    "user": "What is the main concept?",
    "model": "The main concept is...",
    "isCorrect": true,
    "confidence": 0.9
  }
]`;

    const userPrompt = `Generate comprehensive Q&A pairs from the provided content for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}${themeGuidance}

GENERATION REQUIREMENTS:
- Generate as many high-quality Q&A pairs as the content supports (aim for 50-100 pairs)
- Aim for approximately 92% correct answers and 8% incorrect answers
- Ensure variety in question types and complexity levels
- Cover different aspects and details of the content thoroughly
- Make incorrect answers plausible but clearly wrong to aid discrimination training
- Focus on content that directly supports the ${goalConfig?.name} objective

QUALITY STANDARDS:
- Questions must be clear, specific, and answerable from the content
- Correct answers must be accurate, comprehensive, and well-structured
- Incorrect answers must be plausible but factually wrong
- All pairs must contribute meaningfully to fine-tuning effectiveness
- Maintain consistency in style and approach

CONTENT TO PROCESS:
---
${content.substring(0, 12000)}${content.length > 12000 ? '\n[Content continues but truncated for this request]' : ''}
---

Generate Q&A pairs now (respond with ONLY the JSON array):`;

    try {
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: `I understand. I will generate comprehensive Q&A pairs from the content, focusing on quality and relevance for ${goalConfig?.name} fine-tuning. I will respond with only a valid JSON array.` },
        { role: 'user', content: userPrompt }
      ], 0.6, 10000);

      const qaData = this.parseJsonResponse(response.content);

      if (!Array.isArray(qaData)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validPairs = qaData.filter(
        (item): item is QAPair =>
          this.isValidQAPair(item)
      ).map(pair => ({
        ...pair,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        source: 'original' as const
      }));

      console.log(`[GEMINI] Q&A generation completed:`, {
        received: qaData.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      if (validPairs.length === 0) {
        console.warn('[GEMINI] No valid Q&A pairs generated from content');
        throw new Error('Failed to generate any valid Q&A pairs from the content. The content may not be suitable for Q&A generation or the AI service may be experiencing issues.');
      }

      return this.shuffleArray(validPairs);

    } catch (error: any) {
      console.error(`[GEMINI] Q&A generation failed:`, error);
      throw new Error(`Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async identifyKnowledgeGaps(
    originalContent: string,
    identifiedThemes: string[],
    generatedQAPairs: QAPair[],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<KnowledgeGap[]> {
    if (!originalContent || originalContent.length < 100 || generatedQAPairs.length === 0) {
      console.warn('[GEMINI] Insufficient content or Q&A pairs for gap analysis');
      return [];
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);

    const systemPrompt = `You are an expert dataset analyst specializing in knowledge gap identification for fine-tuning dataset optimization.

OBJECTIVE: Identify 5-8 significant knowledge gaps in the generated Q&A dataset that should be addressed with additional synthetic Q&A pairs to optimize ${goalConfig?.name} fine-tuning effectiveness.

CRITICAL: Respond with ONLY a valid JSON array. No explanations, markdown, or code blocks.

Example format:
[
  {
    "id": "gap_1",
    "description": "Specific description",
    "theme": "related_theme",
    "priority": "high",
    "suggestedQuestionTypes": ["type1", "type2"],
    "relatedConcepts": ["concept1", "concept2"]
  }
]`;

    const userPrompt = `Analyze the generated Q&A dataset against the original content to identify significant knowledge gaps for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

DATASET ANALYSIS CONTEXT:
- Original content themes: ${identifiedThemes.join(', ')}
- Generated Q&A pairs: ${generatedQAPairs.length} total
- Correct answers: ${generatedQAPairs.filter(p => p.isCorrect).length}
- Incorrect answers: ${generatedQAPairs.filter(p => !p.isCorrect).length}

ORIGINAL CONTENT FOR REFERENCE:
---
${originalContent.substring(0, 8000)}${originalContent.length > 8000 ? '\n[Content truncated for analysis focus]' : ''}
---

Return ONLY a JSON array of knowledge gap objects:`;

    try {
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: `I understand. I will analyze the Q&A dataset comprehensively to identify significant knowledge gaps for ${goalConfig?.name} fine-tuning optimization and respond with only a JSON array.` },
        { role: 'user', content: userPrompt }
      ], 0.3, 5000);

      const gaps = this.parseJsonResponse(response.content);

      if (!Array.isArray(gaps)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validGaps = gaps.filter((gap): gap is KnowledgeGap =>
        gap &&
        typeof gap.id === 'string' &&
        typeof gap.description === 'string' &&
        typeof gap.theme === 'string' &&
        ['high', 'medium', 'low'].includes(gap.priority) &&
        Array.isArray(gap.suggestedQuestionTypes) &&
        Array.isArray(gap.relatedConcepts)
      ).slice(0, 8);

      console.log('[GEMINI] Identified knowledge gaps:', {
        total: validGaps.length,
        high: validGaps.filter(g => g.priority === 'high').length,
        medium: validGaps.filter(g => g.priority === 'medium').length,
        low: validGaps.filter(g => g.priority === 'low').length
      });

      return validGaps;

    } catch (error: any) {
      console.error('[GEMINI] Knowledge gap identification failed:', error);
      throw new Error(`Knowledge gap identification failed: ${error.message || 'Unknown error'}`);
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export const geminiService = new GeminiService();