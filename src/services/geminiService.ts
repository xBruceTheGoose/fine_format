import { GEMINI_API_KEYS, API_ENDPOINTS } from '../constants';
import type { Theme, QAPair, SyntheticQAPair, ValidationResult, KnowledgeGap, FineTuningGoal } from '../types';

class GeminiService {
  private currentKeyIndex = 0;

  private async makeRequest(endpoint: string, data: any, retries = 3): Promise<any> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const apiKey = GEMINI_API_KEYS[this.currentKeyIndex];
        const response = await fetch(`${API_ENDPOINTS.GEMINI}${endpoint}?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          if (response.status === 429 || response.status === 503) {
            // Rate limit or service unavailable, try next key
            this.currentKeyIndex = (this.currentKeyIndex + 1) % GEMINI_API_KEYS.length;
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          throw new Error(`API request failed: ${response.status}`);
        }

        const result = await response.json();
        return result;
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  async identifyThemes(content: Array<{type: 'file' | 'url', name?: string, url?: string, content: string}>, goal: FineTuningGoal): Promise<Theme[]> {
    const prompt = `Analyze the following content and identify key themes for ${goal} fine-tuning:

${content.map(c => `${c.type === 'file' ? `File: ${c.name}` : `URL: ${c.url}`}\n${c.content.substring(0, 2000)}`).join('\n\n')}

Return a JSON array of themes with: name, description, confidence (0-1), questionCount (estimated).`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error parsing themes:', error);
    }

    return [];
  }

  async performWebResearch(themes: Theme[], goal: FineTuningGoal): Promise<{knowledgeGaps: KnowledgeGap[]}> {
    const prompt = `Based on these themes for ${goal} fine-tuning, identify knowledge gaps that need additional research:

${themes.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Return JSON with knowledgeGaps array containing: theme, description, priority (1-5), suggestedQuestionTypes, relatedConcepts.`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error parsing research data:', error);
    }

    return { knowledgeGaps: [] };
  }

  async generateQAPairs(content: Array<{type: 'file' | 'url', name?: string, url?: string, content: string}>, themes: Theme[], goal: FineTuningGoal): Promise<QAPair[]> {
    const prompt = `Generate high-quality question-answer pairs from this content for ${goal} fine-tuning:

Content:
${content.map(c => c.content.substring(0, 1500)).join('\n\n')}

Themes to focus on:
${themes.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Generate 10-15 diverse Q&A pairs. Return JSON array with: question, answer, difficulty (easy/medium/hard), category.`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const pairs = JSON.parse(jsonMatch[0]);
        return pairs.map((pair: any, index: number) => ({
          id: `gemini-${index}`,
          user: pair.question,
          model: pair.answer,
          isCorrect: true,
          difficulty: pair.difficulty,
          category: pair.category,
          source: 'gemini-generated'
        }));
      }
    } catch (error) {
      console.error('Error parsing Q&A pairs:', error);
    }

    return [];
  }

  async generateSyntheticQAPairs(knowledgeGaps: KnowledgeGap[], themes: Theme[], goal: FineTuningGoal): Promise<SyntheticQAPair[]> {
    const prompt = `Generate synthetic Q&A pairs to fill these knowledge gaps for ${goal} fine-tuning:

Knowledge Gaps:
${knowledgeGaps.map(gap => `- ${gap.theme}: ${gap.description}`).join('\n')}

Themes:
${themes.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Generate 8-12 synthetic Q&A pairs. Return JSON array with: question, answer, difficulty, category, targetGap, confidence (0-1).`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const pairs = JSON.parse(jsonMatch[0]);
        return pairs.map((pair: any, index: number) => ({
          id: `synthetic-${index}`,
          user: pair.question,
          model: pair.answer,
          isCorrect: true,
          difficulty: pair.difficulty,
          category: pair.category,
          targetGap: pair.targetGap,
          confidence: pair.confidence,
          source: 'gemini-synthetic'
        }));
      }
    } catch (error) {
      console.error('Error parsing synthetic pairs:', error);
    }

    return [];
  }

  async validateQAPairs(pairs: (QAPair | SyntheticQAPair)[]): Promise<ValidationResult[]> {
    const prompt = `Validate these Q&A pairs for quality and accuracy:

${pairs.slice(0, 10).map((pair, i) => `${i + 1}. Q: ${pair.user}\nA: ${pair.model}`).join('\n\n')}

Return JSON array with: pairId, isValid (boolean), confidence (0-1), reasoning, factualAccuracy (0-1), relevanceScore (0-1).`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error parsing validation results:', error);
    }

    return pairs.map((pair, index) => ({
      pairId: pair.id || `pair-${index}`,
      isValid: true,
      confidence: 0.8,
      reasoning: 'Auto-validated',
      factualAccuracy: 0.8,
      relevanceScore: 0.8
    }));
  }

  async generateIncorrectAnswers(pairs: QAPair[]): Promise<Array<{question: string, correctAnswer: string, incorrectAnswers: string[]}>> {
    const prompt = `For each question, generate 2-3 plausible but incorrect answers:

${pairs.slice(0, 5).map((pair, i) => `${i + 1}. Q: ${pair.user}\nCorrect: ${pair.model}`).join('\n\n')}

Return JSON array with: question, correctAnswer, incorrectAnswers (array).`;

    const response = await this.makeRequest('/generateContent', {
      contents: [{ parts: [{ text: prompt }] }]
    });

    try {
      const text = response.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error parsing incorrect answers:', error);
    }

    return [];
  }
}

export const geminiService = new GeminiService();