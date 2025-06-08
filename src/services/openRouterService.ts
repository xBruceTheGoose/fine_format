import { KnowledgeGap, SyntheticQAPair, QAPair, FineTuningGoal } from '../types';
import { FINE_TUNING_GOALS, SYNTHETIC_QA_TARGET, INCORRECT_ANSWER_RATIO } from '../constants';

class OpenRouterService {
  private apiKey: string | null = null;
  private isInitialized = false;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Try multiple possible API key names for backward compatibility
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || 
                   import.meta.env.OPENROUTER_API_KEY ||
                   import.meta.env.VITE_OPENROUTER_KEY;
    
    console.log('[OPENROUTER] Checking for API key...');
    
    if (!apiKey?.trim()) {
      console.error('[OPENROUTER] ❌ API key not found in any of the expected environment variables');
      console.error('[OPENROUTER] Expected format in .env.local: VITE_OPENROUTER_API_KEY=sk-or-v1-...');
      console.error('[OPENROUTER] Make sure to restart the development server after adding the API key');
      return;
    }

    this.apiKey = apiKey.trim();
    this.isInitialized = true;
    console.log('[OPENROUTER] ✅ Service initialized successfully');
    console.log('[OPENROUTER] API key found:', this.apiKey.substring(0, 15) + '...');
    
    // Validate API key format
    if (!this.apiKey.startsWith('sk-or-v1-')) {
      console.warn('[OPENROUTER] ⚠️ API key does not start with expected prefix "sk-or-v1-"');
    }
  }

  public isReady(): boolean {
    const ready = this.isInitialized && this.apiKey !== null;
    return ready;
  }

  private async makeRequest(
    messages: Array<{ role: string; content: string }>, 
    temperature = 0.7,
    maxTokens = 6000,
    model = 'meta-llama/llama-3.1-8b-instruct:free'
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter service not initialized - API key missing');
    }

    console.log('[OPENROUTER] Making API request with', messages.length, 'messages, max tokens:', maxTokens);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[OPENROUTER] Request timeout after 90 seconds');
      controller.abort();
    }, 90000); // 90 second timeout for large responses

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Fine Format - AI Dataset Generator',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          // Add response format hint for better JSON generation
          response_format: { type: "json_object" }
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OPENROUTER] API error:', response.status, response.statusText, errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices?.[0]?.message?.content) {
        console.error('[OPENROUTER] Invalid response structure:', data);
        throw new Error('Invalid response from OpenRouter API');
      }

      const content = data.choices[0].message.content;
      console.log('[OPENROUTER] Request successful, response length:', content.length);
      
      // Check if response was truncated
      if (data.choices[0].finish_reason === 'length') {
        console.warn('[OPENROUTER] Response was truncated due to max_tokens limit');
        throw new Error('Response was truncated. The generated content exceeded the token limit. Please try with fewer Q&A pairs or increase the token limit.');
      }
      
      return content;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('[OPENROUTER] Request aborted due to timeout');
        throw new Error('OpenRouter API request timed out after 90 seconds');
      }
      
      console.error('[OPENROUTER] Request failed:', error);
      throw error;
    }
  }

  private parseJsonResponse(responseText: string): any {
    console.log('[OPENROUTER] Parsing JSON response, length:', responseText.length);
    
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
      console.log('[OPENROUTER] Removed code fences from response');
    }

    // Enhanced JSON extraction - look for complete JSON array
    const arrayStartPattern = /\[\s*\{/;
    const arrayEndPattern = /\}\s*\]$/;
    
    const startMatch = jsonStr.search(arrayStartPattern);
    const endMatch = jsonStr.search(arrayEndPattern);
    
    if (startMatch !== -1 && endMatch !== -1 && startMatch < endMatch) {
      // Extract the JSON array portion
      const extractedJson = jsonStr.substring(startMatch, endMatch + 2);
      console.log('[OPENROUTER] Extracted JSON array from position', startMatch, 'to', endMatch + 2);
      
      // Validate extraction
      try {
        const testParse = JSON.parse(extractedJson);
        if (Array.isArray(testParse)) {
          jsonStr = extractedJson;
          console.log('[OPENROUTER] Using extracted JSON array with', testParse.length, 'items');
        }
      } catch {
        console.warn('[OPENROUTER] Extracted JSON is invalid, trying cleanup on original');
      }
    }

    // Comprehensive JSON cleanup
    jsonStr = this.cleanJsonString(jsonStr);

    // Multi-stage parsing with progressive error recovery
    return this.parseWithRecovery(jsonStr, responseText);
  }

  private cleanJsonString(jsonStr: string): string {
    return jsonStr
      // Remove any trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix common escape sequence issues
      .replace(/\\\\/g, '\\')  // Fix double backslashes
      .replace(/\\n/g, '\\n')  // Ensure newlines are properly escaped
      .replace(/\\t/g, '\\t')  // Ensure tabs are properly escaped
      .replace(/\\r/g, '\\r')  // Ensure carriage returns are properly escaped
      // Fix unescaped quotes within strings (more robust pattern)
      .replace(/"([^"\\]*)\\?"([^"\\]*)"([^"\\]*)"/g, '"$1\\"$2\\"$3"')
      // Remove control characters that break JSON parsing
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Fix common JSON formatting issues
      .replace(/([^\\])"/g, '$1\\"')  // Escape unescaped quotes
      .replace(/^"/g, '\\"')          // Escape quotes at start
      // Remove any non-printable characters
      .replace(/[^\x20-\x7E\n\r\t]/g, '');
  }

  private parseWithRecovery(jsonStr: string, originalResponse: string): any {
    // Stage 1: Direct parsing
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        console.log('[OPENROUTER] ✅ Direct parsing successful with', parsed.length, 'items');
        return parsed;
      } else {
        throw new Error('Response is not a JSON array');
      }
    } catch (stage1Error) {
      console.warn('[OPENROUTER] Stage 1 parsing failed:', stage1Error.message);
    }

    // Stage 2: Fix structural issues
    try {
      let fixedJson = this.fixStructuralIssues(jsonStr);
      const parsed = JSON.parse(fixedJson);
      
      if (Array.isArray(parsed)) {
        console.log('[OPENROUTER] ✅ Stage 2 parsing successful with', parsed.length, 'items');
        return parsed;
      } else {
        throw new Error('Fixed response is not a JSON array');
      }
    } catch (stage2Error) {
      console.warn('[OPENROUTER] Stage 2 parsing failed:', stage2Error.message);
    }

    // Stage 3: Extract individual objects
    try {
      const extractedObjects = this.extractIndividualObjects(jsonStr);
      if (extractedObjects.length > 0) {
        console.log('[OPENROUTER] ✅ Stage 3 extraction successful with', extractedObjects.length, 'objects');
        return extractedObjects;
      }
    } catch (stage3Error) {
      console.warn('[OPENROUTER] Stage 3 extraction failed:', stage3Error.message);
    }

    // Stage 4: Last resort - try to salvage partial data
    try {
      const partialData = this.extractPartialData(originalResponse);
      if (partialData.length > 0) {
        console.log('[OPENROUTER] ⚠️ Stage 4 partial extraction with', partialData.length, 'objects');
        return partialData;
      }
    } catch (stage4Error) {
      console.warn('[OPENROUTER] Stage 4 partial extraction failed:', stage4Error.message);
    }

    // All stages failed
    console.error('[OPENROUTER] ❌ All parsing stages failed');
    console.error('[OPENROUTER] Original response length:', originalResponse.length);
    console.error('[OPENROUTER] Processed JSON length:', jsonStr.length);
    console.error('[OPENROUTER] First 500 chars of original:', originalResponse.substring(0, 500));
    console.error('[OPENROUTER] First 500 chars of processed:', jsonStr.substring(0, 500));
    
    throw new Error(`Failed to parse JSON response after all recovery attempts. Response may be malformed or truncated.`);
  }

  private fixStructuralIssues(jsonStr: string): string {
    let fixed = jsonStr;
    
    // Count brackets and braces
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    
    console.log('[OPENROUTER] Bracket/brace count:', { openBrackets, closeBrackets, openBraces, closeBraces });
    
    // Fix missing closing braces
    if (openBraces > closeBraces) {
      const missingBraces = openBraces - closeBraces;
      console.log('[OPENROUTER] Adding', missingBraces, 'missing closing braces');
      fixed += '}'.repeat(missingBraces);
    }
    
    // Fix missing closing brackets
    if (openBrackets > closeBrackets) {
      const missingBrackets = openBrackets - closeBrackets;
      console.log('[OPENROUTER] Adding', missingBrackets, 'missing closing brackets');
      fixed += ']'.repeat(missingBrackets);
    }
    
    return fixed;
  }

  private extractIndividualObjects(jsonStr: string): any[] {
    console.log('[OPENROUTER] Attempting individual object extraction');
    
    // More sophisticated regex to match complete JSON objects
    const objectPattern = /\{(?:[^{}]|{[^{}]*})*\}/g;
    const objectMatches = jsonStr.match(objectPattern) || [];
    
    console.log('[OPENROUTER] Found', objectMatches.length, 'potential JSON objects');
    
    const validObjects = [];
    for (let i = 0; i < objectMatches.length; i++) {
      try {
        const obj = JSON.parse(objectMatches[i]);
        // Validate that it looks like a Q&A pair
        if (obj && typeof obj === 'object' && 
            typeof obj.user === 'string' && 
            typeof obj.model === 'string' &&
            typeof obj.isCorrect === 'boolean') {
          validObjects.push(obj);
          console.log('[OPENROUTER] Valid object', i + 1, 'extracted');
        }
      } catch (parseError) {
        console.warn('[OPENROUTER] Failed to parse object', i + 1, ':', parseError.message);
      }
    }
    
    return validObjects;
  }

  private extractPartialData(response: string): any[] {
    console.log('[OPENROUTER] Attempting partial data extraction as last resort');
    
    // Look for patterns that might indicate Q&A pairs even in malformed JSON
    const patterns = [
      /"user":\s*"([^"]+)"/g,
      /"model":\s*"([^"]+)"/g,
      /"isCorrect":\s*(true|false)/g
    ];
    
    const users = [...response.matchAll(patterns[0])].map(m => m[1]);
    const models = [...response.matchAll(patterns[1])].map(m => m[1]);
    const correctness = [...response.matchAll(patterns[2])].map(m => m[1] === 'true');
    
    const minLength = Math.min(users.length, models.length, correctness.length);
    
    if (minLength > 0) {
      console.log('[OPENROUTER] Extracted', minLength, 'partial Q&A pairs');
      
      const partialPairs = [];
      for (let i = 0; i < minLength; i++) {
        partialPairs.push({
          user: users[i],
          model: models[i],
          isCorrect: correctness[i],
          confidence: correctness[i] ? 0.8 : 0.3,
          targetGap: `gap_${i + 1}`,
          generationReasoning: 'Extracted from partial response'
        });
      }
      
      return partialPairs;
    }
    
    return [];
  }

  // Generate ADDITIONAL synthetic Q&A pairs with improved error handling
  public async generateSyntheticQAPairs(
    combinedContent: string,
    knowledgeGaps: KnowledgeGap[],
    fineTuningGoal: FineTuningGoal = 'knowledge',
    targetCount: number = SYNTHETIC_QA_TARGET
  ): Promise<SyntheticQAPair[]> {
    console.log('[OPENROUTER] Starting synthetic Q&A generation');
    console.log('[OPENROUTER] Parameters:', {
      contentLength: combinedContent.length,
      gapCount: knowledgeGaps.length,
      fineTuningGoal,
      targetCount
    });
    
    // Reduce target count if it's too large for reliable JSON generation
    const adjustedTargetCount = Math.min(targetCount, 50); // Cap at 50 for reliability
    if (adjustedTargetCount < targetCount) {
      console.log('[OPENROUTER] Reduced target count from', targetCount, 'to', adjustedTargetCount, 'for reliability');
    }
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const pairsPerGap = Math.ceil(adjustedTargetCount / knowledgeGaps.length);

    const prompt = `You are an expert synthetic Q&A generator. Create exactly ${adjustedTargetCount} high-quality Q&A pairs in valid JSON format.

CRITICAL JSON REQUIREMENTS:
1. Respond with ONLY a valid JSON array - no explanations, no markdown, no code blocks
2. Start immediately with [ and end with ]
3. Each object must have: "user", "model", "isCorrect", "confidence", "targetGap", "generationReasoning"
4. All strings must be properly escaped (use \\" for quotes, \\n for newlines)
5. No unescaped control characters or special characters
6. Confidence: 0.85-0.95 for correct answers, 0.15-0.35 for incorrect answers
7. Include approximately 5-10% incorrect answers for training discrimination

FINE-TUNING GOAL: ${goalConfig?.name}
TARGET: ${adjustedTargetCount} Q&A pairs addressing these knowledge gaps:

${knowledgeGaps.slice(0, 5).map((gap, i) => `${i + 1}. ${gap.id}: ${gap.description} (${gap.theme})`).join('\n')}

CONTENT REFERENCE:
${combinedContent.substring(0, 4000)}${combinedContent.length > 4000 ? '...' : ''}

Generate exactly ${adjustedTargetCount} Q&A pairs as a JSON array:`;

    try {
      console.log('[OPENROUTER] Sending synthetic Q&A generation request');
      
      // Use higher token limit and more reliable model
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.6, 8000, 'meta-llama/llama-3.1-70b-instruct:free'); // Use larger model for better JSON

      console.log('[OPENROUTER] Received response, parsing JSON');
      const syntheticPairs = this.parseJsonResponse(response);

      if (!Array.isArray(syntheticPairs)) {
        console.error('[OPENROUTER] Response is not a valid JSON array');
        throw new Error('Response is not a valid JSON array');
      }

      console.log('[OPENROUTER] Filtering and validating synthetic pairs');
      const validPairs = syntheticPairs.filter((pair): pair is SyntheticQAPair =>
        pair &&
        typeof pair.user === 'string' &&
        typeof pair.model === 'string' &&
        typeof pair.isCorrect === 'boolean' &&
        pair.user.trim().length > 0 &&
        pair.model.trim().length > 0
      ).map((pair, index) => ({
        ...pair,
        source: 'synthetic' as const,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        validationStatus: 'pending' as const,
        targetGap: pair.targetGap || `gap_${(index % knowledgeGaps.length) + 1}`,
        generationReasoning: pair.generationReasoning || 'Generated to fill knowledge gap'
      })).slice(0, adjustedTargetCount);

      console.log('[OPENROUTER] Synthetic Q&A generation completed:', {
        requested: adjustedTargetCount,
        generated: syntheticPairs.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      if (validPairs.length === 0) {
        throw new Error('No valid Q&A pairs could be extracted from the response');
      }

      return validPairs;

    } catch (error: any) {
      console.error('[OPENROUTER] Synthetic Q&A generation failed:', error);
      
      // Provide more specific error messages
      if (error.message.includes('truncated')) {
        throw new Error(`Response was truncated. Try reducing the target count to ${Math.floor(adjustedTargetCount * 0.7)} pairs.`);
      } else if (error.message.includes('JSON')) {
        throw new Error(`JSON parsing failed. The AI model may have generated malformed output. Try again or reduce the complexity of the request.`);
      } else {
        throw new Error(`Synthetic Q&A generation failed: ${error.message || 'Unknown error'}`);
      }
    }
  }
}

export const openRouterService = new OpenRouterService();