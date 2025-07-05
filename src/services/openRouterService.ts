import { KnowledgeGap, SyntheticQAPair, QAPair, FineTuningGoal, ValidationResult } from '../types';
import { FINE_TUNING_GOALS, SYNTHETIC_QA_TARGET, INCORRECT_ANSWER_RATIO } from '../constants';

class OpenRouterService {
  private baseUrl = '/.netlify/functions/openrouter-chat';

  constructor() {
    console.log('[OPENROUTER] Service initialized - using Netlify functions');
  }

  public isReady(): boolean {
    return true;
  }

  // Expose makeRequest method for fallback usage
  public async makeRequest(
    messages: Array<{ role: string; content: string }>, 
    temperature = 0.7,
    maxTokens = 4000
  ): Promise<string> {
    return this.makeRequestInternal(messages, temperature, maxTokens);
  }

  // Expose parseJsonResponse method for fallback usage
  public parseJsonResponse(responseText: string): any {
    return this.parseJsonResponseInternal(responseText);
  }

  private async makeRequestInternal(
    messages: Array<{ role: string; content: string }>, 
    temperature = 0.7,
    maxTokens = 4000
  ): Promise<string> {
    console.log('[OPENROUTER] Making request to Netlify function with', messages.length, 'messages, max tokens:', maxTokens);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens: maxTokens
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Netlify function error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.content) {
        throw new Error('No content received from Netlify function');
      }

      console.log('[OPENROUTER] Request successful, response length:', data.content.length);
      return data.content;

    } catch (error: any) {
      console.error('[OPENROUTER] Request failed:', error);
      throw new Error(`OpenRouter service request failed: ${error.message || 'Unknown error'}`);
    }
  }

  private parseJsonResponseInternal(responseText: string): any {
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
      
      // Safe error logging to prevent crashes during debugging
      try {
        const positionMatch = stage1Error.message.match(/position (\d+)/);
        if (positionMatch) {
          const position = parseInt(positionMatch[1], 10);
          console.error('[OPENROUTER] JSON parsing failed around position', position);
          
          if (position >= 0 && position < jsonStr.length) {
            console.error('[OPENROUTER] character:', jsonStr.charAt(position));
            const start = Math.max(0, position - 50);
            const end = Math.min(jsonStr.length, position + 50);
            console.error('[OPENROUTER] Context:', jsonStr.substring(start, end));
          }
        }
      } catch (loggingError) {
        console.warn('[OPENROUTER] Error during debug logging:', loggingError.message);
      }
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

  public async generateValidationContext(
    combinedContent: string,
    identifiedThemes: string[],
    initialQAPairs: QAPair[],
    identifiedGaps: KnowledgeGap[],
    allSyntheticPairs: SyntheticQAPair[],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<string> {
    console.log('[OPENROUTER] Generating validation context for synthetic Q&A pairs');
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    
    // Extract key concepts and sample Q&A pairs instead of using full content
    const sampleQAPairs = initialQAPairs.slice(0, 10).map(pair => 
      `Q: ${pair.user}\nA: ${pair.model} (${pair.isCorrect ? 'Correct' : 'Incorrect'})`
    ).join('\n\n');
    
    const keyThemes = identifiedThemes.join(', ');
    
    const gapDescriptions = identifiedGaps.map(gap => 
      `• ${gap.id}: ${gap.description} (${gap.theme}, Priority: ${gap.priority})`
    ).join('\n');
    
    const systemPrompt = `You are an expert dataset analyst and validation specialist. Your task is to create a comprehensive validation reference that will be used to efficiently validate synthetic Q&A pairs.

EXPERTISE AREAS:
- Domain knowledge extraction and synthesis
- Quality assessment frameworks
- Fine-tuning dataset optimization
- Knowledge gap analysis
- Factual accuracy verification

OBJECTIVE: Create a concise but comprehensive validation context that captures all essential information needed to validate synthetic Q&A pairs without requiring access to the full original content.`;

    const userPrompt = `Create a comprehensive validation context for synthetic Q&A pair validation.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

DATASET OVERVIEW:
- Original content themes: ${keyThemes}
- Initial Q&A pairs: ${initialQAPairs.length} (${initialQAPairs.filter(p => p.isCorrect).length} correct, ${initialQAPairs.filter(p => !p.isCorrect).length} incorrect)
- Knowledge gaps identified: ${identifiedGaps.length}
- Synthetic pairs to validate: ${allSyntheticPairs.length}

KNOWLEDGE GAPS TO ADDRESS:
${gapDescriptions}

SAMPLE Q&A PAIRS FROM INITIAL DATASET:
---
${sampleQAPairs}
---

VALIDATION CONTEXT REQUIREMENTS:

1. **CORE KNOWLEDGE BASE**
   - Extract and synthesize key factual information based on the themes and sample Q&A pairs
   - Identify authoritative statements and data points
   - Note important relationships and dependencies
   - Highlight domain-specific terminology and concepts

2. **QUALITY STANDARDS** (based on initial dataset)
   - Question complexity and clarity standards
   - Answer completeness and accuracy requirements
   - Appropriate level of detail for the domain
   - Consistency in tone and style

3. **GAP-SPECIFIC VALIDATION CRITERIA**
   - For each knowledge gap, define what constitutes effective coverage
   - Specify the types of questions that would address each gap
   - Identify key concepts that synthetic pairs should demonstrate

4. **FINE-TUNING ALIGNMENT**
   - Ensure synthetic pairs support the ${goalConfig?.name} objective
   - Validate alignment with ${goalConfig?.promptFocus}
   - Check for appropriate difficulty progression
   - Verify relevance to the target use case

5. **VALIDATION GUIDELINES**
   - Clear criteria for factual accuracy assessment
   - Standards for relevance and usefulness
   - Guidelines for identifying high-quality vs. low-quality pairs
   - Red flags that indicate problematic content

Create a structured validation context (1500-2000 words) that will serve as the primary reference for validating each synthetic Q&A pair efficiently and accurately.`;

    try {
      console.log('[OPENROUTER] Sending validation context generation request');
      
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.3, 3500);

      console.log('[OPENROUTER] Validation context generated successfully, length:', response.length);
      return response.trim();

    } catch (error: any) {
      console.error('[OPENROUTER] Validation context generation failed:', error);
      throw new Error(`Validation context generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async validateQAPair(
    syntheticPair: SyntheticQAPair,
    validationContext: string,
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<ValidationResult> {
    console.log(`[OPENROUTER] Validating Q&A pair using generated validation context`);
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);

    const systemPrompt = `You are an expert fact-checker and Q&A validator specializing in fine-tuning dataset quality assurance.

EXPERTISE:
- Factual accuracy verification
- Content relevance assessment
- Quality standard enforcement
- Knowledge gap coverage evaluation
- Fine-tuning dataset optimization

TASK: Validate a synthetic Q&A pair against the provided validation context and return a precise JSON assessment.`;

    const userPrompt = `Validate this synthetic Q&A pair against the validation context.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

SYNTHETIC Q&A PAIR:
Question: "${syntheticPair.user}"
Answer: "${syntheticPair.model}"
Claimed Correctness: ${syntheticPair.isCorrect ? 'CORRECT' : 'INCORRECT'}
Target Gap: ${syntheticPair.targetGap}
Generation Reasoning: ${syntheticPair.generationReasoning || 'Not provided'}

VALIDATION CONTEXT:
---
${validationContext}
---

VALIDATION CRITERIA:
1. **Factual Accuracy**: Is the answer factually correct based on the validation context?
2. **Relevance**: Does the Q&A pair align with the ${goalConfig?.name} objective?
3. **Quality**: Is the answer comprehensive, clear, and well-structured?
4. **Consistency**: Does the claimed correctness match the actual accuracy?
5. **Gap Alignment**: Does this pair effectively address the target knowledge gap?
6. **Fine-tuning Value**: Will this improve model performance for ${goalConfig?.promptFocus}?

Respond with ONLY a valid JSON object:
{
  "isValid": boolean,
  "confidence": number,
  "reasoning": "Brief explanation",
  "suggestedCorrection": "If invalid, suggest correction",
  "factualAccuracy": number,
  "relevanceScore": number
}`;

    try {
      console.log(`[OPENROUTER] Sending validation request using validation context`);
      
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.2, 1000);

      console.log(`[OPENROUTER] Received validation response, parsing JSON`);
      
      // Parse JSON response for validation
      let jsonStr = response.trim();
      
      // Remove code fences if present
      const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match?.[1]) {
        jsonStr = match[1].trim();
      }

      // Look for JSON object boundaries
      const objectStart = jsonStr.indexOf('{');
      const objectEnd = jsonStr.lastIndexOf('}');
      
      if (objectStart !== -1 && objectEnd !== -1 && objectStart < objectEnd) {
        jsonStr = jsonStr.substring(objectStart, objectEnd + 1);
      }

      const validation = JSON.parse(jsonStr);

      // Validate the response structure
      if (typeof validation.isValid !== 'boolean' ||
          typeof validation.confidence !== 'number' ||
          typeof validation.reasoning !== 'string' ||
          typeof validation.factualAccuracy !== 'number' ||
          typeof validation.relevanceScore !== 'number') {
        throw new Error('Invalid validation response structure');
      }

      console.log(`[OPENROUTER] Validation successful: valid=${validation.isValid}, confidence=${validation.confidence}`);

      return {
        isValid: validation.isValid,
        confidence: Math.max(0, Math.min(1, validation.confidence)),
        reasoning: validation.reasoning,
        suggestedCorrection: validation.suggestedCorrection || undefined,
        factualAccuracy: Math.max(0, Math.min(1, validation.factualAccuracy)),
        relevanceScore: Math.max(0, Math.min(1, validation.relevanceScore))
      };

    } catch (error: any) {
      console.error('[OPENROUTER] Q&A validation failed:', error);
      return {
        isValid: false,
        confidence: 0.1,
        reasoning: `Validation failed due to error: ${error.message || 'Unknown error'}`,
        factualAccuracy: 0.1,
        relevanceScore: 0.1
      };
    }
  }

  public async generateSyntheticQAPairsForGap(
    combinedContent: string,
    knowledgeGap: KnowledgeGap,
    fineTuningGoal: FineTuningGoal = 'knowledge',
    maxPairsToRequestThisCall: number = 15
  ): Promise<SyntheticQAPair[]> {
    console.log(`[OPENROUTER] Generating up to ${maxPairsToRequestThisCall} synthetic Q&A pairs for gap: ${knowledgeGap.id}`);
    
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const incorrectCountTarget = Math.max(1, Math.ceil(maxPairsToRequestThisCall * INCORRECT_ANSWER_RATIO));
    const correctCountTarget = maxPairsToRequestThisCall - incorrectCountTarget;

    const systemPrompt = `You are an expert synthetic Q&A generator specializing in creating high-quality training data for fine-tuning language models. Your goal is to generate as many relevant and high-quality Q&A pairs as possible to address the specified knowledge gap, up to the requested maximum.

EXPERTISE:
- Domain knowledge synthesis
- Question generation across difficulty levels
- Answer quality optimization
- Knowledge gap targeting
- Fine-tuning dataset construction

OBJECTIVE: Generate as many high-quality synthetic Q&A pairs as possible (up to ${maxPairsToRequestThisCall}) that specifically address the identified knowledge gap. Prioritize relevance and quality for ${goalConfig?.name} fine-tuning.

QUALITY STANDARDS:
- Questions must be natural, clear, and appropriately challenging.
- Answers must be comprehensive yet concise, grounded in the reference material.
- Incorrect answers should be plausible but clearly wrong.
- All pairs must directly and effectively address the specified knowledge gap.`;

    const userPrompt = `Generate as many high-quality synthetic Q&A pairs as you can (up to a maximum of ${maxPairsToRequestThisCall}) to address this specific knowledge gap. If generating multiple pairs, aim for a mix of roughly ${correctCountTarget} correct and ${incorrectCountTarget} incorrect answers, but prioritize quality and relevance over exact counts.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

TARGET KNOWLEDGE GAP:
ID: ${knowledgeGap.id}
Description: ${knowledgeGap.description}
Theme: ${knowledgeGap.theme}
Priority: ${knowledgeGap.priority}
Suggested Question Types: ${knowledgeGap.suggestedQuestionTypes.join(', ')}
Related Concepts: ${knowledgeGap.relatedConcepts.join(', ')}

GENERATION REQUIREMENTS:
- Generate as many relevant and high-quality Q&A pairs as the content and gap allow, up to ${maxPairsToRequestThisCall}.
- If generating multiple pairs, aim for a mix of approximately ${correctCountTarget} correct and ${incorrectCountTarget} incorrect answers.
- Questions should vary in complexity and approach.
- Cover different aspects of the knowledge gap thoroughly.
- Ensure answers are appropriate for the ${goalConfig?.name} objective.
- Incorrect answers should be plausible but factually wrong.
- All content must be grounded in the provided reference material.

REFERENCE CONTENT:
---
${combinedContent.substring(0, 6000)}${combinedContent.length > 6000 ? '\n[Content truncated for generation focus]' : ''}
---

CRITICAL JSON FORMAT REQUIREMENTS:
1. Respond with ONLY a valid JSON array
2. No explanations, markdown, or code blocks
3. Start immediately with [ and end with ]
4. Each object must have: "user", "model", "isCorrect", "confidence", "targetGap", "generationReasoning"
5. Properly escape all strings (use \\" for quotes, \\n for newlines)
6. No unescaped control characters

EXAMPLE FORMAT:
[
  {
    "user": "What is the primary concept discussed in relation to [topic]?",
    "model": "The primary concept is [detailed answer based on reference content]",
    "isCorrect": true,
    "confidence": 0.9,
    "targetGap": "${knowledgeGap.id}",
    "generationReasoning": "Addresses core understanding gap in ${knowledgeGap.theme}"
  }
]

Generate Q&A pairs now:`;

    try {
      console.log(`[OPENROUTER] Sending request for gap ${knowledgeGap.id} using Nvidia Nemotron model`);
      
      const response = await this.makeRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.6, 5000);

      console.log(`[OPENROUTER] Received response for gap ${knowledgeGap.id}, parsing JSON`);
      
      let syntheticPairs: any[];
      try {
        syntheticPairs = this.parseJsonResponseInternal(response);
      } catch (parseError) {
        console.error(`[OPENROUTER] Failed to parse JSON response for gap ${knowledgeGap.id}:`, parseError.message);
        console.warn(`[OPENROUTER] Returning empty array for gap ${knowledgeGap.id} due to parsing failure`);
        return [];
      }

      if (!Array.isArray(syntheticPairs)) {
        console.error(`[OPENROUTER] Response for gap ${knowledgeGap.id} is not a valid JSON array`);
        return [];
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
      }));

      console.log(`[OPENROUTER] Gap ${knowledgeGap.id} generation completed:`, {
        requested: maxPairsToRequestThisCall,
        generated: syntheticPairs.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      if (validPairs.length === 0) {
        console.warn(`[OPENROUTER] No valid Q&A pairs could be extracted for gap ${knowledgeGap.id}`);
        return [];
      }

      return validPairs;

    } catch (error: any) {
      console.error(`[OPENROUTER] Synthetic Q&A generation failed for gap ${knowledgeGap.id}:`, error);
      console.warn(`[OPENROUTER] Returning empty array for gap ${knowledgeGap.id} due to generation failure`);
      return [];
    }
  }

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

    const totalGaps = knowledgeGaps.length;
    const maxPairsToRequestPerGapCall = Math.min(15, Math.ceil(targetCount / totalGaps));
    let allSyntheticPairs: SyntheticQAPair[] = [];
    const failedGaps: string[] = [];

    console.log(`[OPENROUTER] Processing ${totalGaps} gaps, requesting up to ${maxPairsToRequestPerGapCall} pairs per gap.`);

    for (let i = 0; i < totalGaps; i++) {
      const gap = knowledgeGaps[i];
      
      try {
        console.log(`[OPENROUTER] Processing gap ${i + 1}/${totalGaps}: ${gap.id}`);
        if (onProgress) {
          onProgress(i, totalGaps, gap.id);
        }

        const gapPairs = await this.generateSyntheticQAPairsForGap(
          combinedContent,
          gap,
          fineTuningGoal,
          maxPairsToRequestPerGapCall
        );

        if (gapPairs.length > 0) {
          allSyntheticPairs.push(...gapPairs);
          console.log(`[OPENROUTER] Successfully generated ${gapPairs.length} pairs for gap ${gap.id}`);
        } else {
          console.warn(`[OPENROUTER] No synthetic pairs generated for gap ${gap.id}`);
        }

        if (i < totalGaps - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

      } catch (error: any) {
        console.error(`[OPENROUTER] Failed to generate pairs for gap ${gap.id}:`, error);
        failedGaps.push(gap.id);
      }
    }

    if (onProgress) {
      onProgress(totalGaps, totalGaps, 'completed');
    }

    console.log('[OPENROUTER] Individual gap processing completed:', {
      totalGaps: totalGaps,
      successfulGaps: totalGaps - failedGaps.length,
      failedGaps: failedGaps.length,
      totalPairsGenerated: allSyntheticPairs.length,
      correctPairs: allSyntheticPairs.filter(p => p.isCorrect).length,
      incorrectPairs: allSyntheticPairs.filter(p => !p.isCorrect).length
    });

    if (failedGaps.length > 0) {
      console.warn('[OPENROUTER] Some gaps failed to generate pairs:', failedGaps);
    }

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