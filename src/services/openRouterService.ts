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

    // Enhanced JSON cleanup for common formatting issues
    jsonStr = jsonStr
      // Remove any trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix common escape sequence issues
      .replace(/\\n/g, '\\n')  // Ensure newlines are properly escaped
      .replace(/\\t/g, '\\t')  // Ensure tabs are properly escaped
      .replace(/\\r/g, '\\r')  // Ensure carriage returns are properly escaped
      // Fix unescaped quotes within strings (this is tricky and might need refinement)
      .replace(/"([^"]*)"([^"]*)"([^"]*)":/g, '"$1\\"$2\\"$3":')
      // Remove any control characters that might break JSON parsing
      .replace(/[\x00-\x1F\x7F]/g, '');

    // Additional attempt to fix malformed JSON by finding and fixing common issues
    try {
      // First attempt: try parsing as-is
      const parsed = JSON.parse(jsonStr);
      
      // Validate that it's an array
      if (!Array.isArray(parsed)) {
        console.error('[OPENROUTER] Response is not a JSON array:', typeof parsed);
        throw new Error('Response is not a JSON array');
      }
      
      console.log('[OPENROUTER] Successfully parsed JSON array with', parsed.length, 'items');
      return parsed;
    } catch (firstError) {
      console.warn('[OPENROUTER] First parsing attempt failed, trying recovery methods');
      
      // Second attempt: try to fix truncated JSON
      try {
        // If the JSON appears to be truncated, try to close it properly
        let fixedJson = jsonStr;
        
        // Count opening and closing brackets/braces to detect truncation
        const openBrackets = (fixedJson.match(/\[/g) || []).length;
        const closeBrackets = (fixedJson.match(/\]/g) || []).length;
        const openBraces = (fixedJson.match(/\{/g) || []).length;
        const closeBraces = (fixedJson.match(/\}/g) || []).length;
        
        console.log('[OPENROUTER] Bracket/brace count:', { openBrackets, closeBrackets, openBraces, closeBraces });
        
        // If we have unmatched brackets/braces, try to fix them
        if (openBraces > closeBraces) {
          const missingBraces = openBraces - closeBraces;
          console.log('[OPENROUTER] Adding', missingBraces, 'missing closing braces');
          fixedJson += '}'.repeat(missingBraces);
        }
        
        if (openBrackets > closeBrackets) {
          const missingBrackets = openBrackets - closeBrackets;
          console.log('[OPENROUTER] Adding', missingBrackets, 'missing closing brackets');
          fixedJson += ']'.repeat(missingBrackets);
        }
        
        // Try parsing the fixed JSON
        const parsed = JSON.parse(fixedJson);
        
        if (!Array.isArray(parsed)) {
          throw new Error('Fixed response is not a JSON array');
        }
        
        console.log('[OPENROUTER] Successfully parsed fixed JSON array with', parsed.length, 'items');
        return parsed;
        
      } catch (secondError) {
        console.error('[OPENROUTER] Second parsing attempt also failed');
        
        // Third attempt: try to extract valid JSON objects manually
        try {
          console.log('[OPENROUTER] Attempting manual JSON object extraction');
          
          // Look for individual JSON objects within the response
          const objectMatches = jsonStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          
          if (objectMatches && objectMatches.length > 0) {
            console.log('[OPENROUTER] Found', objectMatches.length, 'potential JSON objects');
            
            const validObjects = [];
            for (const objStr of objectMatches) {
              try {
                const obj = JSON.parse(objStr);
                if (obj && typeof obj === 'object' && obj.user && obj.model) {
                  validObjects.push(obj);
                }
              } catch {
                // Skip invalid objects
              }
            }
            
            if (validObjects.length > 0) {
              console.log('[OPENROUTER] Extracted', validObjects.length, 'valid objects');
              return validObjects;
            }
          }
          
          // If all else fails, throw the original error with detailed information
          throw firstError;
          
        } catch (thirdError) {
          console.error('[OPENROUTER] All parsing attempts failed');
          console.error('[OPENROUTER] Original error:', firstError.message);
          console.error('[OPENROUTER] Raw response (first 1000 chars):', responseText.substring(0, 1000));
          console.error('[OPENROUTER] Processed JSON string (first 1000 chars):', jsonStr.substring(0, 1000));
          
          // Try to find the exact position where JSON parsing failed
          try {
            for (let i = 100; i < Math.min(jsonStr.length, 1000); i += 100) {
              try {
                JSON.parse(jsonStr.substring(0, i));
              } catch (e) {
                console.error('[OPENROUTER] JSON parsing failed around position', i);
                console.error('[OPENROUTER] Character at position:', jsonStr.charAt(i));
                console.error('[OPENROUTER] Context:', jsonStr.substring(Math.max(0, i - 50), i + 50));
                break;
              }
            }
          } catch (e) {
            console.error('[OPENROUTER] Could not determine exact parsing error position');
          }
          
          throw new Error(`Invalid JSON response from OpenRouter: ${firstError.message}. Response preview: ${responseText.substring(0, 200)}...`);
        }
      }
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

CRITICAL JSON FORMATTING REQUIREMENTS:
1. Respond with ONLY a valid JSON array - no other text
2. Start with [ and end with ]
3. All strings must be properly escaped
4. Use double quotes for all strings
5. No unescaped newlines, tabs, or quotes in string values
6. Replace actual newlines with \\n, tabs with \\t, quotes with \\"
7. Ensure all objects are properly closed
8. No trailing commas

Example format:
[
  {
    "user": "What is the main concept?",
    "model": "The main concept is...",
    "isCorrect": true,
    "confidence": 0.9,
    "targetGap": "gap_1",
    "generationReasoning": "Addresses core understanding gap"
  }
]

REFERENCE CONTENT:
---
${combinedContent.substring(0, 8000)}${combinedContent.length > 8000 ? '...' : ''}
---

Generate exactly ${targetCount} additional synthetic Q&A pairs as a valid JSON array:
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