import { QAPair, GroundingMetadata, FineTuningGoal, KnowledgeGap } from '../types/index';
import { FINE_TUNING_GOALS, INCORRECT_ANSWER_RATIO } from '../constants/index';
import { openRouterService } from './openRouterService';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

class GeminiService {
  private baseUrl = '/.netlify/functions/gemini-chat';

  async generateQAPairs(
    content: string,
    fineTuningGoal: FineTuningGoal,
    targetCount: number = 50
  ): Promise<QAPair[]> {
    try {
      console.log('[GEMINI_SERVICE] Starting Q&A generation', {
        contentLength: content.length,
        fineTuningGoal,
        targetCount
      });

      // Validate content size (1MB limit)
      if (content.length > 1024 * 1024) {
        throw new Error('Content too large for processing (max 1MB)');
      }

      const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
      if (!goalConfig) {
        throw new Error(`Invalid fine-tuning goal: ${fineTuningGoal}`);
      }

      const prompt = this.buildQAPrompt(content, goalConfig, targetCount);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          maxTokens: 8192,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[GEMINI_SERVICE] API request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });

        // Check if we should fallback to OpenRouter
        if (this.shouldFallbackToOpenRouter(response.status, errorText)) {
          console.log('[GEMINI_SERVICE] Falling back to OpenRouter service');
          return await openRouterService.generateQAPairs(content, fineTuningGoal, targetCount);
        }

        throw new Error(`Gemini service request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[GEMINI_SERVICE] Raw API response received');

      const qaPairs = this.parseQAResponse(data, fineTuningGoal);
      
      if (qaPairs.length === 0) {
        console.warn('[GEMINI_SERVICE] No Q&A pairs generated, falling back to OpenRouter');
        return await openRouterService.generateQAPairs(content, fineTuningGoal, targetCount);
      }

      console.log('[GEMINI_SERVICE] Successfully generated Q&A pairs:', qaPairs.length);
      return qaPairs;

    } catch (error) {
      console.error('[GEMINI_SERVICE] Q&A generation failed:', error);
      
      // Try OpenRouter as fallback
      try {
        console.log('[GEMINI_SERVICE] Attempting OpenRouter fallback');
        return await openRouterService.generateQAPairs(content, fineTuningGoal, targetCount);
      } catch (fallbackError) {
        console.error('[GEMINI_SERVICE] OpenRouter fallback also failed:', fallbackError);
        throw new Error(`Q&A generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async identifyKnowledgeGaps(
    content: string,
    existingQAPairs: QAPair[],
    fineTuningGoal: FineTuningGoal
  ): Promise<KnowledgeGap[]> {
    try {
      console.log('[GEMINI_SERVICE] Identifying knowledge gaps', {
        contentLength: content.length,
        existingPairs: existingQAPairs.length,
        fineTuningGoal
      });

      const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
      const prompt = this.buildGapAnalysisPrompt(content, existingQAPairs, goalConfig);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          maxTokens: 4096,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[GEMINI_SERVICE] Gap analysis request failed:', {
          status: response.status,
          error: errorText
        });

        // Fallback to OpenRouter
        return await openRouterService.identifyKnowledgeGaps(content, existingQAPairs, fineTuningGoal);
      }

      const data = await response.json();
      const gaps = this.parseGapAnalysisResponse(data);

      console.log('[GEMINI_SERVICE] Knowledge gaps identified:', gaps.length);
      return gaps;

    } catch (error) {
      console.error('[GEMINI_SERVICE] Gap analysis failed:', error);
      
      // Fallback to OpenRouter
      try {
        return await openRouterService.identifyKnowledgeGaps(content, existingQAPairs, fineTuningGoal);
      } catch (fallbackError) {
        console.error('[GEMINI_SERVICE] OpenRouter gap analysis fallback failed:', fallbackError);
        throw new Error(`Knowledge gap analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private buildQAPrompt(content: string, goalConfig: any, targetCount: number): string {
    return `You are an expert AI trainer creating high-quality question-answer pairs for fine-tuning a language model.

GOAL: ${goalConfig.name}
DESCRIPTION: ${goalConfig.description}
FOCUS AREAS: ${goalConfig.focusAreas.join(', ')}

CONTENT TO ANALYZE:
${content}

INSTRUCTIONS:
1. Generate exactly ${targetCount} diverse, high-quality question-answer pairs
2. Focus on ${goalConfig.focusAreas.join(', ')}
3. Ensure questions are specific, clear, and answerable from the content
4. Provide comprehensive, accurate answers
5. Include a mix of difficulty levels
6. Vary question types (factual, analytical, conceptual, practical)

REQUIRED JSON FORMAT:
{
  "qaPairs": [
    {
      "question": "Clear, specific question here",
      "answer": "Comprehensive, accurate answer here",
      "difficulty": "easy|medium|hard",
      "category": "factual|analytical|conceptual|practical",
      "grounding": {
        "sourceRelevance": 0.95,
        "factualAccuracy": 0.98,
        "completeness": 0.92
      }
    }
  ]
}

Generate exactly ${targetCount} Q&A pairs in valid JSON format:`;
  }

  private buildGapAnalysisPrompt(content: string, existingQAPairs: QAPair[], goalConfig: any): string {
    const existingTopics = existingQAPairs.map(qa => `Q: ${qa.question}`).join('\n');
    
    return `Analyze the content and existing Q&A pairs to identify knowledge gaps.

CONTENT:
${content}

EXISTING Q&A TOPICS:
${existingTopics}

GOAL: ${goalConfig.name}
FOCUS AREAS: ${goalConfig.focusAreas.join(', ')}

Identify 5-10 important knowledge gaps that should be addressed with additional Q&A pairs.

REQUIRED JSON FORMAT:
{
  "gaps": [
    {
      "topic": "Specific topic or concept",
      "description": "Why this gap is important",
      "priority": "high|medium|low",
      "suggestedQuestions": ["Question 1", "Question 2"]
    }
  ]
}

Provide response in valid JSON format:`;
  }

  private parseQAResponse(data: any, fineTuningGoal: FineTuningGoal): QAPair[] {
    try {
      let responseText = '';
      
      // Extract text from Gemini response format
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        responseText = data.candidates[0].content.parts[0].text;
      } else if (typeof data === 'string') {
        responseText = data;
      } else if (data.text) {
        responseText = data.text;
      } else {
        console.error('[GEMINI_SERVICE] Unexpected response format:', data);
        return [];
      }

      console.log('[GEMINI_SERVICE] Parsing response text:', responseText.substring(0, 200) + '...');

      // Try to parse JSON with multiple recovery strategies
      const parsed = this.parseJSONWithRecovery(responseText);
      
      if (!parsed || !parsed.qaPairs || !Array.isArray(parsed.qaPairs)) {
        console.error('[GEMINI_SERVICE] Invalid Q&A response structure:', parsed);
        return [];
      }

      // Process and validate Q&A pairs
      const qaPairs: QAPair[] = parsed.qaPairs
        .filter((qa: any) => qa.question && qa.answer)
        .map((qa: any, index: number) => ({
          id: `gemini-${Date.now()}-${index}`,
          question: qa.question.trim(),
          answer: qa.answer.trim(),
          difficulty: qa.difficulty || 'medium',
          category: qa.category || 'factual',
          source: 'gemini',
          fineTuningGoal,
          grounding: qa.grounding || {
            sourceRelevance: 0.85,
            factualAccuracy: 0.90,
            completeness: 0.85
          },
          isIncorrect: Math.random() < INCORRECT_ANSWER_RATIO
        }));

      console.log('[GEMINI_SERVICE] Parsed Q&A pairs:', qaPairs.length);
      return qaPairs;

    } catch (error) {
      console.error('[GEMINI_SERVICE] Failed to parse Q&A response:', error);
      return [];
    }
  }

  private parseGapAnalysisResponse(data: any): KnowledgeGap[] {
    try {
      let responseText = '';
      
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        responseText = data.candidates[0].content.parts[0].text;
      } else if (typeof data === 'string') {
        responseText = data;
      } else if (data.text) {
        responseText = data.text;
      }

      const parsed = this.parseJSONWithRecovery(responseText);
      
      if (!parsed || !parsed.gaps || !Array.isArray(parsed.gaps)) {
        console.error('[GEMINI_SERVICE] Invalid gap analysis response structure:', parsed);
        return [];
      }

      return parsed.gaps
        .filter((gap: any) => gap.topic && gap.description)
        .map((gap: any, index: number) => ({
          id: `gap-${Date.now()}-${index}`,
          topic: gap.topic.trim(),
          description: gap.description.trim(),
          priority: gap.priority || 'medium',
          suggestedQuestions: gap.suggestedQuestions || []
        }));

    } catch (error) {
      console.error('[GEMINI_SERVICE] Failed to parse gap analysis response:', error);
      return [];
    }
  }

  private parseJSONWithRecovery(text: string): any {
    // Strategy 1: Direct JSON parse
    try {
      return JSON.parse(text);
    } catch (e) {
      console.log('[GEMINI_SERVICE] Direct JSON parse failed, trying recovery strategies');
    }

    // Strategy 2: Extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1]);
      } catch (e) {
        console.log('[GEMINI_SERVICE] Code block JSON parse failed');
      }
    }

    // Strategy 3: Find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.log('[GEMINI_SERVICE] JSON object extraction failed');
      }
    }

    // Strategy 4: Fix common JSON issues
    try {
      let fixedText = text
        .replace(/```json\s*/, '')
        .replace(/```\s*$/, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
        .trim();

      return JSON.parse(fixedText);
    } catch (e) {
      console.log('[GEMINI_SERVICE] JSON fixing failed');
    }

    // Strategy 5: Last resort - return empty structure
    console.error('[GEMINI_SERVICE] All JSON parsing strategies failed');
    return null;
  }

  private shouldFallbackToOpenRouter(status: number, errorText: string): boolean {
    // Fallback conditions
    const fallbackStatuses = [429, 500, 502, 503, 504];
    const fallbackKeywords = ['quota', 'rate limit', 'unavailable', 'timeout'];
    
    return fallbackStatuses.includes(status) || 
           fallbackKeywords.some(keyword => errorText.toLowerCase().includes(keyword));
  }
}

export const geminiService = new GeminiService();