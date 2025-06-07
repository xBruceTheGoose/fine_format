import { KnowledgeGap, SyntheticQAPair, QAPair, FineTuningGoal } from '../types';
import { FINE_TUNING_GOALS, SYNTHETIC_QA_TARGET } from '../constants';

class OpenRouterService {
  private apiKey: string | null = null;
  private isInitialized = false;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    
    if (!apiKey?.trim()) {
      console.error('OpenRouter API key not found in environment variables');
      return;
    }

    this.apiKey = apiKey.trim();
    this.isInitialized = true;
  }

  public isReady(): boolean {
    return this.isInitialized && this.apiKey !== null;
  }

  private async makeRequest(messages: Array<{ role: string; content: string }>, temperature = 0.7): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenRouter service not initialized');
    }

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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from OpenRouter API');
    }

    return data.choices[0].message.content;
  }

  private parseJsonResponse(responseText: string): any {
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
    }

    // Try to extract JSON from response that might contain conversational text
    // Look for the first occurrence of '[' and the last occurrence of ']'
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && firstBracket < lastBracket) {
      jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse JSON response from OpenRouter:', error);
      throw new Error(`Invalid JSON response from OpenRouter: ${responseText.substring(0, 200)}...`);
    }
  }

  public async cleanContent(
    content: string,
    fileName: string,
    contentType: 'text' | 'url' | 'multimodal' = 'text'
  ): Promise<string> {
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
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.3); // Lower temperature for more consistent cleaning

      return response.trim();
    } catch (error: any) {
      console.error('Content cleaning failed:', error);
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
2. These are SUPPLEMENTARY pairs - avoid duplicating coverage from the existing 100 pairs
3. Questions should be natural, diverse, and aligned with ${goalConfig?.name} objectives
4. Answers must be accurate, comprehensive, and based on the provided content
5. Include both correct answers (80%) and strategically incorrect answers (20%)
6. Vary question complexity and types based on each gap's suggested question types
7. Ensure answers demonstrate the desired ${goalConfig?.promptFocus}
8. Focus specifically on filling the identified knowledge gaps with unique perspectives

QUALITY STANDARDS:
- Questions should feel natural and user-generated
- Answers should be informative and well-structured
- Incorrect answers should be plausible but contain subtle factual errors
- Each Q&A should clearly address its target knowledge gap
- Maintain consistency with the fine-tuning goal throughout
- Provide unique value beyond the existing 100 Q&A pairs

For each Q&A pair, provide:
- Natural user question targeting the specific gap
- Comprehensive answer based on content
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

CRITICAL INSTRUCTION: You must respond with ONLY the JSON array. Do not include any conversational text, explanations, introductions, or markdown formatting. Start your response immediately with '[' and end with ']'. No other text should be included in your response.

Generate exactly ${targetCount} additional synthetic Q&A pairs as a pure JSON array:
    `.trim();

    try {
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.7); // Moderate temperature for creative but accurate generation

      const syntheticPairs = this.parseJsonResponse(response);

      if (!Array.isArray(syntheticPairs)) {
        throw new Error('Response is not a valid JSON array');
      }

      return syntheticPairs.filter((pair): pair is SyntheticQAPair =>
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

    } catch (error: any) {
      console.error('Synthetic Q&A generation failed:', error);
      throw new Error(`Synthetic Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }
}

export const openRouterService = new OpenRouterService();