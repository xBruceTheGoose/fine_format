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
    // Debug: Log all environment variables that contain "OPENROUTER"
    console.log('[OPENROUTER] All environment variables:');
    Object.keys(import.meta.env).forEach(key => {
      if (key.includes('OPENROUTER')) {
        console.log(`[OPENROUTER] Found env var: ${key} = ${import.meta.env[key] ? import.meta.env[key].substring(0, 10) + '...' : 'undefined'}`);
      }
    });

    // Try multiple possible API key names for backward compatibility
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY || 
                   import.meta.env.OPENROUTER_API_KEY ||
                   import.meta.env.VITE_OPENROUTER_KEY;
    
    console.log('[OPENROUTER] Checking for API key...');
    console.log('[OPENROUTER] VITE_OPENROUTER_API_KEY:', import.meta.env.VITE_OPENROUTER_API_KEY ? 'Found' : 'Not found');
    console.log('[OPENROUTER] OPENROUTER_API_KEY:', import.meta.env.OPENROUTER_API_KEY ? 'Found' : 'Not found');
    console.log('[OPENROUTER] VITE_OPENROUTER_KEY:', import.meta.env.VITE_OPENROUTER_KEY ? 'Found' : 'Not found');
    
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
    console.log('[OPENROUTER] API key length:', this.apiKey.length);
    
    // Validate API key format
    if (!this.apiKey.startsWith('sk-or-v1-')) {
      console.warn('[OPENROUTER] ⚠️ API key does not start with expected prefix "sk-or-v1-"');
      console.warn('[OPENROUTER] Current prefix:', this.apiKey.substring(0, 10));
    }
  }

  public isReady(): boolean {
    const ready = this.isInitialized && this.apiKey !== null;
    console.log('[OPENROUTER] Service ready check:', {
      isInitialized: this.isInitialized,
      hasApiKey: this.apiKey !== null,
      ready: ready
    });
    return ready;
  }

  private async makeRequest(messages: Array<{ role: string; content: string }>, temperature = 0.7): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter service not initialized - API key missing');
    }

    console.log('[OPENROUTER] Making API request with', messages.length, 'messages');

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[OPENROUTER] Request timeout after 60 seconds');
      controller.abort();
    }, 60000); // 60 second timeout

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
          model: 'nvidia/llama-3.3-nemotron-super-49b-v1:free',
          messages,
          temperature,
          max_tokens: 4000,
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

      console.log('[OPENROUTER] Request successful, response length:', data.choices[0].message.content.length);
      return data.choices[0].message.content;

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
    
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
      console.log('[OPENROUTER] Removed code fences from response');
    }

    // Try to extract JSON from response that might contain conversational text
    // Look for the first occurrence of '[' and the last occurrence of ']'
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
      const extractedJson = jsonStr.substring(firstBracket, lastBracket + 1);
      console.log('[OPENROUTER] Extracted JSON array from position', firstBracket, 'to', lastBracket);
      
      // Validate that the extracted portion is valid JSON before using it
      try {
        const testParse = JSON.parse(extractedJson);
        if (Array.isArray(testParse)) {
          jsonStr = extractedJson;
          console.log('[OPENROUTER] Using extracted JSON array');
        }
      } catch {
        console.warn('[OPENROUTER] Extracted JSON is invalid, using original response');
      }
    }

    // Additional cleanup for common JSON formatting issues
    jsonStr = jsonStr
      // Remove any trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1');

    try {
      const parsed = JSON.parse(jsonStr);
      
      // Validate that it's an array
      if (!Array.isArray(parsed)) {
        console.error('[OPENROUTER] Response is not a JSON array:', typeof parsed);
        throw new Error('Response is not a JSON array');
      }
      
      console.log('[OPENROUTER] Successfully parsed JSON array with', parsed.length, 'items');
      return parsed;
    } catch (error) {
      console.error('[OPENROUTER] Failed to parse JSON response:', error);
      console.error('[OPENROUTER] Raw response (first 500 chars):', responseText.substring(0, 500));
      console.error('[OPENROUTER] Processed JSON string (first 500 chars):', jsonStr.substring(0, 500));
      
      // Try to find the exact position where JSON parsing failed
      try {
        // Attempt to parse character by character to find the error position
        for (let i = 0; i < jsonStr.length; i++) {
          try {
            JSON.parse(jsonStr.substring(0, i + 1));
          } catch (e) {
            if (i > 100) { // Only log if we got reasonably far
              console.error('[OPENROUTER] JSON parsing failed around position', i, 'character:', jsonStr.charAt(i));
              console.error('[OPENROUTER] Context:', jsonStr.substring(Math.max(0, i - 50), i + 50));
              break;
            }
          }
        }
      } catch (e) {
        console.error('[OPENROUTER] Could not determine exact parsing error position');
      }
      
      throw new Error(`Invalid JSON response from OpenRouter: ${responseText.substring(0, 200)}...`);
    }
  }

  public async cleanContent(
    content: string,
    fileName: string,
    contentType: 'text' | 'url' | 'multimodal' = 'text'
  ): Promise<string> {
    console.log('[OPENROUTER] Cleaning content for:', fileName, 'type:', contentType);
    
    const prompt = `
You are an expert content cleaning specialist using advanced AI to extract and clean textual content.

TASK: Clean and extract the most relevant textual content from the provided source.

SOURCE: ${fileName} (${contentType})

CLEANING REQUIREMENTS:
1. Extract ONLY the core textual information that would be valuable for AI training
2. Remove advertisements, navigation elements, headers, footers, and boilerplate content
3. Preserve code blocks, examples, and technical content that relate to the main subject matter
4. Maintain the logical structure and flow of information
5. Remove redundant or repetitive content
6. Keep instructional content, tutorials, and educational material
7. Preserve important formatting context (like lists, steps, procedures)
8. Return clean, readable text without metadata or commentary

IMPORTANT: If the content includes code blocks, examples, or technical instructions that are part of the main educational or informational content, RETAIN them as they are valuable for training.

Return ONLY the cleaned text content without any commentary, explanations, or metadata.

CONTENT TO CLEAN:
---
${content}
---
    `.trim();

    try {
      console.log('[OPENROUTER] Sending content cleaning request');
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.3); // Lower temperature for more consistent cleaning

      console.log('[OPENROUTER] Content cleaning completed, result length:', response.length);
      return response.trim();
    } catch (error: any) {
      console.error('[OPENROUTER] Content cleaning failed:', error);
      throw new Error(`Content cleaning failed: ${error.message || 'Unknown error'}`);
    }
  }

  // Generate ADDITIONAL synthetic Q&A pairs based on Gemini-identified knowledge gaps
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
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const pairsPerGap = Math.ceil(targetCount / knowledgeGaps.length);

    const prompt = `
You are an expert synthetic Q&A generator using the powerful Llama 3.3 Nemotron model to create high-quality ADDITIONAL training data for ${goalConfig?.name} fine-tuning.

CRITICAL: These are ADDITIONAL Q&A pairs to supplement an existing dataset of 100 Q&A pairs. Your goal is to generate ${targetCount} NEW synthetic pairs that fill specific knowledge gaps identified by advanced analysis.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

KNOWLEDGE GAPS TO ADDRESS (identified by Gemini analysis of existing 100 Q&A pairs):
${knowledgeGaps.map((gap, i) => `
${i + 1}. GAP ID: ${gap.id}
   DESCRIPTION: ${gap.description}
   THEME: ${gap.theme}
   PRIORITY: ${gap.priority}
   SUGGESTED QUESTION TYPES: ${gap.suggestedQuestionTypes.join(', ')}
   RELATED CONCEPTS: ${gap.relatedConcepts.join(', ')}
`).join('\n')}

GENERATION REQUIREMENTS:
1. Create approximately ${pairsPerGap} Q&A pairs per knowledge gap (total target: ${targetCount})
2. Include a small portion (5-10%) of incorrect answers for training discrimination
3. These are SUPPLEMENTARY pairs - avoid duplicating coverage from the existing 100 pairs
4. Questions should be natural, diverse, and aligned with ${goalConfig?.name} objectives
5. Correct answers must be accurate, comprehensive, and based on the provided content
6. Incorrect answers should be plausible but contain subtle factual errors (small portion only)
7. Vary question complexity and types based on each gap's suggested question types
8. Ensure answers demonstrate the desired ${goalConfig?.promptFocus}
9. Focus specifically on filling the identified knowledge gaps with unique perspectives

QUALITY STANDARDS:
- Questions should feel natural and user-generated
- Correct answers should be informative and well-structured
- Incorrect answers should be plausible but contain subtle factual errors (small portion)
- Each Q&A should clearly address its target knowledge gap
- Maintain consistency with the fine-tuning goal throughout
- Provide unique value beyond the existing 100 Q&A pairs

INCORRECT ANSWER GUIDELINES (for the small portion):
- Make incorrect answers believable but factually wrong
- Include common misconceptions or subtle errors
- Maintain similar structure and tone to correct answers
- Ensure they're useful for training the model to distinguish quality

For each Q&A pair, provide:
- Natural user question targeting the specific gap
- Comprehensive answer based on content (correct or strategically incorrect)
- Correctness flag (true for correct, false for incorrect)
- Confidence score (0.8-0.95 for correct, 0.1-0.3 for incorrect)
- Target gap ID
- Brief reasoning for how this Q&A addresses the gap

Format as JSON array:
[
  {
    "user": "Natural question text",
    "model": "Comprehensive answer text",
    "isCorrect": true,
    "confidence": 0.9,
    "targetGap": "gap_1",
    "generationReasoning": "Brief explanation of how this addresses the gap"
  }
]

REFERENCE CONTENT:
---
${combinedContent.substring(0, 10000)}${combinedContent.length > 10000 ? '...' : ''}
---

ABSOLUTELY CRITICAL JSON FORMATTING REQUIREMENTS - THESE ARE MANDATORY AND NON-NEGOTIABLE:

1. YOUR RESPONSE MUST BE A VALID, COMPLETE, AND PARSEABLE JSON ARRAY
2. ALL STRING VALUES MUST BE PROPERLY DOUBLE-QUOTED AND ESCAPED
3. NO CONTROL CHARACTERS (newlines, tabs, carriage returns) WITHIN STRING VALUES
4. NO UNESCAPED QUOTES OR BACKSLASHES WITHIN STRING VALUES
5. ALL STRINGS MUST BE TERMINATED PROPERLY - NO UNTERMINATED STRINGS
6. USE \\n for line breaks within strings, \\t for tabs, \\" for quotes
7. ENSURE PROPER COMMA PLACEMENT - NO TRAILING COMMAS
8. THE RESPONSE MUST START WITH '[' AND END WITH ']'
9. EACH OBJECT MUST BE PROPERLY CLOSED WITH '}'
10. ALL PROPERTY NAMES MUST BE DOUBLE-QUOTED

FORMATTING EXAMPLE FOR STRING VALUES:
- CORRECT: "This is a proper string with \\"escaped quotes\\" and \\n line breaks"
- INCORRECT: "This is improper with "unescaped quotes" and 
actual line breaks"

CRITICAL INSTRUCTION: You must respond with ONLY the JSON array. Do not include any conversational text, explanations, introductions, or markdown formatting. Start your response immediately with '[' and end with ']'. No other text should be included in your response. The JSON must be valid and parseable by standard JSON parsers.

Generate exactly ${targetCount} additional synthetic Q&A pairs (with a small portion being incorrect) as a pure, valid JSON array:
    `.trim();

    try {
      console.log('[OPENROUTER] Sending synthetic Q&A generation request');
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.7); // Moderate temperature for creative but accurate generation

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
        typeof pair.targetGap === 'string' &&
        pair.user.trim().length > 0 &&
        pair.model.trim().length > 0
      ).map(pair => ({
        ...pair,
        source: 'synthetic' as const,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        validationStatus: 'pending' as const
      })).slice(0, targetCount);

      console.log('[OPENROUTER] Synthetic Q&A generation completed:', {
        requested: targetCount,
        generated: syntheticPairs.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      return validPairs;

    } catch (error: any) {
      console.error('[OPENROUTER] Synthetic Q&A generation failed:', error);
      throw new Error(`Synthetic Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }
}

export const openRouterService = new OpenRouterService();