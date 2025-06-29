import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import mammoth from 'mammoth';

interface RequestBody {
  base64Data: string;
  fileName?: string;
}

// 4MB limit for base64 string (equates to ~3MB binary)
const MAX_BASE64_SIZE = 4 * 1024 * 1024;

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : null;
    const { base64Data, fileName = 'document.docx' }: RequestBody = body || {};

    if (!base64Data) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing base64Data field' }),
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      };
    }

    if (base64Data.length > MAX_BASE64_SIZE) {
      return {
        statusCode: 413,
        body: JSON.stringify({ 
          error: `Base64 data size (${(base64Data.length / 1024).toFixed(1)}KB) exceeds server limit of ${(MAX_BASE64_SIZE / 1024).toFixed(1)}KB.`,
          type: 'PAYLOAD_TOO_LARGE'
        }),
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      };
    }

    const docxBuffer = Buffer.from(base64Data, 'base64');
    console.log(`[PROCESS-DOCX] Processing ${fileName}, buffer size: ${docxBuffer.length} bytes`);

    // Set timeout for mammoth processing with proper error handling
    const processingPromise = mammoth.extractRawText({ buffer: docxBuffer });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DOCX processing timed out after 25 seconds')), 25000)
    );

    const result = await Promise.race([processingPromise, timeoutPromise]) as mammoth.Result<string>;

    if (!result || typeof result.value !== 'string') {
      console.error(`[PROCESS-DOCX] Failed to extract text from ${fileName}. No text data returned.`);
      throw new Error('Failed to extract text content from DOCX. The document might be corrupted or empty.');
    }

    // Validate extracted text quality
    const cleanText = result.value.trim();
    if (cleanText.length < 50) {
      throw new Error('DOCX contains insufficient text content. Document may be corrupted or empty.');
    }

    // Log mammoth messages if any
    if (result.messages && result.messages.length > 0) {
      console.warn(`[PROCESS-DOCX] Mammoth messages for ${fileName}:`, result.messages);
    }

    console.log(`[PROCESS-DOCX] Successfully extracted ${cleanText.length} characters from ${fileName}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        extractedText: cleanText,
        messages: result.messages,
        fileName,
        success: true
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };

  } catch (error: any) {
    console.error(`[PROCESS-DOCX] Error processing DOCX:`, error);
    let errorMessage = 'Failed to process DOCX.';
    let statusCode = 500;

    if (error.message?.includes('timeout')) {
      errorMessage = 'DOCX processing timed out. The document may be too complex or large.';
      statusCode = 408;
    } else if (error.message?.includes('corrupted') || error.message?.includes('invalid')) {
      errorMessage = 'Invalid or corrupted DOCX file.';
      statusCode = 400;
    } else if (error.message?.includes('insufficient text')) {
      errorMessage = 'Could not extract sufficient text. The document may be corrupted or empty.';
      statusCode = 422;
    }

    return {
      statusCode: statusCode,
      body: JSON.stringify({
        error: errorMessage,
        details: error.message || 'No further details.',
        fileName: event.body ? (JSON.parse(event.body).fileName || 'unknown') : 'unknown',
        success: false
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };
  }
};