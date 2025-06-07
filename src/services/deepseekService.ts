import { KnowledgeGap, SyntheticQAPair, QAPair, FineTuningGoal } from '../types';
import { FINE_TUNING_GOALS } from '../constants';

class DeepSeekService {
  private apiKey: string | null = null;
  private baseUrl = 'https://api.deepseek.com/v1';
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY;
    
    if (!apiKey?.trim()) {
      console.warn('DeepSeek API key not found in environment variables. Knowledge gap filling will be disabled.');
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
      throw new Error('DeepSeek service not initialized');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-reasoner',
        messages,
        temperature,
        max_tokens: 4000,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response from DeepSeek API');
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

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse JSON response from DeepSeek:', error);
      throw new Error(`Invalid JSON response from DeepSeek: ${responseText.substring(0, 200)}...`);
    }
  }

  public async identifyKnowledgeGaps(
    combinedContent: string,
    identifiedThemes: string[],
    existingQAPairs: QAPair[],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<KnowledgeGap[]> {
    if (!this.isReady()) {
      throw new Error('DeepSeek service not available');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const existingQuestions = existingQAPairs.map(pair => pair.user);
    
    const prompt = `
You are an expert knowledge analyst specializing in identifying gaps in Q&A datasets for ${goalConfig?.name} fine-tuning.

TASK: Analyze the provided content and existing Q&A pairs to identify knowledge gaps that should be filled with additional synthetic Q&A pairs.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

CONTENT THEMES: ${identifiedThemes.join(', ')}

EXISTING Q&A PAIRS (${existingQAPairs.length} total):
${existingQuestions.slice(0, 20).map((q, i) => `${i + 1}. ${q}`).join('\n')}
${existingQuestions.length > 20 ? `... and ${existingQuestions.length - 20} more questions` : ''}

ANALYSIS REQUIREMENTS:
1. Identify 5-10 significant knowledge gaps not covered by existing Q&A pairs
2. Focus on gaps that align with the ${goalConfig?.name} objective
3. Prioritize gaps based on importance for comprehensive fine-tuning
4. Consider different question types and complexity levels
5. Ensure gaps are specific enough to generate targeted Q&A pairs

For each gap, provide:
- Clear description of what's missing
- Related theme from the identified themes
- Priority level (high/medium/low)
- Suggested question types that would fill this gap
- Related concepts that should be covered

Format as JSON array with this structure:
[
  {
    "id": "gap_1",
    "description": "Detailed description of the knowledge gap",
    "theme": "related_theme_from_list",
    "priority": "high|medium|low",
    "suggestedQuestionTypes": ["type1", "type2"],
    "relatedConcepts": ["concept1", "concept2"]
  }
]

CONTENT TO ANALYZE:
---
${combinedContent.substring(0, 8000)}${combinedContent.length > 8000 ? '...' : ''}
---

JSON Output:
    `.trim();

    try {
      const response = await this.makeRequest([
        { role: 'user', content: prompt }
      ], 0.3); // Lower temperature for more focused analysis

      const gaps = this.parseJsonResponse(response);

      if (!Array.isArray(gaps)) {
        throw new Error('Response is not a valid JSON array');
      }

      return gaps.filter((gap): gap is KnowledgeGap =>
        gap &&
        typeof gap.id === 'string' &&
        typeof gap.description === 'string' &&
        typeof gap.theme === 'string' &&
        ['high', 'medium', 'low'].includes(gap.priority) &&
        Array.isArray(gap.suggestedQuestionTypes) &&
        Array.isArray(gap.relatedConcepts)
      ).slice(0, 10); // Limit to 10 gaps max

    } catch (error: any) {
      console.error('Knowledge gap identification failed:', error);
      throw new Error(`Knowledge gap identification failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async generateSyntheticQAPairs(
    combinedContent: string,
    knowledgeGaps: KnowledgeGap[],
    fineTuningGoal: FineTuningGoal = 'knowledge',
    targetCount: number = 20
  ): Promise<SyntheticQAPair[]> {
    if (!this.isReady()) {
      throw new Error('DeepSeek service not available');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const pairsPerGap = Math.ceil(targetCount / knowledgeGaps.length);

    const prompt = `
You are an expert Q&A generator creating synthetic training data for ${goalConfig?.name} fine-tuning.

TASK: Generate ${targetCount} high-quality Q&A pairs that specifically address the identified knowledge gaps.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

KNOWLEDGE GAPS TO ADDRESS:
${knowledgeGaps.map((gap, i) => `
${i + 1}. GAP ID: ${gap.id}
   DESCRIPTION: ${gap.description}
   THEME: ${gap.theme}
   PRIORITY: ${gap.priority}
   SUGGESTED TYPES: ${gap.suggestedQuestionTypes.join(', ')}
   CONCEPTS: ${gap.relatedConcepts.join(', ')}
`).join('\n')}

GENERATION REQUIREMENTS:
1. Create approximately ${pairsPerGap} Q&A pairs per knowledge gap
2. Questions should be natural, diverse, and aligned with ${goalConfig?.name} objectives
3. Answers must be accurate, comprehensive, and based on the provided content
4. Include both correct answers (80%) and strategically incorrect answers (20%)
5. Vary question complexity and types based on the gap's suggested question types
6. Ensure answers demonstrate the desired ${goalConfig?.promptFocus}

For each Q&A pair, provide:
- Natural user question targeting the specific gap
- Comprehensive answer based on content
- Correctness flag (true for correct, false for incorrect)
- Confidence score (0.8-0.95 for correct, 0.1-0.3 for incorrect)
- Target gap ID
- Brief reasoning for why this Q&A addresses the gap

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

CONTENT FOR REFERENCE:
---
${combinedContent.substring(0, 10000)}${combinedContent.length > 10000 ? '...' : ''}
---

JSON Output:
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

export const deepseekService = new DeepSeekService();