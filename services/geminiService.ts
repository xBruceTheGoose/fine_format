
import { GoogleGenAI, GenerateContentResponse, Part } from "@google/genai";
import { QAPair, GroundingMetadata } from '../types';
import { GEMINI_TEXT_MODEL, QA_PAIR_COUNT_TARGET } from '../constants';

const parseJsonFromGeminiResponse = (responseText: string): any => {
  let jsonStr = responseText.trim();
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s; // Matches ```json ... ``` or ``` ... ```
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse JSON response:", e, "Raw response:", responseText);
    throw new Error(`Failed to parse Q&A JSON from Gemini. Raw output: ${responseText.substring(0,100)}...`);
  }
};

export const getCleanedTextFromString = async (
  ai: GoogleGenAI,
  textContent: string,
  fileName: string
): Promise<string> => {
  try {
    const model = GEMINI_TEXT_MODEL;
    const prompt = `The following text is from a file named "${fileName}". Clean this content by removing any advertisements, website navigation elements, headers, footers, non-essential syntax, or irrelevant formatting. Retain only the core textual information. Return ONLY the cleaned plain text, without any additional commentary or explanation before or after the text itself. Content:\n\n${textContent}`;
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{text: prompt}] }],
    });
    return response.text.trim();
  } catch (error: any) {
    console.error('Error cleaning text from string:', error);
    throw new Error(`Gemini API error during text cleaning: ${error.message || 'Unknown error'}`);
  }
};

export const getCleanedTextFromBase64 = async (
  ai: GoogleGenAI,
  base64Data: string,
  mimeType: string,
  fileName: string
): Promise<string> => {
  try {
    const model = GEMINI_TEXT_MODEL;
    // const fileExtension = fileName.split('.').pop() || 'document'; // Not actively used in prompt
    const userParts: Part[] = [
      {
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      },
      {
        text: `This file is named "${fileName}" (MIME type: ${mimeType}). Extract all relevant textual content. Discard any images, complex layouts, advertisements, headers, footers, and purely stylistic elements. Return ONLY the clean, plain text content. If the document is primarily non-textual or extraction is not possible, return an empty string or a clear statement like "No text content found". Do not add any commentary or explanation before or after the extracted text.`,
      },
    ];
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{role: "user", parts: userParts}],
    });
    return response.text.trim();
  } catch (error: any) {
    console.error('Error cleaning text from base64:', error);
    throw new Error(`Gemini API error during base64 content cleaning: ${error.message || 'Unknown error'}`);
  }
};

export const getAugmentedContentWithWebSearch = async (
  ai: GoogleGenAI,
  originalContent: string,
): Promise<{ augmentedText: string; groundingMetadata?: GroundingMetadata }> => {
  try {
    const model = GEMINI_TEXT_MODEL;
    const prompt = `You are an expert content augmenter. The following is an original text. Your task is to:
1. Understand its core content and themes.
2. Use Google Search to find highly relevant, factual, and up-to-date information from the web that expands upon, clarifies, or provides additional context to the original text. Prioritize information that is distinct from what's already in the text.
3. Seamlessly integrate this web-sourced information with the original text to create a richer, more comprehensive single piece of content. The final output should be a coherent narrative.
4. Ensure the augmented content remains focused on the original themes and enhances its value.
5. Return *only* the full, augmented text. Do not add any commentary, preamble, or summary before or after the text. Do not format it as a Q&A or list.

Original Text:
---
${originalContent}
---
Augmented Text:`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        // As per guidelines, DO NOT add responseMimeType: "application/json" when using googleSearch.
      },
    });

    const augmentedText = response.text.trim();
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;

    return { augmentedText, groundingMetadata };

  } catch (error: any) {
    console.error('Error augmenting content with web search:', error);
    throw new Error(`Gemini API error during web augmentation: ${error.message || 'Unknown error'}`);
  }
};


export const generateQAPairs = async (
  ai: GoogleGenAI,
  contentForQA: string
): Promise<QAPair[]> => {
  if (contentForQA.length < 50) { // Arbitrary minimum length
    console.warn("Content for Q&A generation is very short, results might be suboptimal or empty.");
    // Return empty or throw error, decided to let API attempt and handle its response.
  }
  try {
    const model = GEMINI_TEXT_MODEL;
    // Updated prompt to be very explicit about output format and avoiding self-reference.
    const prompt = `Based on the provided text, generate a dataset of approximately ${QA_PAIR_COUNT_TARGET} question-answer pairs suitable for fine-tuning an AI model.
Each question should be a natural user query that can be answered directly from the provided text.
Each answer should be factual, directly derived from the text, and phrased naturally.
Crucially, answers must NOT refer to the text itself (e.g., avoid phrases like 'according to the text', 'based on the content', 'the text states that', 'in the provided document', etc.).
Format your response ONLY as a valid JSON array of objects. Each object in the array must have exactly two string keys: "user" (for the question) and "model" (for the answer).
Example: [{"user": "What color is the sky on a clear day?", "model": "The sky is blue on a clear day."}]
Do not include any other text, explanations, apologies, or markdown formatting outside of this JSON array.

Provided Text:
---
${contentForQA}
---
JSON Output:`;
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{role: "user", parts: [{text: prompt}]}],
      config: {
        responseMimeType: "application/json", // Expecting a JSON string from the model
      }
    });

    const qaData = parseJsonFromGeminiResponse(response.text);
    
    if (!Array.isArray(qaData)) {
         console.error("Generated Q&A data is not an array:", qaData);
         throw new Error('Gemini returned Q&A data that is not a JSON array.');
    }
    if (qaData.length > 0 && !qaData.every(item => item && typeof item.user === 'string' && typeof item.model === 'string')) {
      console.error("Generated Q&A data is not in the expected format (array of {user:string, model:string}):", qaData);
      throw new Error('Gemini returned Q&A data with items not matching the expected {user, model} string structure.');
    }
    return qaData as QAPair[];

  } catch (error: any) {
    console.error('Error generating Q&A pairs:', error);
    // If parseJsonFromGeminiResponse threw, its message will be more specific.
    // Otherwise, it's a general API error.
    if (error.message.startsWith('Failed to parse Q&A JSON')) {
        throw error; // Re-throw specific parsing error
    }
    throw new Error(`Gemini API error during Q&A generation: ${error.message || 'Unknown error'}`);
  }
};