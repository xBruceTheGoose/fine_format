import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import { QAPair, GroundingMetadata, FineTuningGoal, ValidationResult, SyntheticQAPair } from '../types';
import { GEMINI_MODEL, QA_PAIR_COUNT_TARGET, INCORRECT_ANSWER_RATIO, FINE_TUNING_GOALS } from '../constants';

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = import.meta.env.VITE_API_KEY;
    
    if (!apiKey?.trim()) {
      console.error('Gemini API key not found in environment variables');
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize GoogleGenAI:', error);
      this.isInitialized = false;
    }
  }

  public isReady(): boolean {
    return this.isInitialized && this.ai !== null;
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
      console.error('Failed to parse JSON response:', error);
      throw new Error(`Invalid JSON response from Gemini: ${responseText.substring(0, 200)}...`);
    }
  }

  private getGoalSpecificPromptGuidance(goal: FineTuningGoal): string {
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === goal);
    
    switch (goal) {
      case 'topic':
        return `
Focus on identifying themes that represent:
- Main subject areas and topics discussed
- Key concepts and their relationships
- Categorical knowledge domains
- Thematic patterns and recurring subjects
- Conceptual frameworks and theoretical foundations

Prioritize themes that would help an AI understand the core topics and subject matter.`;

      case 'knowledge':
        return `
Focus on identifying themes that represent:
- Factual information and data points
- Procedural knowledge and how-to information
- Business processes and operational knowledge
- Technical specifications and requirements
- Reference information and knowledge base content

Prioritize themes that would help an AI serve as a comprehensive knowledge repository.`;

      case 'style':
        return `
Focus on identifying themes that represent:
- Writing style patterns and linguistic choices
- Tone and voice characteristics
- Communication approaches and rhetoric
- Stylistic elements and literary devices
- Audience engagement and persuasion techniques

Prioritize themes that would help an AI replicate the specific writing and communication style.`;

      default:
        return 'Focus on comprehensive theme identification covering all aspects of the content.';
    }
  }

  private getGoalSpecificQAGuidance(goal: FineTuningGoal): string {
    switch (goal) {
      case 'topic':
        return `
TOPIC/THEME FOCUS - Generate Q&A pairs that:
- Test understanding of main topics and themes
- Explore relationships between different concepts
- Cover categorical knowledge and subject areas
- Include questions about thematic patterns
- Focus on conceptual understanding rather than specific facts
- Vary from broad thematic questions to specific topic details

Question types should include:
- "What is the main theme of...?"
- "How do these concepts relate to...?"
- "What category does this belong to?"
- "What are the key themes in...?"`;

      case 'knowledge':
        return `
KNOWLEDGE BASE FOCUS - Generate Q&A pairs that:
- Test factual accuracy and information retrieval
- Cover procedural knowledge and step-by-step processes
- Include specific data points and technical details
- Focus on practical application of information
- Test comprehensive understanding of business/domain knowledge
- Include both simple facts and complex explanations

Question types should include:
- "What is...?" (factual questions)
- "How do you...?" (procedural questions)
- "When should...?" (conditional knowledge)
- "What are the steps to...?" (process questions)`;

      case 'style':
        return `
WRITING/STYLE FOCUS - Generate Q&A pairs that:
- Demonstrate the specific writing style and tone
- Show communication patterns and voice
- Include examples of stylistic choices
- Test ability to maintain consistent tone
- Cover rhetorical techniques and approaches
- Focus on how things are said, not just what is said

Question types should include:
- "How would you explain...?" (style demonstration)
- "What tone should be used for...?" (voice questions)
- "How would you communicate...?" (style application)
- "What approach would you take to...?" (communication strategy)`;

      default:
        return 'Generate comprehensive Q&A pairs covering all aspects of the content.';
    }
  }

  public async identifyThemes(
    combinedContent: string,
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<string[]> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const goalGuidance = this.getGoalSpecificPromptGuidance(fineTuningGoal);
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);

    const prompt = `
Analyze the following content and identify 5-8 key themes optimized for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

${goalGuidance}

Requirements:
- Identify themes that align with the ${goalConfig?.name} objective
- Focus on themes that would be valuable for comprehensive Q&A generation
- Consider what additional context would enhance the fine-tuning goal
- Return themes as search-friendly phrases when web augmentation is enabled
- Include both broad and specific themes for comprehensive coverage
- Ensure themes support generation of 100+ diverse Q&A pairs

Format as a JSON array of strings, each representing a specific theme or topic.

Example for ${goalConfig?.name}: ${this.getExampleThemes(fineTuningGoal)}

Content to analyze:
---
${combinedContent.substring(0, 12000)} ${combinedContent.length > 12000 ? '...' : ''}
---

JSON Output:
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const themes = this.parseJsonResponse(response.text);

      if (!Array.isArray(themes)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validThemes = themes.filter(
        (theme): theme is string =>
          typeof theme === 'string' && theme.trim().length > 0
      );

      return validThemes.slice(0, 8); // Limit to 8 themes max
    } catch (error: any) {
      console.error('Theme identification failed:', error);
      // Return empty array if theme identification fails - web search will still work
      return [];
    }
  }

  private getExampleThemes(goal: FineTuningGoal): string {
    switch (goal) {
      case 'topic':
        return '["artificial intelligence ethics", "machine learning algorithms", "neural network architectures", "AI safety protocols", "deep learning applications"]';
      case 'knowledge':
        return '["API documentation procedures", "database configuration steps", "troubleshooting methodologies", "security implementation protocols", "performance optimization techniques"]';
      case 'style':
        return '["technical writing clarity", "professional communication tone", "persuasive argumentation style", "audience engagement techniques", "concise explanation methods"]';
      default:
        return '["main topic themes", "key concepts", "important procedures", "communication patterns", "knowledge areas"]';
    }
  }

  public async cleanTextContent(
    textContent: string,
    fileName: string
  ): Promise<string> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const prompt = `
Clean the following text content from "${fileName}":

1. Remove advertisements, navigation elements, headers, footers
2. Remove non-essential formatting and syntax
3. Preserve only the core textual information
4. Return clean, readable plain text
5. Do not add commentary or explanations

Content:
${textContent}
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      return response.text?.trim() || '';
    } catch (error: any) {
      throw new Error(`Text cleaning failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async cleanBinaryContent(
    base64Data: string,
    mimeType: string,
    fileName: string
  ): Promise<string> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const userParts: Part[] = [
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      {
        text: `
Extract clean text content from this file: "${fileName}" (${mimeType})

Requirements:
- Extract all relevant textual content
- Ignore images, complex layouts, advertisements
- Remove headers, footers, and stylistic elements
- Return only clean, plain text
- If no text found, return empty string

Do not add commentary or explanations.
        `.trim(),
      },
    ];

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: userParts }],
      });

      return response.text?.trim() || '';
    } catch (error: any) {
      throw new Error(`Binary content cleaning failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async augmentWithWebSearch(
    originalContent: string,
    identifiedThemes: string[] = [],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<{ augmentedText: string; groundingMetadata?: GroundingMetadata }> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const themeGuidance = identifiedThemes.length > 0 
      ? `\n\nFocus your web search on these identified themes: ${identifiedThemes.join(', ')}`
      : '';

    const goalSpecificGuidance = this.getGoalSpecificWebSearchGuidance(fineTuningGoal);

    const prompt = `
You are a content augmentation expert optimizing for ${goalConfig?.name} fine-tuning. Your task:

1. Analyze the core themes and topics in the provided text
2. Use Google Search to find relevant, factual, up-to-date information${themeGuidance}
3. Integrate web-sourced information with the original text
4. Create a comprehensive, coherent narrative optimized for ${goalConfig?.promptFocus}
5. Focus on enhancing value while maintaining original themes
6. Prioritize current facts, statistics, and developments
7. Ensure the augmented content supports generation of 100+ diverse Q&A pairs

${goalSpecificGuidance}

Return ONLY the augmented text without commentary.

Original Text:
---
${originalContent}
---
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const augmentedText = response.text?.trim() || originalContent;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata as GroundingMetadata;

      return { augmentedText, groundingMetadata };
    } catch (error: any) {
      throw new Error(`Web augmentation failed: ${error.message || 'Unknown error'}`);
    }
  }

  private getGoalSpecificWebSearchGuidance(goal: FineTuningGoal): string {
    switch (goal) {
      case 'topic':
        return `
TOPIC FOCUS - When searching and augmenting:
- Find information that expands on the main themes and topics
- Look for related concepts and theoretical frameworks
- Include current developments in the subject areas
- Add context that helps understand topic relationships
- Focus on thematic depth rather than specific procedures`;

      case 'knowledge':
        return `
KNOWLEDGE BASE FOCUS - When searching and augmenting:
- Find factual information, statistics, and data points
- Look for procedural knowledge and best practices
- Include technical specifications and requirements
- Add current industry standards and guidelines
- Focus on comprehensive, accurate information`;

      case 'style':
        return `
STYLE FOCUS - When searching and augmenting:
- Find examples of similar writing styles and communication approaches
- Look for style guides and communication best practices
- Include examples of effective rhetoric and persuasion
- Add context about audience engagement techniques
- Focus on enhancing stylistic elements and voice consistency`;

      default:
        return 'Focus on comprehensive content enhancement covering all aspects.';
    }
  }

  public async generateQAPairs(
    content: string, 
    themes: string[] = [],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<QAPair[]> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    if (content.length < 200) {
      throw new Error('Content too short for comprehensive Q&A generation (minimum 200 characters)');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const themeGuidance = themes.length > 0 
      ? `\n\nEnsure questions cover these key themes: ${themes.join(', ')}`
      : '';

    const goalSpecificGuidance = this.getGoalSpecificQAGuidance(fineTuningGoal);

    const incorrectCount = Math.ceil(QA_PAIR_COUNT_TARGET * INCORRECT_ANSWER_RATIO);
    const correctCount = QA_PAIR_COUNT_TARGET - incorrectCount;

    const prompt = `
Generate exactly ${QA_PAIR_COUNT_TARGET} high-quality question-answer pairs optimized for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

${goalSpecificGuidance}

CRITICAL REQUIREMENTS:
1. Generate ${correctCount} CORRECT question-answer pairs
2. Generate ${incorrectCount} INCORRECT question-answer pairs (marked as incorrect for training)
3. Questions should be natural user queries relevant to the ${goalConfig?.name} objective${themeGuidance}
4. Vary question types based on the fine-tuning goal
5. Avoid self-referential phrases like "according to the text"
6. Ensure comprehensive coverage aligned with ${goalConfig?.name} objectives
7. Include both simple and complex questions appropriate for the goal
8. Incorrect answers should be plausible but factually wrong

For CORRECT answers:
- Must align with the ${goalConfig?.name} objective
- Complete and informative responses
- High confidence in accuracy
- Demonstrate the desired ${goalConfig?.promptFocus}

For INCORRECT answers:
- Should seem plausible but contain factual errors
- Maintain similar structure to correct answers
- Clearly mark as incorrect for training purposes
- Help the model learn to distinguish quality responses

Format as valid JSON array with objects containing:
- "user": the question
- "model": the answer
- "isCorrect": true for correct answers, false for incorrect
- "confidence": 0.9-1.0 for correct, 0.1-0.4 for incorrect

Example: [
  {"user": "What is the main topic?", "model": "The main topic is...", "isCorrect": true, "confidence": 0.95},
  {"user": "When was this invented?", "model": "This was invented in 1850", "isCorrect": false, "confidence": 0.2}
]

Text:
---
${content}
---

JSON Output:
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const qaData = this.parseJsonResponse(response.text);

      if (!Array.isArray(qaData)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validPairs = qaData.filter(
        (item): item is QAPair =>
          item &&
          typeof item.user === 'string' &&
          typeof item.model === 'string' &&
          typeof item.isCorrect === 'boolean' &&
          item.user.trim().length > 0 &&
          item.model.trim().length > 0
      ).map(pair => ({
        ...pair,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        source: 'original' as const
      }));

      // Shuffle the array to randomize correct/incorrect order
      const shuffledPairs = this.shuffleArray(validPairs);

      return shuffledPairs;
    } catch (error: any) {
      throw new Error(`Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async validateQAPair(
    syntheticPair: SyntheticQAPair,
    referenceContent: string,
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<ValidationResult> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);

    const prompt = `
You are an expert fact-checker and Q&A validator for ${goalConfig?.name} fine-tuning datasets.

TASK: Validate the accuracy and quality of this synthetic Q&A pair against the reference content.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

SYNTHETIC Q&A PAIR TO VALIDATE:
Question: ${syntheticPair.user}
Answer: ${syntheticPair.model}
Claimed Correctness: ${syntheticPair.isCorrect ? 'CORRECT' : 'INCORRECT'}
Target Gap: ${syntheticPair.targetGap}

VALIDATION CRITERIA:
1. Factual Accuracy: Is the answer factually correct based on the reference content?
2. Relevance: Does the Q&A pair align with the ${goalConfig?.name} objective?
3. Quality: Is the answer comprehensive and well-structured?
4. Consistency: Does the claimed correctness match the actual accuracy?
5. Fine-tuning Value: Will this Q&A pair improve model performance for ${goalConfig?.promptFocus}?

REFERENCE CONTENT:
---
${referenceContent.substring(0, 8000)}${referenceContent.length > 8000 ? '...' : ''}
---

Provide your validation as JSON:
{
  "isValid": boolean,
  "confidence": number (0.0-1.0),
  "reasoning": "Detailed explanation of validation decision",
  "suggestedCorrection": "If invalid, suggest correction (optional)",
  "factualAccuracy": number (0.0-1.0),
  "relevanceScore": number (0.0-1.0)
}

JSON Output:
    `.trim();

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
        },
      });

      const validation = this.parseJsonResponse(response.text);

      // Validate the response structure
      if (typeof validation.isValid !== 'boolean' ||
          typeof validation.confidence !== 'number' ||
          typeof validation.reasoning !== 'string' ||
          typeof validation.factualAccuracy !== 'number' ||
          typeof validation.relevanceScore !== 'number') {
        throw new Error('Invalid validation response structure');
      }

      return {
        isValid: validation.isValid,
        confidence: Math.max(0, Math.min(1, validation.confidence)),
        reasoning: validation.reasoning,
        suggestedCorrection: validation.suggestedCorrection || undefined,
        factualAccuracy: Math.max(0, Math.min(1, validation.factualAccuracy)),
        relevanceScore: Math.max(0, Math.min(1, validation.relevanceScore))
      };

    } catch (error: any) {
      console.error('Q&A validation failed:', error);
      // Return a conservative validation result on error
      return {
        isValid: false,
        confidence: 0.1,
        reasoning: `Validation failed due to error: ${error.message || 'Unknown error'}`,
        factualAccuracy: 0.1,
        relevanceScore: 0.1
      };
    }
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

export const geminiService = new GeminiService();