import { QAPair, GroundingMetadata, FineTuningGoal, KnowledgeGap } from '../types/index';
import { FINE_TUNING_GOALS, INCORRECT_ANSWER_RATIO } from '../constants/index';
import { openRouterService } from './openRouterService';

class GeminiService {
  private baseUrl = '/.netlify/functions/gemini-chat';

  async generateQAPairs(
    content: string,
    fineTuningGoal: FineTuningGoal,
    count: number = 10
  ): Promise<QAPair[]> {
    try {
      console.log(`[GEMINI_SERVICE] Generating ${count} Q&A pairs for goal: ${fineTuningGoal}`);
      
      const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
      if (!goalConfig) {
        throw new Error(`Invalid fine-tuning goal: ${fineTuningGoal}`);
      }

      const prompt = this.buildQAPrompt(content, goalConfig, count);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          temperature: 0.7,
          maxTokens: 4000
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GEMINI_SERVICE] API error: ${response.status} - ${errorText}`);
        throw new Error(`Gemini service request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('No response from Gemini service');
      }

      const qaPairs = this.parseQAPairs(data.response);
      
      if (qaPairs.length === 0) {
        throw new Error('No valid Q&A pairs generated');
      }

      console.log(`[GEMINI_SERVICE] Successfully generated ${qaPairs.length} Q&A pairs`);
      return qaPairs;

    } catch (error) {
      console.error('[GEMINI_SERVICE] Error generating Q&A pairs:', error);
      
      // Fallback to OpenRouter
      try {
        console.log('[GEMINI_SERVICE] Attempting OpenRouter fallback...');
        return await openRouterService.generateQAPairs(content, fineTuningGoal, count);
      } catch (fallbackError) {
        console.error('[GEMINI_SERVICE] OpenRouter fallback also failed:', fallbackError);
        throw new Error(`Q&A generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  async identifyKnowledgeGaps(
    content: string,
    fineTuningGoal: FineTuningGoal
  ): Promise<KnowledgeGap[]> {
    try {
      console.log(`[GEMINI_SERVICE] Identifying knowledge gaps for goal: ${fineTuningGoal}`);
      
      const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
      if (!goalConfig) {
        throw new Error(`Invalid fine-tuning goal: ${fineTuningGoal}`);
      }

      const prompt = this.buildKnowledgeGapPrompt(content, goalConfig);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: prompt,
          temperature: 0.3,
          maxTokens: 2000
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini service request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.response) {
        throw new Error('No response from Gemini service');
      }

      const knowledgeGaps = this.parseKnowledgeGaps(data.response);
      console.log(`[GEMINI_SERVICE] Identified ${knowledgeGaps.length} knowledge gaps`);
      return knowledgeGaps;

    } catch (error) {
      console.error('[GEMINI_SERVICE] Error identifying knowledge gaps:', error);
      
      // Fallback to OpenRouter
      try {
        console.log('[GEMINI_SERVICE] Attempting OpenRouter fallback for knowledge gaps...');
        return await openRouterService.identifyKnowledgeGaps(content, fineTuningGoal);
      } catch (fallbackError) {
        console.error('[GEMINI_SERVICE] OpenRouter fallback failed for knowledge gaps:', fallbackError);
        throw new Error(`Knowledge gap identification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private buildQAPrompt(content: string, goalConfig: any, count: number): string {
    return `
You are an expert at creating high-quality question-answer pairs for fine-tuning language models.

GOAL: ${goalConfig.name}
DESCRIPTION: ${goalConfig.description}
FOCUS: ${goalConfig.focus}

CONTENT TO ANALYZE:
${content}

INSTRUCTIONS:
1. Generate exactly ${count} question-answer pairs
2. Focus on ${goalConfig.focus}
3. Questions should be diverse and cover different aspects
4. Answers should be comprehensive but concise
5. Include ${Math.floor(count * INCORRECT_ANSWER_RATIO)} intentionally incorrect answers for training robustness

OUTPUT FORMAT (JSON):
{
  "qa_pairs": [
    {
      "question": "Your question here",
      "answer": "Your answer here",
      "is_correct": true,
      "grounding": {
        "source_section": "relevant section from content",
        "confidence": 0.95,
        "reasoning": "why this answer is correct/incorrect"
      }
    }
  ]
}

Generate the Q&A pairs now:`;
  }

  private buildKnowledgeGapPrompt(content: string, goalConfig: any): string {
    return `
You are an expert at identifying knowledge gaps in content for fine-tuning purposes.

GOAL: ${goalConfig.name}
FOCUS: ${goalConfig.focus}

CONTENT TO ANALYZE:
${content}

INSTRUCTIONS:
1. Identify areas where additional information would be valuable
2. Focus on gaps related to ${goalConfig.focus}
3. Suggest specific topics or questions that could enhance the dataset
4. Prioritize gaps that would improve model performance

OUTPUT FORMAT (JSON):
{
  "knowledge_gaps": [
    {
      "topic": "Missing topic area",
      "description": "What information is missing",
      "importance": "high|medium|low",
      "suggested_questions": ["question 1", "question 2"]
    }
  ]
}

Identify knowledge gaps now:`;
  }

  private parseQAPairs(response: string): QAPair[] {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.qa_pairs || !Array.isArray(parsed.qa_pairs)) {
        throw new Error('Invalid response format: missing qa_pairs array');
      }

      return parsed.qa_pairs.map((pair: any, index: number) => ({
        id: `gemini-${Date.now()}-${index}`,
        question: pair.question || '',
        answer: pair.answer || '',
        isCorrect: pair.is_correct !== false, // Default to true if not specified
        grounding: {
          sourceSection: pair.grounding?.source_section || '',
          confidence: pair.grounding?.confidence || 0.8,
          reasoning: pair.grounding?.reasoning || ''
        } as GroundingMetadata
      }));

    } catch (error) {
      console.error('[GEMINI_SERVICE] Error parsing Q&A pairs:', error);
      
      // Fallback: try to parse line by line
      const lines = response.split('\n').filter(line => line.trim());
      const qaPairs: QAPair[] = [];
      
      for (let i = 0; i < lines.length - 1; i += 2) {
        const question = lines[i]?.replace(/^Q\d*:?\s*/, '').trim();
        const answer = lines[i + 1]?.replace(/^A\d*:?\s*/, '').trim();
        
        if (question && answer) {
          qaPairs.push({
            id: `gemini-fallback-${Date.now()}-${i}`,
            question,
            answer,
            isCorrect: true,
            grounding: {
              sourceSection: 'Parsed from text',
              confidence: 0.7,
              reasoning: 'Fallback parsing'
            }
          });
        }
      }
      
      return qaPairs;
    }
  }

  private parseKnowledgeGaps(response: string): KnowledgeGap[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.knowledge_gaps || !Array.isArray(parsed.knowledge_gaps)) {
        throw new Error('Invalid response format: missing knowledge_gaps array');
      }

      return parsed.knowledge_gaps.map((gap: any, index: number) => ({
        id: `gap-${Date.now()}-${index}`,
        topic: gap.topic || '',
        description: gap.description || '',
        importance: gap.importance || 'medium',
        suggestedQuestions: gap.suggested_questions || []
      }));

    } catch (error) {
      console.error('[GEMINI_SERVICE] Error parsing knowledge gaps:', error);
      return [];
    }
  }
}

export const geminiService = new GeminiService();