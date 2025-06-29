import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import pdf from 'pdf-parse/lib/pdf-parse.js'; // Reverted to specific path to test regression

interface RequestBody {
  base64Data: string;
  fileName?: string;
}

// Approx 4MB limit for base64 string (equates to ~3MB binary)
// Client-side limit is much smaller (200KB for binary -> ~266KB base64), this is a server safety net.
const MAX_BASE64_SIZE = 4 * 1024 * 1024;

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Adjust for production
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
          statusCode: 413, // Payload Too Large
          body: JSON.stringify({ error: `Base64 data size (${(base64Data.length / 1024).toFixed(1)}KB) exceeds server limit of ${(MAX_BASE64_SIZE / 1024).toFixed(1)}KB.` }),
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        };
    }

    const pdfBuffer = Buffer.from(base64Data, 'base64');

    console.log(`[PROCESS-PDF] Processing ${fileName}, buffer size: ${pdfBuffer.length} bytes`);

    // Set a timeout for pdf-parse, as it can hang on complex/corrupted files
    const parsingPromise = pdf(pdfBuffer);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('PDF parsing timed out after 25 seconds')), 25000)
    );

    const data = await Promise.race([parsingPromise, timeoutPromise]) as Awaited<ReturnType<typeof pdf>>;

    if (!data || typeof data.text !== 'string') {
      console.error(`[PROCESS-PDF] Failed to extract text from ${fileName}. No text data returned.`);
      throw new Error('Failed to extract text content from PDF. The document might be image-based or corrupted.');
    }

    console.log(`[PROCESS-PDF] Successfully extracted ${data.text.length} characters from ${fileName}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        extractedText: data.text,
        numPages: data.numpages,
        info: data.info, // Contains metadata like Author, Title, etc.
        fileName,
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };

  } catch (error: any) {
    console.error(`[PROCESS-PDF] Error processing PDF:`, error);
    let errorMessage = 'Failed to process PDF.';
    let statusCode = 500;

    if (error.message?.includes('timeout')) {
        errorMessage = 'PDF processing timed out. The document may be too complex or large.';
        statusCode = 408; // Request Timeout
    } else if (error.message?.includes('Invalid PDF structure') || error.message?.includes('corrupted')) {
        errorMessage = 'Invalid or corrupted PDF file.';
        statusCode = 400; // Bad Request
    } else if (error.message?.includes('image-based')) {
        errorMessage = 'Could not extract text. The PDF might be image-based or scanned without OCR.';
        statusCode = 422; // Unprocessable Entity
    }

    return {
      statusCode: statusCode,
      body: JSON.stringify({
        error: errorMessage,
        details: error.message || 'No further details.',
        fileName: event.body ? (JSON.parse(event.body).fileName || 'unknown') : 'unknown'
      }),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    };
  }
};
