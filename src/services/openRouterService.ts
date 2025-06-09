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
    
    console.log('[OPENROUTER] All environment variables:');
    console.log('[OPENROUTER] VITE_OPENROUTER_API_KEY:', import.meta.env.VITE_OPENROUTER_API_KEY ? 'Found' : 'Not found');
    console.log('[OPENROUTER] Found env var: VITE_OPENROUTER_API_KEY =', import.meta.env.VITE_OPENROUTER_API_KEY ? import.meta.env.VITE_OPENROUTER_API_KEY.substring(0, 15) + '...' : 'undefined');
    
    if (!apiKey?.trim()) {
      console.error('[OPENROUTER] ❌ API key not found in any of the expected environment variables');
      console.error('[OPENROUTER] Expected format in .env.local: VITE_OPENROUTER_API_KEY=sk-or-v1-...');
      console.error('[OPENROUTER] Make sure to restart the development server after adding the API key');
      return;
    }

    console.log('[OPENROUTER] Checking for API key...');
    console.log('[OPENROUTER] VITE_OPENROUTER_API_KEY:', import.meta.env.VITE_OPENROUTER_API_KEY ? 'Found' : 'Not found');
    console.log('[OPENROUTER] OPENROUTER_API_KEY:', import.meta.env.OPENROUTER_API_KEY ? 'Found' : 'Not found');
    console.log('[OPENROUTER] VITE_OPENROUTER_KEY:', import.meta.env.VITE_OPENROUTER_KEY ? 'Found' : 'Not found');

    this.apiKey = apiKey.trim();
    this.isInitialized = true;
    console.log('[OPENROUTER] ✅ Service initialized successfully');
    console.log('[OPENROUTER] API key found:', this.apiKey.substring(0, 15) + '...');
    console.log('[OPENROUTER] API key length:', this.apiKey.length);
    
    // Validate API key format
    if (!this.apiKey.startsWith('sk-or-v1-')) {
      console.warn('[OPENROUTER] ⚠️ API key does not start with expected prefix "sk-or-v1-"');
    }
  }

  public isReady(): boolean {
    const ready = {
      hasApiKey: this.apiKey !== null,
      isInitialized: this.isInitialized,
      ready: this.isInitialized && this.apiKey !== null
    };
    console.log('[OPENROUTER] Service ready check:', ready);
    return ready.ready;
  }

  private async makeRequest(
    messages: Array<{ role: string; content: string }>, 
    temperature = 0.7,
    maxTokens = 3000, // Reduced default for individual gap requests
    model = 'nvidia/nemotron-4-340b-instruct' // Updated to use Nvidia Nemotron model
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter service not initialized - API key missing');
    }

    console.log('[OPENROUTER] Making API request with', messages.length, 'messages, max tokens:', maxTokens, 'model:', model);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[OPENROUTER] Request timeout after 60 seconds');
      controller.abort();
    }, 60000); // 60 second timeout for smaller requests

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
        throw new Error('Response was truncated. The generated content exceeded the token limit.');
      }
      
      return content;

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.error('[OPENROUTER] Request aborted due to timeout');
        throw new Error('OpenRouter API request timed out after 60 seconds');
      }
      
      console.error('[OPENROUTER] Request failed:', error);
      throw error;
    }
  }

  private parseJsonResponse(responseText: string): any {
    console.log('[OPENROUTER] Parsing JSON response, length:', responseText.length);
    console.log('[OPENROUTER] Processed JSON string (first 500 chars):');
    console.log(responseText.substring(0, 500));
    
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
      // Remove control characters that break JSON parsing
      .replace(/[\x00-\x1F\x7F]/g, '')
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
      console.error('[OPENROUTER] JSON parsing failed around position');
      console.error(stage1Error.message.match(/position (\d+)/)?.[1] || 'unknown');
      console.error('[OPENROUTER] character:');
      const position = parseInt(stage1Error.message.match(/position (\d+)/)?.[1] || '0');
      console.error(jsonStr.charAt(position));
      console.error('[OPENROUTER] Context:');
      console.error(jsonStr.substring(Math.max(0, position - 50), position + 50));
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

  // NEW: Generate synthetic Q&A pairs for a SINGLE knowledge gap
  public async generateSyntheticQAPairsForGap(
    combinedContent: string,
    knowledgeGap: KnowledgeGap,
    fineTuningGoal: FineTuningGoal = 'knowledge',
    pairsPerGap: number = 10
  ): Promise<SyntheticQAPair[]> {
    console.log(`[OPENROUTER] Generating ${pairsPerGap} synthetic Q&A pairs for gap: ${knowledgeGap.id}`);
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const incorrectCount = Math.max(1, Math.ceil(pairsPerGap * INCORRECT_ANSWER_RATIO));
    const correctCount = pairsPerGap - incorrectCount;

    const prompt = `You are an expert synthetic Q&A generator. Create exactly ${pairsPerGap} high-quality Q&A pairs in valid JSON format to address this specific knowledge gap.

CRITICAL JSON REQUIREMENTS:
1. Respond with ONLY a valid JSON array - no explanations, no markdown, no code blocks
2. Start immediately with [ and end with ]
3. Each object must have: "user", "model", "isCorrect", "confidence", "targetGap", "generationReasoning"
4. All strings must be properly escaped (use \\" for quotes, \\n for newlines)
5. No unescaped control characters or special characters
6. Generate exactly ${correctCount} correct and ${incorrectCount} incorrect answers

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

KNOWLEDGE GAP TO ADDRESS:
ID: ${knowledgeGap.id}
Description: ${knowledgeGap.description}
Theme: ${knowledgeGap.theme}
Priority: ${knowledgeGap.priority}
Suggested Question Types: ${knowledgeGap.suggestedQuestionTypes.join(', ')}
Related Concepts: ${knowledgeGap.relatedConcepts.join(', ')}

CONTENT REFERENCE (for context):
${combinedContent.substring(0, 3000)}${combinedContent.length > 3000 ? '...' : ''}

Generate exactly ${pairsPerGap} Q&A pairs that specifically address the "${knowledgeGap.description}" gap:`;

    try {
      console.log(`[OPENROUTER] Sending request for gap ${knowledgeGap.id} using Nvidia Nemotron model`);
      
      // Use smaller token limit for individual gap requests
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.6, 2500, 'nvidia/nemotron-4-340b-instruct'); // Explicitly specify Nemotron model

      console.log(`[OPENROUTER] Received response for gap ${knowledgeGap.id}, parsing JSON`);
      const syntheticPairs = this.parseJsonResponse(response);

      if (!Array.isArray(syntheticPairs)) {
        console.error(`[OPENROUTER] Response for gap ${knowledgeGap.id} is not a valid JSON array`);
        throw new Error('Response is not a valid JSON array');
      }

      console.log(`[OPENROUTER] Filtering and validating synthetic pairs for gap ${knowledgeGap.id}`);
      const validPairs = syntheticPairs.filter((pair): pair is SyntheticQAPair =>
        pair &&
        typeof pair.user === 'string' &&
        typeof pair.model === 'string' &&
        typeof pair.isCorrect === 'boolean' &&
        pair.user.trim().length > 0 &&
        pair.model.trim().length > 0
      ).map((pair) => ({
        ...pair,
        source: 'synthetic' as const,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        validationStatus: 'pending' as const,
        targetGap: knowledgeGap.id,
        generationReasoning: pair.generationReasoning || `Generated to address ${knowledgeGap.description}`
      })).slice(0, pairsPerGap);

      console.log(`[OPENROUTER] Gap ${knowledgeGap.id} generation completed:`, {
        requested: pairsPerGap,
        generated: syntheticPairs.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      if (validPairs.length === 0) {
        throw new Error(`No valid Q&A pairs could be extracted for gap ${knowledgeGap.id}`);
      }

      return validPairs;

    } catch (error: any) {
      console.error(`[OPENROUTER] Synthetic Q&A generation failed for gap ${knowledgeGap.id}:`, error);
      throw new Error(`Gap ${knowledgeGap.id} generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  // UPDATED: Generate synthetic Q&A pairs by processing each gap individually
  public async generateSyntheticQAPairs(
    combinedContent: string,
    knowledgeGaps: KnowledgeGap[],
    fineTuningGoal: FineTuningGoal = 'knowledge',
    targetCount: number = SYNTHETIC_QA_TARGET,
    onProgress?: (current: number, total: number, gapId: string) => void
  ): Promise<SyntheticQAPair[]> {
    console.log('[OPENROUTER] Starting individual gap-based synthetic Q&A generation');
    console.log('[OPENROUTER] Parameters:', {
      contentLength: combinedContent.length,
      gapCount: knowledgeGaps.length,
      fineTuningGoal,
      targetCount
    });
    
    if (knowledgeGaps.length === 0) {
      console.warn('[OPENROUTER] No knowledge gaps provided');
      return [];
    }

    // Calculate pairs per gap, ensuring we don't exceed reasonable limits
    const pairsPerGap = Math.min(15, Math.ceil(targetCount / knowledgeGaps.length)); // Cap at 15 per gap
    const actualTargetCount = pairsPerGap * knowledgeGaps.length;
    
    console.log(`[OPENROUTER] Generating ${pairsPerGap} pairs per gap for ${knowledgeGaps.length} gaps (${actualTargetCount} total)`);

    const allSyntheticPairs: SyntheticQAPair[] = [];
    const failedGaps: string[] = [];

    // Process each gap individually
    for (let i = 0; i < knowledgeGaps.length; i++) {
      const gap = knowledgeGaps[i];
      
      try {
        console.log(`[OPENROUTER] Processing gap ${i + 1}/${knowledgeGaps.length}: ${gap.id}`);
        
        // Report progress
        if (onProgress) {
          onProgress(i, knowledgeGaps.length, gap.id);
        }

        const gapPairs = await this.generateSyntheticQAPairsForGap(
          combinedContent,
          gap,
          fineTuningGoal,
          pairsPerGap
        );

        allSyntheticPairs.push(...gapPairs);
        console.log(`[OPENROUTER] Successfully generated ${gapPairs.length} pairs for gap ${gap.id}`);

        // Add a small delay between requests to avoid rate limiting
        if (i < knowledgeGaps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

      } catch (error: any) {
        console.error(`[OPENROUTER] Failed to generate pairs for gap ${gap.id}:`, error);
        failedGaps.push(gap.id);
        // Continue with other gaps instead of failing completely
      }
    }

    // Report final progress
    if (onProgress) {
      onProgress(knowledgeGaps.length, knowledgeGaps.length, 'completed');
    }

    console.log('[OPENROUTER] Individual gap processing completed:', {
      totalGaps: knowledgeGaps.length,
      successfulGaps: knowledgeGaps.length - failedGaps.length,
      failedGaps: failedGaps.length,
      totalPairsGenerated: allSyntheticPairs.length,
      correctPairs: allSyntheticPairs.filter(p => p.isCorrect).length,
      incorrectPairs: allSyntheticPairs.filter(p => !p.isCorrect).length
    });

    if (failedGaps.length > 0) {
      console.warn('[OPENROUTER] Some gaps failed to generate pairs:', failedGaps);
    }

    if (allSyntheticPairs.length === 0) {
      throw new Error('No synthetic Q&A pairs could be generated for any knowledge gaps');
    }

    // Shuffle the final array to mix pairs from different gaps
    return this.shuffleArray(allSyntheticPairs);
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

export const openRouterService = new OpenRouterService();