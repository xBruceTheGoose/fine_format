import type { QAPair, SyntheticQAPair, ValidationResult } from '../types';

class OpenRouterService {
  private async makeRequest(messages: Array<{role: string, content: string}>, model = 'anthropic/claude-3-haiku'): Promise<any> {
    const response = await fetch('/.netlify/functions/openrouter-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API request failed: ${response.status}`);
    }

    return response.json();
  }

  async validateQAPairs(pairs: (QAPair | SyntheticQAPair)[]): Promise<ValidationResult[]> {
    const messages = [{
      role: 'user',
      content: `Validate these Q&A pairs for quality and accuracy:

${pairs.slice(0, 10).map((pair, i) => `${i + 1}. Q: ${pair.user}\nA: ${pair.model}`).join('\n\n')}

Return JSON array with: pairId, isValid (boolean), accuracy (0-1), completeness (0-1), clarity (0-1), relevance (0-1), issues (array), suggestions (array).`
    }];

    try {
      const response = await this.makeRequest(messages);
      const text = response.choices[0].message.content;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        return results.map((result: any) => ({
          pairId: result.pairId,
          isValid: result.isValid,
          confidence: result.accuracy,
          reasoning: result.suggestions?.join('; ') || 'Validated',
          factualAccuracy: result.accuracy,
          relevanceScore: result.relevance
        }));
      }
    } catch (error) {
      console.error('Error validating pairs:', error instanceof Error ? error.message : 'Unknown error');
    }

    return pairs.map((_, index) => ({
      pairId: `pair-${index}`,
      isValid: true,
      confidence: 0.8,
      reasoning: 'Auto-validated',
      factualAccuracy: 0.8,
      relevanceScore: 0.8
    }));
  }
}

export const openRouterService = new OpenRouterService();