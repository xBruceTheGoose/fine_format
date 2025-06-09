import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import { QAPair, GroundingMetadata, FineTuningGoal, ValidationResult, SyntheticQAPair, KnowledgeGap } from '../types';
import { GEMINI_MODEL, QA_PAIR_COUNT_TARGET, INCORRECT_ANSWER_RATIO, FINE_TUNING_GOALS } from '../constants';

class GeminiService {
  private ai: GoogleGenAI | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    // Try both possible API key names for backward compatibility
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
    
    if (!apiKey?.trim()) {
      console.error('[GEMINI] API key not found in environment variables');
      console.error('[GEMINI] Expected: VITE_GEMINI_API_KEY in .env.local file');
      return;
    }

    try {
      this.ai = new GoogleGenAI({ apiKey: apiKey.trim() });
      this.isInitialized = true;
      console.log('[GEMINI] ✅ Service initialized successfully');
    } catch (error) {
      console.error('[GEMINI] Failed to initialize GoogleGenAI:', error);
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

    // Try to find JSON array boundaries more carefully
    const firstBracket = jsonStr.indexOf('[');
    const lastBracket = jsonStr.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const potentialJson = jsonStr.substring(firstBracket, lastBracket + 1);
      
      // Validate that this looks like valid JSON before using it
      try {
        JSON.parse(potentialJson);
        jsonStr = potentialJson;
      } catch {
        // If extracted portion is invalid, use original
        console.warn('[GEMINI] Extracted JSON portion is invalid, using original response');
      }
    }

    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('[GEMINI] Failed to parse JSON response:', error);
      console.error('[GEMINI] Raw response (first 500 chars):', responseText.substring(0, 500));
      console.error('[GEMINI] Processed JSON string (first 500 chars):', jsonStr.substring(0, 500));
      throw new Error(`Invalid JSON response from Gemini: ${responseText.substring(0, 200)}...`);
    }
  }

  private getGoalSpecificPromptGuidance(goal: FineTuningGoal): string {
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === goal);
    
    switch (goal) {
      case 'topic':
        return `
THEME IDENTIFICATION FOCUS for ${goalConfig?.name}:
- Identify conceptual frameworks and theoretical foundations
- Extract main subject areas and their interconnections
- Recognize thematic patterns and recurring concepts
- Map knowledge domains and categorical structures
- Highlight topic hierarchies and relationships
- Focus on themes that support comprehensive topic understanding
- Prioritize themes that enable effective topic-based Q&A generation
- Consider both broad thematic areas and specific topic niches`;

      case 'knowledge':
        return `
THEME IDENTIFICATION FOCUS for ${goalConfig?.name}:
- Extract factual information clusters and data domains
- Identify procedural knowledge areas and process flows
- Map business logic and operational knowledge structures
- Recognize technical specifications and requirement patterns
- Highlight reference information and knowledge repositories
- Focus on themes that support comprehensive knowledge retrieval
- Prioritize themes that enable effective fact-based Q&A generation
- Consider both foundational knowledge and specialized expertise areas`;

      case 'style':
        return `
THEME IDENTIFICATION FOCUS for ${goalConfig?.name}:
- Identify writing style patterns and linguistic characteristics
- Extract tone and voice consistency markers
- Recognize communication approach signatures
- Map rhetorical techniques and persuasion patterns
- Highlight audience engagement and interaction styles
- Focus on themes that support style replication and consistency
- Prioritize themes that enable effective style-based Q&A generation
- Consider both surface-level stylistic elements and deeper communication patterns`;

      default:
        return 'Focus on comprehensive theme identification covering all aspects of the content for optimal Q&A generation.';
    }
  }

  private getGoalSpecificQAGuidance(goal: FineTuningGoal): string {
    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === goal);
    
    switch (goal) {
      case 'topic':
        return `
Q&A GENERATION STRATEGY for ${goalConfig?.name}:

QUESTION TYPES TO GENERATE:
- Conceptual understanding: "What is the main concept behind...?"
- Thematic relationships: "How do these topics relate to...?"
- Categorical knowledge: "What category does this belong to?"
- Topic exploration: "What are the key aspects of...?"
- Comparative analysis: "How does this topic compare to...?"
- Hierarchical understanding: "What are the subtopics of...?"

ANSWER CHARACTERISTICS:
- Focus on conceptual clarity and thematic coherence
- Emphasize relationships between different topics
- Provide context for topic placement within broader frameworks
- Include examples that illustrate thematic patterns
- Maintain consistency in topic-focused explanations
- Balance breadth of coverage with thematic depth

QUALITY STANDARDS:
- Questions should test topic comprehension at multiple levels
- Answers should demonstrate clear thematic understanding
- Content should support topic-based model fine-tuning
- Include both foundational and advanced topic exploration`;

      case 'knowledge':
        return `
Q&A GENERATION STRATEGY for ${goalConfig?.name}:

QUESTION TYPES TO GENERATE:
- Factual retrieval: "What is...?" / "When did...?" / "Where is...?"
- Procedural knowledge: "How do you...?" / "What are the steps to...?"
- Conditional logic: "When should...?" / "Under what conditions...?"
- Technical specifications: "What are the requirements for...?"
- Data relationships: "How does X affect Y?"
- Reference queries: "What does this term mean?"

ANSWER CHARACTERISTICS:
- Provide precise, factual information with supporting details
- Include step-by-step procedures where applicable
- Reference specific data points, metrics, and specifications
- Maintain accuracy and verifiability of all claims
- Structure answers for easy information retrieval
- Include relevant context and background information

QUALITY STANDARDS:
- Questions should test factual accuracy and procedural understanding
- Answers must be comprehensive yet concise
- Content should serve as reliable knowledge repository
- Include both basic facts and complex explanations`;

      case 'style':
        return `
Q&A GENERATION STRATEGY for ${goalConfig?.name}:

QUESTION TYPES TO GENERATE:
- Style demonstration: "How would you explain...?" / "How should this be communicated?"
- Tone application: "What tone is appropriate for...?"
- Voice consistency: "How would you address...?"
- Communication strategy: "What approach would you take to...?"
- Audience adaptation: "How would you tailor this message for...?"
- Rhetorical techniques: "What persuasive elements would you use?"

ANSWER CHARACTERISTICS:
- Demonstrate the specific writing style and voice consistently
- Show appropriate tone and register for different contexts
- Include examples of effective communication patterns
- Maintain stylistic consistency across all responses
- Reflect the author's unique communication approach
- Balance style demonstration with content value

QUALITY STANDARDS:
- Questions should elicit style-appropriate responses
- Answers must consistently reflect the target communication style
- Content should enable style replication and consistency
- Include both explicit style guidance and implicit demonstration`;

      default:
        return 'Generate comprehensive Q&A pairs covering all aspects of the content with balanced question types and high-quality answers.';
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

    const systemPrompt = `You are an expert content analyst specializing in theme identification for fine-tuning dataset optimization.

EXPERTISE AREAS:
- Content analysis and theme extraction
- Knowledge domain mapping
- Fine-tuning dataset design
- Thematic pattern recognition
- Content categorization and clustering

OBJECTIVE: Identify 5-8 key themes that will optimize Q&A generation for ${goalConfig?.name} fine-tuning, ensuring comprehensive coverage and high-quality dataset creation.`;

    const userPrompt = `Analyze the content and identify 5-8 key themes optimized for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

${goalGuidance}

THEME IDENTIFICATION REQUIREMENTS:
- Identify themes that support generation of 100+ diverse, high-quality Q&A pairs
- Focus on themes that align with the ${goalConfig?.name} objective
- Consider both broad thematic areas and specific subtopics
- Ensure themes are search-friendly for potential web augmentation
- Balance comprehensive coverage with focused depth
- Prioritize themes that will enhance fine-tuning effectiveness

OUTPUT FORMAT:
Return a JSON array of 5-8 theme strings, each representing a specific, actionable theme.

EXAMPLE THEMES for ${goalConfig?.name}:
${this.getExampleThemes(fineTuningGoal)}

CONTENT TO ANALYZE:
---
${combinedContent.substring(0, 18000)}${combinedContent.length > 18000 ? '\n[Content truncated for analysis focus]' : ''}
---

Generate the theme array now:`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will analyze the content and identify 5-8 key themes optimized for your fine-tuning goal.' }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1200, // Increased for more detailed theme analysis
          temperature: 0.3, // Lower temperature for consistent theme identification
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

      console.log('[GEMINI] Identified themes:', validThemes);
      return validThemes.slice(0, 8); // Limit to 8 themes max
    } catch (error: any) {
      console.error('[GEMINI] Theme identification failed:', error);
      // Return empty array if theme identification fails - web search will still work
      return [];
    }
  }

  private getExampleThemes(goal: FineTuningGoal): string {
    switch (goal) {
      case 'topic':
        return '["artificial intelligence ethics and governance", "machine learning algorithm fundamentals", "neural network architecture patterns", "AI safety and alignment protocols", "deep learning application domains"]';
      case 'knowledge':
        return '["API documentation and implementation procedures", "database configuration and optimization techniques", "troubleshooting methodologies and diagnostic processes", "security implementation protocols and best practices", "performance optimization strategies and monitoring"]';
      case 'style':
        return '["technical writing clarity and precision standards", "professional communication tone and register", "persuasive argumentation structure and techniques", "audience engagement and interaction strategies", "concise explanation methodologies and frameworks"]';
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

    const systemPrompt = `You are an expert content processor specializing in text cleaning and optimization for fine-tuning dataset preparation.

EXPERTISE:
- Content extraction and cleaning
- Text normalization and standardization
- Information preservation and quality enhancement
- Format optimization for AI training

OBJECTIVE: Clean and optimize text content while preserving all valuable information for fine-tuning dataset generation.`;

    const userPrompt = `Clean and optimize the following text content from "${fileName}":

CLEANING REQUIREMENTS:
1. Remove advertisements, navigation elements, headers, footers, and boilerplate content
2. Eliminate non-essential formatting, markup, and syntax artifacts
3. Preserve all core textual information and meaningful content
4. Maintain logical structure and paragraph organization
5. Standardize spacing and line breaks for consistency
6. Remove redundant or duplicate content sections
7. Preserve technical terms, proper nouns, and domain-specific language
8. Ensure the output is clean, readable plain text optimized for Q&A generation

CONTENT PRESERVATION PRIORITIES:
- Factual information and data points
- Procedural knowledge and instructions
- Conceptual explanations and definitions
- Examples and case studies
- Technical specifications and requirements
- Relationships and dependencies between concepts

Return only the cleaned, optimized text content without commentary or explanations.

CONTENT TO CLEAN:
---
${textContent}
---`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will clean and optimize the text content while preserving all valuable information.' }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          maxOutputTokens: 10000, // Increased to handle larger content without truncation
          temperature: 0.1, // Very low temperature for consistent cleaning
        },
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

    const systemPrompt = `You are an expert document processor specializing in extracting and optimizing text content from binary files for fine-tuning dataset preparation.

EXPERTISE:
- Document content extraction and analysis
- Text optimization and cleaning
- Information structure preservation
- Quality enhancement for AI training

OBJECTIVE: Extract all valuable textual content from the binary file and optimize it for fine-tuning dataset generation.`;

    const userParts: Part[] = [
      { text: systemPrompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
      {
        text: `Extract and optimize all textual content from this file: "${fileName}" (${mimeType})

EXTRACTION REQUIREMENTS:
1. Extract all relevant textual content comprehensively
2. Preserve document structure and logical organization
3. Maintain headings, sections, and hierarchical relationships
4. Include all factual information, procedures, and explanations
5. Preserve technical terms, proper nouns, and domain-specific language
6. Ignore images, complex layouts, and purely visual elements
7. Remove headers, footers, page numbers, and document metadata
8. Standardize formatting for optimal Q&A generation

CONTENT PRIORITIES:
- Main body text and content sections
- Headings and subheadings for structure
- Lists, tables, and structured information
- Captions and explanatory text
- Technical specifications and data
- Procedural instructions and guidelines

Return only the extracted, optimized text content without commentary. If no meaningful text is found, return an empty response.`,
      },
    ];

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: userParts }],
        config: {
          maxOutputTokens: 10000, // Increased to handle larger extracted content
          temperature: 0.1, // Very low temperature for consistent extraction
        },
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
      ? `\n\nPRIORITY THEMES FOR WEB SEARCH: ${identifiedThemes.join(', ')}`
      : '';

    const goalSpecificGuidance = this.getGoalSpecificWebSearchGuidance(fineTuningGoal);

    const systemPrompt = `You are an expert content augmentation specialist with access to real-time web search capabilities, optimizing content for ${goalConfig?.name} fine-tuning.

EXPERTISE:
- Content analysis and enhancement
- Web research and information synthesis
- Knowledge integration and coherence
- Fine-tuning dataset optimization
- Information quality assessment

OBJECTIVE: Enhance the original content with targeted web research to create a comprehensive, coherent resource optimized for generating 100+ high-quality Q&A pairs for ${goalConfig?.name} fine-tuning.`;

    const userPrompt = `Enhance the original content with targeted web research for ${goalConfig?.name} fine-tuning optimization.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}${themeGuidance}

${goalSpecificGuidance}

AUGMENTATION STRATEGY:
1. Analyze core themes and identify enhancement opportunities
2. Use Google Search to find current, authoritative information
3. Integrate web-sourced content seamlessly with original material
4. Maintain coherent narrative flow and logical organization
5. Prioritize factual accuracy and source credibility
6. Enhance content depth while preserving original themes
7. Optimize for comprehensive Q&A generation coverage

INTEGRATION REQUIREMENTS:
- Preserve all original content and themes
- Add complementary information that enhances understanding
- Include current facts, statistics, and developments
- Maintain consistent tone and style throughout
- Ensure seamless integration without redundancy
- Focus on areas that will improve Q&A generation quality

QUALITY STANDARDS:
- All added information must be factually accurate and current
- Sources should be authoritative and credible
- Content should directly support the ${goalConfig?.name} objective
- Integration should feel natural and coherent
- Enhanced content should enable generation of 100+ diverse Q&A pairs

Return ONLY the enhanced, integrated content without commentary or source citations.

ORIGINAL CONTENT TO ENHANCE:
---
${originalContent}
---`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will enhance the content with targeted web research while maintaining coherence and optimizing for your fine-tuning goal.' }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 12000, // Increased for comprehensive augmentation
          temperature: 0.4, // Balanced temperature for creative integration
        },
      });

      const augmentedText = response.text?.trim() || originalContent;
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata as GroundingMetadata;

      console.log('[GEMINI] Web augmentation completed, enhanced content length:', augmentedText.length);
      return { augmentedText, groundingMetadata };
    } catch (error: any) {
      throw new Error(`Web augmentation failed: ${error.message || 'Unknown error'}`);
    }
  }

  private getGoalSpecificWebSearchGuidance(goal: FineTuningGoal): string {
    switch (goal) {
      case 'topic':
        return `
WEB SEARCH STRATEGY for ${goal.toUpperCase()}:
- Search for related concepts, theoretical frameworks, and academic perspectives
- Find current developments and emerging trends in the topic areas
- Look for comparative analyses and topic relationships
- Include diverse viewpoints and approaches to the themes
- Search for educational resources and explanatory content
- Focus on enhancing thematic depth and conceptual understanding
- Prioritize content that supports topic-based Q&A generation`;

      case 'knowledge':
        return `
WEB SEARCH STRATEGY for ${goal.toUpperCase()}:
- Search for current facts, statistics, and authoritative data
- Find procedural knowledge, best practices, and implementation guides
- Look for technical specifications, standards, and requirements
- Include case studies, examples, and practical applications
- Search for troubleshooting guides and problem-solving resources
- Focus on enhancing factual accuracy and procedural completeness
- Prioritize content that supports knowledge-based Q&A generation`;

      case 'style':
        return `
WEB SEARCH STRATEGY for ${goal.toUpperCase()}:
- Search for style guides, writing standards, and communication best practices
- Find examples of effective communication in similar contexts
- Look for rhetorical techniques and persuasion strategies
- Include audience engagement and interaction methodologies
- Search for tone and voice consistency guidelines
- Focus on enhancing stylistic elements and communication patterns
- Prioritize content that supports style-based Q&A generation`;

      default:
        return 'Focus on comprehensive content enhancement covering all aspects relevant to the fine-tuning objective.';
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
      ? `\n\nKEY THEMES TO COVER: ${themes.join(', ')}\nEnsure comprehensive coverage of these themes across the generated Q&A pairs.`
      : '';

    const goalSpecificGuidance = this.getGoalSpecificQAGuidance(fineTuningGoal);

    const systemPrompt = `You are an expert Q&A dataset generator specializing in creating high-quality training data for ${goalConfig?.name} fine-tuning.

EXPERTISE:
- Question generation across multiple difficulty levels and types
- Answer optimization for fine-tuning effectiveness
- Content analysis and comprehensive coverage
- Quality assessment and consistency maintenance
- Dataset balance and discrimination training

OBJECTIVE: Generate exactly ${QA_PAIR_COUNT_TARGET} high-quality Q&A pairs optimized for ${goalConfig?.name} fine-tuning, including strategic incorrect answers for model discrimination training.`;

    const userPrompt = `Generate exactly ${QA_PAIR_COUNT_TARGET} high-quality Q&A pairs optimized for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}${themeGuidance}

${goalSpecificGuidance}

GENERATION REQUIREMENTS:
- Generate exactly ${QA_PAIR_COUNT_TARGET} total Q&A pairs
- Include approximately 5-10% incorrect answers (${Math.ceil(QA_PAIR_COUNT_TARGET * INCORRECT_ANSWER_RATIO)} pairs) for discrimination training
- Questions must be natural, diverse, and appropriately challenging
- Cover multiple difficulty levels from basic to advanced
- Ensure comprehensive coverage of all content areas
- Avoid self-referential phrases like "according to the text" or "based on the document"
- Create questions that would naturally arise from users interested in this content

QUALITY STANDARDS FOR CORRECT ANSWERS:
- Comprehensive and informative responses
- Factually accurate based on the provided content
- Appropriate depth and detail for the question complexity
- Clear, well-structured, and easy to understand
- Aligned with the ${goalConfig?.name} objective
- Confidence scores between 0.85-0.95

QUALITY STANDARDS FOR INCORRECT ANSWERS:
- Plausible but factually wrong information
- Similar structure and style to correct answers
- Common misconceptions or logical errors
- Clearly distinguishable as incorrect for training purposes
- Confidence scores between 0.1-0.4

JSON FORMAT REQUIREMENTS:
- Return a valid JSON array of exactly ${QA_PAIR_COUNT_TARGET} objects
- Each object must have: "user", "model", "isCorrect", "confidence"
- Properly escape all strings and special characters
- No additional commentary or explanations

EXAMPLE FORMAT:
[
  {
    "user": "What is the primary benefit of this approach?",
    "model": "The primary benefit is [detailed, accurate answer based on content]",
    "isCorrect": true,
    "confidence": 0.92
  },
  {
    "user": "When was this method first developed?",
    "model": "This method was first developed in 1995 by researchers at MIT",
    "isCorrect": false,
    "confidence": 0.25
  }
]

CONTENT FOR Q&A GENERATION:
---
${content}
---

Generate exactly ${QA_PAIR_COUNT_TARGET} Q&A pairs now:`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: `I understand. I will generate exactly ${QA_PAIR_COUNT_TARGET} high-quality Q&A pairs optimized for ${goalConfig?.name} fine-tuning, including strategic incorrect answers for discrimination training.` }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 12000, // Increased to handle 100 Q&A pairs without truncation
          temperature: 0.6, // Balanced temperature for diverse question generation
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

      console.log('[GEMINI] Generated Q&A pairs:', {
        total: shuffledPairs.length,
        correct: shuffledPairs.filter(p => p.isCorrect).length,
        incorrect: shuffledPairs.filter(p => !p.isCorrect).length
      });

      return shuffledPairs;
    } catch (error: any) {
      throw new Error(`Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  // UPDATED: Analyze generated Q&A dataset to identify knowledge gaps with enhanced prompting
  public async identifyKnowledgeGaps(
    originalContent: string,
    identifiedThemes: string[],
    generatedQAPairs: QAPair[],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<KnowledgeGap[]> {
    if (!this.ai) {
      throw new Error('Gemini service not initialized');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const existingQuestions = generatedQAPairs.map(pair => pair.user);
    const existingTopics = generatedQAPairs.map(pair => `Q: ${pair.user.substring(0, 100)}...`);

    const systemPrompt = `You are an expert dataset analyst specializing in knowledge gap identification for fine-tuning dataset optimization.

EXPERTISE:
- Comprehensive content analysis and coverage assessment
- Knowledge domain mapping and gap identification
- Fine-tuning dataset quality evaluation
- Question type diversity analysis
- Content completeness verification

OBJECTIVE: Identify 5-8 significant knowledge gaps in the generated Q&A dataset that should be addressed with additional synthetic Q&A pairs to optimize ${goalConfig?.name} fine-tuning effectiveness.`;

    const userPrompt = `Analyze the generated Q&A dataset against the original content to identify significant knowledge gaps for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

DATASET ANALYSIS CONTEXT:
- Original content themes: ${identifiedThemes.join(', ')}
- Generated Q&A pairs: ${generatedQAPairs.length} total
- Correct answers: ${generatedQAPairs.filter(p => p.isCorrect).length}
- Incorrect answers: ${generatedQAPairs.filter(p => !p.isCorrect).length}

EXISTING QUESTION COVERAGE (sample):
${existingTopics.slice(0, 20).map((topic, i) => `${i + 1}. ${topic}`).join('\n')}
${existingTopics.length > 20 ? `... and ${existingTopics.length - 20} more questions` : ''}

GAP IDENTIFICATION CRITERIA:
1. **Content Coverage Gaps**: Areas of the original content not adequately covered
2. **Question Type Diversity**: Missing question types that would improve ${goalConfig?.name} training
3. **Complexity Level Gaps**: Missing difficulty levels or depth variations
4. **Theme Representation**: Under-represented themes from the identified theme list
5. **Fine-tuning Alignment**: Areas that would specifically benefit ${goalConfig?.promptFocus}
6. **Edge Case Coverage**: Important scenarios or conditions not addressed

ANALYSIS REQUIREMENTS:
- Compare generated Q&A coverage against original content comprehensiveness
- Identify 5-8 specific, actionable knowledge gaps
- Prioritize gaps based on impact on ${goalConfig?.name} fine-tuning quality
- Focus on gaps that would generate 10-15 additional high-quality Q&A pairs each
- Consider both content gaps and methodological gaps
- Ensure identified gaps are specific enough for targeted synthetic generation

For each gap, provide:
- Unique identifier (gap_1, gap_2, etc.)
- Clear, specific description of the missing knowledge area
- Related theme from the original content themes
- Priority level (high/medium/low) based on ${goalConfig?.name} importance
- Suggested question types that would fill this gap
- Related concepts that synthetic pairs should cover

ORIGINAL CONTENT FOR REFERENCE:
---
${originalContent.substring(0, 15000)}${originalContent.length > 15000 ? '\n[Content truncated for analysis focus]' : ''}
---

Return a JSON array of knowledge gap objects:
[
  {
    "id": "gap_1",
    "description": "Specific description of the missing knowledge area",
    "theme": "related_theme_from_original_themes",
    "priority": "high|medium|low",
    "suggestedQuestionTypes": ["specific_question_type_1", "specific_question_type_2"],
    "relatedConcepts": ["concept1", "concept2", "concept3"]
  }
]`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: `I understand. I will analyze the Q&A dataset comprehensively to identify significant knowledge gaps for ${goalConfig?.name} fine-tuning optimization.` }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 5000, // Increased for comprehensive gap analysis
          temperature: 0.3, // Lower temperature for consistent analysis
        },
      });

      const gaps = this.parseJsonResponse(response.text);

      if (!Array.isArray(gaps)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validGaps = gaps.filter((gap): gap is KnowledgeGap =>
        gap &&
        typeof gap.id === 'string' &&
        typeof gap.description === 'string' &&
        typeof gap.theme === 'string' &&
        ['high', 'medium', 'low'].includes(gap.priority) &&
        Array.isArray(gap.suggestedQuestionTypes) &&
        Array.isArray(gap.relatedConcepts)
      ).slice(0, 8); // Limit to 8 gaps max

      console.log('[GEMINI] Identified knowledge gaps:', {
        total: validGaps.length,
        high: validGaps.filter(g => g.priority === 'high').length,
        medium: validGaps.filter(g => g.priority === 'medium').length,
        low: validGaps.filter(g => g.priority === 'low').length
      });

      return validGaps;

    } catch (error: any) {
      console.error('[GEMINI] Knowledge gap identification failed:', error);
      throw new Error(`Knowledge gap identification failed: ${error.message || 'Unknown error'}`);
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

    const systemPrompt = `You are an expert fact-checker and Q&A validator specializing in fine-tuning dataset quality assurance.

EXPERTISE:
- Factual accuracy verification and assessment
- Content relevance and quality evaluation
- Fine-tuning dataset optimization
- Knowledge gap coverage validation
- Quality standard enforcement

OBJECTIVE: Validate the accuracy, relevance, and quality of a synthetic Q&A pair against the reference content for ${goalConfig?.name} fine-tuning optimization.`;

    const userPrompt = `Validate this synthetic Q&A pair against the reference content for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}

SYNTHETIC Q&A PAIR TO VALIDATE:
Question: "${syntheticPair.user}"
Answer: "${syntheticPair.model}"
Claimed Correctness: ${syntheticPair.isCorrect ? 'CORRECT' : 'INCORRECT'}
Target Gap: ${syntheticPair.targetGap}
Generation Reasoning: ${syntheticPair.generationReasoning || 'Not provided'}

VALIDATION CRITERIA:
1. **Factual Accuracy**: Is the answer factually correct based on the reference content?
2. **Content Alignment**: Does the Q&A pair align with the reference material?
3. **Relevance**: Does the pair support the ${goalConfig?.name} objective effectively?
4. **Quality**: Is the answer comprehensive, clear, and well-structured?
5. **Consistency**: Does the claimed correctness match the actual accuracy?
6. **Gap Coverage**: Does this pair effectively address the target knowledge gap?
7. **Fine-tuning Value**: Will this improve model performance for ${goalConfig?.promptFocus}?

VALIDATION STANDARDS:
- Answers must be grounded in the reference content
- Quality should match or exceed the standards of the original dataset
- Incorrect answers should be clearly wrong but plausible
- All pairs should contribute meaningfully to fine-tuning effectiveness

REFERENCE CONTENT:
---
${referenceContent.substring(0, 12000)}${referenceContent.length > 12000 ? '\n[Content truncated for validation focus]' : ''}
---

Provide validation assessment as JSON:
{
  "isValid": boolean,
  "confidence": number,
  "reasoning": "Detailed explanation of validation decision",
  "suggestedCorrection": "If invalid, suggest correction",
  "factualAccuracy": number,
  "relevanceScore": number
}`;

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will validate the synthetic Q&A pair comprehensively against the reference content and quality standards.' }] },
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2000, // Sufficient for detailed validation response
          temperature: 0.2, // Very low temperature for consistent validation
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
      console.error('[GEMINI] Q&A validation failed:', error);
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