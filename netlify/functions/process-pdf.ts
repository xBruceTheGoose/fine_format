import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import pdf from 'pdf-parse';

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
    const { base64Data, fileName = 'document.pdf' }: RequestBody = body || {};

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

    const pdfBuffer = Buffer.from(base64Data, 'base64');
    console.log(`[PROCESS-PDF] Processing ${fileName}, buffer size: ${pdfBuffer.length} bytes`);

    // Set timeout for pdf-parse with proper error handling
    const parsingPromise = pdf(pdfBuffer, {
      max: 0, // Parse all pages
      version: 'v1.10.100' // Specify version for consistency
    });
    
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF parsing timed out after 25 seconds')), 25000)
    );

    const data = await Promise.race([parsingPromise, timeoutPromise]) as Awaited<ReturnType<typeof pdf>>;

    if (!data || typeof data.text !== 'string') {
      console.error(`[PROCESS-PDF] Failed to extract text from ${fileName}. No text data returned.`);
      throw new Error('Failed to extract text content from PDF. The document might be image-based or corrupted.');
    }

    // Validate extracted text quality
    const cleanText = data.text.trim();
    if (cleanText.length < 50) {
      throw new Error('PDF contains insufficient text content. Document may be image-based or corrupted.');
    }

    console.log(`[PROCESS-PDF] Successfully extracted ${cleanText.length} characters from ${fileName}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        extractedText: cleanText,
        numPages: data.numpages,
        info: data.info,
        fileName,
        success: true
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };

  } catch (error: any) {
    console.error(`[PROCESS-PDF] Error processing PDF:`, error);
    let errorMessage = 'Failed to process PDF.';
    let statusCode = 500;

    if (error.message?.includes('timeout')) {
      errorMessage = 'PDF processing timed out. The document may be too complex or large.';
      statusCode = 408;
    } else if (error.message?.includes('Invalid PDF structure') || error.message?.includes('corrupted')) {
      errorMessage = 'Invalid or corrupted PDF file.';
      statusCode = 400;
    } else if (error.message?.includes('image-based') || error.message?.includes('insufficient text')) {
      errorMessage = 'Could not extract sufficient text. The PDF might be image-based or scanned without OCR.';
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