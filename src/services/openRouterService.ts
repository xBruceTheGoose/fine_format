import { KnowledgeGap, SyntheticQAPair, QAPair, FineTuningGoal, ValidationResult } from '../types/index';
import { FINE_TUNING_GOALS, SYNTHETIC_QA_TARGET, INCORRECT_ANSWER_RATIO } from '../constants/index';

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface OpenRouterError {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

class OpenRouterService {
  private baseUrl = '/.netlify/functions/openrouter-chat';

  public async makeRequest(
    prompt: string,
    model: string = 'anthropic/claude-3.5-sonnet',
    maxTokens: number = 4000,
    temperature: number = 0.7
  ): Promise<string> {
    console.log(`[OPENROUTER] Making request to ${this.baseUrl}`);
    
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model,
          maxTokens,
          temperature
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OPENROUTER] HTTP ${response.status}: ${errorText}`);
        throw new Error(`OpenRouter API request failed: ${response.status} - ${errorText}`);
      }

      const data: OpenRouterResponse = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from OpenRouter API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('[OPENROUTER] Request failed:', error);
      throw error;
    }
  }

  public parseJsonResponse(content: string): any {
    try {
      // Try direct parsing first
      return JSON.parse(content);
    } catch (error) {
      console.log('[OPENROUTER] Direct JSON parse failed, attempting to extract JSON...');
      
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (e) {
          console.log('[OPENROUTER] Markdown JSON extraction failed');
        }
      }

      // Try to find JSON object in the text
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (e) {
          console.log('[OPENROUTER] Object extraction failed');
        }
      }

      throw new Error('Could not parse JSON from OpenRouter response');
    }
  }

  async generateQAPairs(
    content: string,
    fineTuningGoal: FineTuningGoal,
    targetCount: number = 10
  ): Promise<QAPair[]> {
    console.log(`[OPENROUTER] Generating ${targetCount} Q&A pairs for goal: ${fineTuningGoal}`);
    
    const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
    
    const prompt = `You are an expert at creating high-quality question-answer pairs for fine-tuning language models.

GOAL: ${goalConfig.name}
DESCRIPTION: ${goalConfig.description}
FOCUS: ${goalConfig.focus}

Generate exactly ${targetCount} diverse, high-quality question-answer pairs based on the following content. Each pair should:

1. Be directly answerable from the provided content
2. Vary in complexity (mix of simple recall and complex reasoning)
3. Cover different aspects of the content
4. Be relevant to the fine-tuning goal: ${goalConfig.focus}
5. Have clear, accurate, and complete answers

Content to analyze:
${content}

Return your response as a JSON array with this exact structure:
[
  {
    "question": "Your question here",
    "answer": "Your detailed answer here",
    "difficulty": "easy|medium|hard",
    "category": "factual|conceptual|analytical|applied"
  }
]

Important: Return ONLY the JSON array, no additional text or formatting.`;

    try {
      const response = await this.makeRequest(prompt, 'anthropic/claude-3.5-sonnet', 4000, 0.7);
      const qaPairs = this.parseJsonResponse(response);
      
      if (!Array.isArray(qaPairs)) {
        throw new Error('Response is not an array');
      }

      return qaPairs.map((pair: any, index: number) => ({
        id: `openrouter-${Date.now()}-${index}`,
        question: pair.question || '',
        answer: pair.answer || '',
        difficulty: pair.difficulty || 'medium',
        category: pair.category || 'factual',
        source: 'openrouter-generated',
        grounding: {
          hasGrounding: true,
          confidence: 0.8,
          sourceRelevance: 0.9,
          factualAccuracy: 0.85
        }
      }));
    } catch (error) {
      console.error('[OPENROUTER] Q&A generation failed:', error);
      throw new Error(`OpenRouter Q&A generation failed: ${error.message}`);
    }
  }

  async identifyKnowledgeGaps(
    existingQAPairs: QAPair[],
    originalContent: string,
    fineTuningGoal: FineTuningGoal
  ): Promise<KnowledgeGap[]> {
    console.log(`[OPENROUTER] Identifying knowledge gaps from ${existingQAPairs.length} existing Q&A pairs`);
    
    const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
    
    const existingTopics = existingQAPairs.map(qa => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n');
    
    const prompt = `You are an expert at identifying knowledge gaps in training datasets.

GOAL: ${goalConfig.name}
FOCUS: ${goalConfig.focus}

Analyze the original content and existing Q&A pairs to identify important topics, concepts, or areas that are missing or underrepresented.

Original Content:
${originalContent.substring(0, 3000)}...

Existing Q&A Pairs:
${existingTopics.substring(0, 2000)}...

Identify 3-5 significant knowledge gaps that should be filled to improve the dataset for the goal: ${goalConfig.focus}

Return your response as a JSON array with this exact structure:
[
  {
    "topic": "Missing topic or concept",
    "description": "Why this gap is important",
    "priority": "high|medium|low",
    "suggestedQuestions": ["Question 1", "Question 2", "Question 3"]
  }
]

Important: Return ONLY the JSON array, no additional text or formatting.`;

    try {
      const response = await this.makeRequest(prompt, 'anthropic/claude-3.5-sonnet', 3000, 0.8);
      const gaps = this.parseJsonResponse(response);
      
      if (!Array.isArray(gaps)) {
        throw new Error('Response is not an array');
      }

      return gaps.map((gap: any, index: number) => ({
        id: `gap-${Date.now()}-${index}`,
        topic: gap.topic || 'Unknown Topic',
        description: gap.description || 'No description provided',
        priority: gap.priority || 'medium',
        suggestedQuestions: Array.isArray(gap.suggestedQuestions) ? gap.suggestedQuestions : [],
        source: 'openrouter-analysis'
      }));
    } catch (error) {
      console.error('[OPENROUTER] Knowledge gap identification failed:', error);
      throw new Error(`OpenRouter knowledge gap identification failed: ${error.message}`);
    }
  }

  async generateSyntheticQAPairs(
    knowledgeGaps: KnowledgeGap[],
    originalContent: string,
    fineTuningGoal: FineTuningGoal,
    targetCount: number = SYNTHETIC_QA_TARGET
  ): Promise<SyntheticQAPair[]> {
    console.log(`[OPENROUTER] Generating ${targetCount} synthetic Q&A pairs to fill knowledge gaps`);
    
    const goalConfig = FINE_TUNING_GOALS[fineTuningGoal];
    const gapDescriptions = knowledgeGaps.map(gap => 
      `Topic: ${gap.topic}\nDescription: ${gap.description}\nSuggested Questions: ${gap.suggestedQuestions.join(', ')}`
    ).join('\n\n');
    
    const prompt = `You are an expert at creating synthetic question-answer pairs to fill knowledge gaps.

GOAL: ${goalConfig.name}
FOCUS: ${goalConfig.focus}

Create ${targetCount} synthetic Q&A pairs that address the identified knowledge gaps while staying grounded in the original content.

Knowledge Gaps to Address:
${gapDescriptions}

Original Content (for grounding):
${originalContent.substring(0, 4000)}...

Guidelines:
1. Create questions that address the identified gaps
2. Ensure answers are grounded in or logically derived from the original content
3. Vary difficulty levels and question types
4. Focus on the fine-tuning goal: ${goalConfig.focus}
5. Make questions realistic and practical

Return your response as a JSON array with this exact structure:
[
  {
    "question": "Your question here",
    "answer": "Your detailed answer here",
    "difficulty": "easy|medium|hard",
    "category": "factual|conceptual|analytical|applied",
    "gapTopic": "Which knowledge gap this addresses",
    "confidence": 0.85
  }
]

Important: Return ONLY the JSON array, no additional text or formatting.`;

    try {
      const response = await this.makeRequest(prompt, 'anthropic/claude-3.5-sonnet', 4000, 0.8);
      const syntheticPairs = this.parseJsonResponse(response);
      
      if (!Array.isArray(syntheticPairs)) {
        throw new Error('Response is not an array');
      }

      return syntheticPairs.map((pair: any, index: number) => ({
        id: `synthetic-openrouter-${Date.now()}-${index}`,
        question: pair.question || '',
        answer: pair.answer || '',
        difficulty: pair.difficulty || 'medium',
        category: pair.category || 'factual',
        gapTopic: pair.gapTopic || 'Unknown',
        confidence: pair.confidence || 0.8,
        source: 'openrouter-synthetic',
        grounding: {
          hasGrounding: true,
          confidence: pair.confidence || 0.8,
          sourceRelevance: 0.85,
          factualAccuracy: 0.8
        }
      }));
    } catch (error) {
      console.error('[OPENROUTER] Synthetic Q&A generation failed:', error);
      throw new Error(`OpenRouter synthetic Q&A generation failed: ${error.message}`);
    }
  }

  async validateQAPairs(qaPairs: QAPair[], originalContent: string): Promise<ValidationResult[]> {
    console.log(`[OPENROUTER] Validating ${qaPairs.length} Q&A pairs`);
    
    const pairsToValidate = qaPairs.slice(0, 10); // Validate first 10 pairs
    const pairTexts = pairsToValidate.map((qa, index) => 
      `${index + 1}. Q: ${qa.question}\n   A: ${qa.answer}`
    ).join('\n\n');
    
    const prompt = `You are an expert at validating question-answer pairs for accuracy and quality.

Validate each Q&A pair against the original content for:
1. Factual accuracy
2. Completeness of answer
3. Clarity of question
4. Relevance to content

Original Content:
${originalContent.substring(0, 3000)}...

Q&A Pairs to Validate:
${pairTexts}

Return your response as a JSON array with this exact structure:
[
  {
    "pairIndex": 1,
    "isValid": true,
    "accuracy": 0.95,
    "completeness": 0.90,
    "clarity": 0.85,
    "relevance": 0.92,
    "issues": ["Any issues found"],
    "suggestions": ["Improvement suggestions"]
  }
]

Important: Return ONLY the JSON array, no additional text or formatting.`;

    try {
      const response = await this.makeRequest(prompt, 'anthropic/claude-3.5-sonnet', 3000, 0.3);
      const validations = this.parseJsonResponse(response);
      
      if (!Array.isArray(validations)) {
        throw new Error('Response is not an array');
      }

      return validations.map((validation: any) => ({
        pairId: pairsToValidate[validation.pairIndex - 1]?.id || '',
        isValid: validation.isValid || false,
        accuracy: validation.accuracy || 0.5,
        completeness: validation.completeness || 0.5,
        clarity: validation.clarity || 0.5,
        relevance: validation.relevance || 0.5,
        issues: Array.isArray(validation.issues) ? validation.issues : [],
        suggestions: Array.isArray(validation.suggestions) ? validation.suggestions : []
      }));
    } catch (error) {
      console.error('[OPENROUTER] Validation failed:', error);
      throw new Error(`OpenRouter validation failed: ${error.message}`);
    }
  }
}

export const openRouterService = new OpenRouterService();