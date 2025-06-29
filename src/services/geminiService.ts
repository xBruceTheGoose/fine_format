import { QAPair, GroundingMetadata, FineTuningGoal, KnowledgeGap } from '../types';
import { FINE_TUNING_GOALS, INCORRECT_ANSWER_RATIO } from '../constants';

class GeminiService {
  private baseUrl = '/.netlify/functions/gemini-chat';

  constructor() {
    console.log('[GEMINI] Service initialized - using Netlify functions');
  }

  public isReady(): boolean {
    return true;
  }

  private async makeRequest(
    messages: Array<{ role: string; content?: string; parts?: any[] }>,
    temperature = 0.7,
    maxTokens = 4000,
    tools?: any,
    config?: any
  ): Promise<{ content: string; groundingMetadata?: GroundingMetadata; truncated?: boolean }> {
    console.log('[GEMINI] Making request to Netlify function');

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages,
          temperature,
          max_tokens: maxTokens,
          tools,
          config
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[GEMINI] Netlify function error:', response.status, errorData);
        throw new Error(`Netlify function error: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.content) {
        console.error('[GEMINI] No content in response:', data);
        throw new Error('No content received from Netlify function');
      }

      console.log('[GEMINI] Request successful, response length:', data.content.length);
      
      if (data.truncated) {
        console.warn('[GEMINI] ⚠️ Response was truncated due to token limit');
      }

      return {
        content: data.content,
        groundingMetadata: data.candidates?.[0]?.groundingMetadata,
        truncated: data.truncated
      };

    } catch (error: any) {
      console.error('[GEMINI] Request failed:', error);
      throw new Error(`Gemini service request failed: ${error.message || 'Unknown error'}`);
    }
  }

  private parseJsonResponse(responseText: string): any {
    console.log('[GEMINI] Parsing JSON response, length:', responseText.length);
    
    let jsonStr = responseText.trim();
    
    // Remove code fences if present
    const fenceRegex = /^```(?:json)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match?.[1]) {
      jsonStr = match[1].trim();
      console.log('[GEMINI] Removed code fences from response');
    }

    // Enhanced JSON extraction with multiple strategies
    return this.parseWithMultipleStrategies(jsonStr, responseText);
  }

  private parseWithMultipleStrategies(jsonStr: string, originalResponse: string): any {
    // Strategy 1: Direct parsing
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[GEMINI] ✅ Direct parsing successful with', parsed.length, 'items');
        return parsed;
      }
    } catch (error) {
      console.warn('[GEMINI] Direct parsing failed:', error.message);
    }

    // Strategy 2: Extract JSON array boundaries
    try {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const extracted = arrayMatch[0];
        const parsed = JSON.parse(extracted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log('[GEMINI] ✅ Array extraction successful with', parsed.length, 'items');
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[GEMINI] Array extraction failed:', error.message);
    }

    // Strategy 3: Fix common JSON issues and retry
    try {
      const fixedJson = this.fixCommonJsonIssues(jsonStr);
      const parsed = JSON.parse(fixedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log('[GEMINI] ✅ Fixed JSON parsing successful with', parsed.length, 'items');
        return parsed;
      }
    } catch (error) {
      console.warn('[GEMINI] Fixed JSON parsing failed:', error.message);
    }

    // Strategy 4: Extract individual objects
    try {
      const extractedObjects = this.extractIndividualObjects(originalResponse);
      if (extractedObjects.length > 0) {
        console.log('[GEMINI] ✅ Object extraction successful with', extractedObjects.length, 'items');
        return extractedObjects;
      }
    } catch (error) {
      console.warn('[GEMINI] Object extraction failed:', error.message);
    }

    // Strategy 5: Partial recovery from truncated response
    try {
      const partialObjects = this.recoverPartialResponse(originalResponse);
      if (partialObjects.length > 0) {
        console.log('[GEMINI] ⚠️ Partial recovery successful with', partialObjects.length, 'items');
        return partialObjects;
      }
    } catch (error) {
      console.warn('[GEMINI] Partial recovery failed:', error.message);
    }

    // All strategies failed
    console.error('[GEMINI] ❌ All parsing strategies failed');
    console.error('[GEMINI] Response length:', originalResponse.length);
    console.error('[GEMINI] First 500 chars of failed response:', originalResponse.substring(0, 500));
    console.error('[GEMINI] Last 500 chars of failed response:', originalResponse.substring(Math.max(0, originalResponse.length - 500)));
    
    if (originalResponse.trim().startsWith('<')) {
      console.error('[GEMINI] Critical: Response appears to be HTML/XML, not JSON. This might indicate a server-side error page or misconfiguration.');
    }
    
    throw new Error(`Failed to parse JSON response. Response may be truncated or malformed. Length: ${originalResponse.length}`);
  }

  private fixCommonJsonIssues(jsonStr: string): string {
    return jsonStr
      // Remove trailing commas
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix unescaped quotes in strings
      .replace(/(?<!\\)"/g, '\\"')
      .replace(/\\\\"/g, '\\"')
      // Fix incomplete objects at the end
      .replace(/,\s*$/, '')
      // Ensure proper array closure
      .replace(/}\s*$/, '}]')
      // Remove control characters
      .replace(/[\x00-\x1F\x7F]/g, '');
  }

  private extractIndividualObjects(text: string): any[] {
    console.log('[GEMINI] Extracting individual JSON objects');
    
    // Enhanced regex to match complete JSON objects
    const objectPattern = /\{\s*"user"\s*:\s*"[^"]*(?:\\.[^"]*)*"\s*,\s*"model"\s*:\s*"[^"]*(?:\\.[^"]*)*"\s*,\s*"isCorrect"\s*:\s*(?:true|false)\s*(?:,\s*"confidence"\s*:\s*[\d.]+)?\s*\}/g;
    
    const matches = text.match(objectPattern) || [];
    console.log('[GEMINI] Found', matches.length, 'potential objects');
    
    const validObjects = [];
    for (const match of matches) {
      try {
        const obj = JSON.parse(match);
        if (this.isValidQAPair(obj)) {
          validObjects.push(obj);
        }
      } catch (error) {
        console.warn('[GEMINI] Failed to parse extracted object:', error.message);
      }
    }
    
    return validObjects;
  }

  private recoverPartialResponse(text: string): any[] {
    console.log('[GEMINI] Attempting partial response recovery');
    
    // Look for the start of the JSON array
    const arrayStart = text.indexOf('[');
    if (arrayStart === -1) {
      return [];
    }
    
    // Extract everything from the array start
    const arrayContent = text.substring(arrayStart);
    
    // Find complete objects before any truncation
    const objects = [];
    let currentPos = 1; // Skip the opening bracket
    let braceCount = 0;
    let inString = false;
    let escaped = false;
    let objectStart = -1;
    
    for (let i = currentPos; i < arrayContent.length; i++) {
      const char = arrayContent[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) {
        continue;
      }
      
      if (char === '{') {
        if (braceCount === 0) {
          objectStart = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && objectStart !== -1) {
          // Complete object found
          const objectStr = arrayContent.substring(objectStart, i + 1);
          try {
            const obj = JSON.parse(objectStr);
            if (this.isValidQAPair(obj)) {
              objects.push(obj);
            }
          } catch (error) {
            console.warn('[GEMINI] Failed to parse recovered object:', error.message);
          }
          objectStart = -1;
        }
      }
    }
    
    console.log('[GEMINI] Recovered', objects.length, 'complete objects from partial response');
    return objects;
  }

  private isValidQAPair(obj: any): boolean {
    return obj &&
           typeof obj.user === 'string' &&
           typeof obj.model === 'string' &&
           typeof obj.isCorrect === 'boolean' &&
           obj.user.trim().length > 0 &&
           obj.model.trim().length > 0;
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
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'I understand. I will analyze the content and identify 5-8 key themes optimized for your fine-tuning goal.' },
        { role: 'user', content: userPrompt }
      ], 0.3, 1200, undefined, { responseMimeType: 'application/json' });

      const themes = this.parseJsonResponse(response.content);

      if (!Array.isArray(themes)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validThemes = themes.filter(
        (theme): theme is string =>
          typeof theme === 'string' && theme.trim().length > 0
      );

      console.log('[GEMINI] Identified themes:', validThemes);
      return validThemes.slice(0, 8);
    } catch (error: any) {
      console.error('[GEMINI] Theme identification failed:', error);
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

  public async augmentWithWebSearch(
    originalContent: string,
    identifiedThemes: string[] = [],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<{ augmentedText: string; groundingMetadata?: GroundingMetadata }> {
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
1. Analyze core themes and identify enhancement opportunities.
2. Use Google Search to find current, authoritative, and *recently updated* information relevant to these themes.
3. Prioritize fetching information that is *new* and not redundant with the original content, unless it offers significant updates or deeper insights.
4. Integrate web-sourced content seamlessly, ensuring it is distinct and complementary, not just a rephrasing of existing text.
5. Maintain coherent narrative flow and logical organization.
6. Prioritize factual accuracy and source credibility in all augmented content.
7. Enhance content depth and breadth while preserving original core themes.
8. Optimize the combined content for comprehensive Q&A generation coverage.

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
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: 'I understand. I will enhance the content with targeted web research while maintaining coherence and optimizing for your fine-tuning goal.' },
        { role: 'user', content: userPrompt }
      ], 0.4, 12000, [{ googleSearch: {} }]);

      const augmentedText = response.content?.trim() || originalContent;
      const groundingMetadata = response.groundingMetadata;

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
    if (content.length < 50) {
      throw new Error('Content too short for Q&A generation (minimum 50 characters)');
    }

    const goalConfig = FINE_TUNING_GOALS.find(g => g.id === fineTuningGoal);
    const themeGuidance = themes.length > 0 
      ? `\n\nKEY THEMES TO COVER: ${themes.join(', ')}\nEnsure comprehensive coverage of these themes across the generated Q&A pairs.`
      : '';

    const goalSpecificGuidance = this.getGoalSpecificQAGuidance(fineTuningGoal);

    console.log(`[GEMINI] Starting Q&A generation for content length: ${content.length}`);

    // Use a more aggressive approach for Q&A generation
    const systemPrompt = `You are an expert Q&A dataset generator specializing in creating high-quality training data for ${goalConfig?.name} fine-tuning.

EXPERTISE:
- Question generation across multiple difficulty levels and types
- Answer optimization for fine-tuning effectiveness
- Content analysis and comprehensive coverage
- Quality assessment and consistency maintenance
- Dataset balance and discrimination training

OBJECTIVE: Generate as many high-quality Q&A pairs as possible from the provided content. Focus on creating diverse, relevant questions with accurate answers that will optimize ${goalConfig?.name} fine-tuning.

CRITICAL SUCCESS FACTORS:
- Extract maximum value from every piece of content
- Create questions that test different aspects of understanding
- Ensure answers are comprehensive yet concise
- Include both correct and strategically incorrect answers for discrimination training
- Maintain high quality standards throughout`;

    const userPrompt = `Generate comprehensive Q&A pairs from the provided content for ${goalConfig?.name} fine-tuning.

FINE-TUNING GOAL: ${goalConfig?.name}
FOCUS: ${goalConfig?.promptFocus}${themeGuidance}

${goalSpecificGuidance}

GENERATION REQUIREMENTS:
- Generate as many high-quality Q&A pairs as the content supports
- Aim for approximately 92% correct answers and 8% incorrect answers
- Ensure variety in question types and complexity levels
- Cover different aspects and details of the content thoroughly
- Make incorrect answers plausible but clearly wrong to aid discrimination training
- Focus on content that directly supports the ${goalConfig?.name} objective

QUALITY STANDARDS:
- Questions must be clear, specific, and answerable from the content
- Correct answers must be accurate, comprehensive, and well-structured
- Incorrect answers must be plausible but factually wrong
- All pairs must contribute meaningfully to fine-tuning effectiveness
- Maintain consistency in style and approach

CRITICAL JSON FORMAT:
- Respond with ONLY a valid JSON array
- Start immediately with [ and end with ]
- Each object: {"user": "question", "model": "answer", "isCorrect": boolean, "confidence": number}
- Properly escape all strings (use \\" for quotes, \\n for newlines)
- No markdown, explanations, or code blocks

CONTENT TO PROCESS:
---
${content.substring(0, 12000)}${content.length > 12000 ? '\n[Content continues but truncated for this request]' : ''}
---

Generate Q&A pairs now:`;

    try {
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: `I understand. I will generate comprehensive Q&A pairs from the content, focusing on quality and relevance for ${goalConfig?.name} fine-tuning.` },
        { role: 'user', content: userPrompt }
      ], 0.6, 10000, undefined, { responseMimeType: 'application/json' });

      const qaData = this.parseJsonResponse(response.content);

      if (!Array.isArray(qaData)) {
        throw new Error('Response is not a valid JSON array');
      }

      const validPairs = qaData.filter(
        (item): item is QAPair =>
          this.isValidQAPair(item)
      ).map(pair => ({
        ...pair,
        confidence: pair.confidence || (pair.isCorrect ? 0.9 : 0.2),
        source: 'original' as const
      }));

      console.log(`[GEMINI] Q&A generation completed:`, {
        received: qaData.length,
        valid: validPairs.length,
        correct: validPairs.filter(p => p.isCorrect).length,
        incorrect: validPairs.filter(p => !p.isCorrect).length
      });

      if (validPairs.length === 0) {
        console.warn('[GEMINI] No valid Q&A pairs generated from content');
        throw new Error('Failed to generate any valid Q&A pairs from the content. The content may not be suitable for Q&A generation.');
      }

      return this.shuffleArray(validPairs);

    } catch (error: any) {
      console.error(`[GEMINI] Q&A generation failed:`, error);
      throw new Error(`Q&A generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  public async identifyKnowledgeGaps(
    originalContent: string,
    identifiedThemes: string[],
    generatedQAPairs: QAPair[],
    fineTuningGoal: FineTuningGoal = 'knowledge'
  ): Promise<KnowledgeGap[]> {
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
      const response = await this.makeRequest([
        { role: 'user', content: systemPrompt },
        { role: 'assistant', content: `I understand. I will analyze the Q&A dataset comprehensively to identify significant knowledge gaps for ${goalConfig?.name} fine-tuning optimization.` },
        { role: 'user', content: userPrompt }
      ], 0.3, 5000, undefined, { responseMimeType: 'application/json' });

      const gaps = this.parseJsonResponse(response.content);

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
      ).slice(0, 8);

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