import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import pdf from 'pdf-parse';

// Ensure proper export for Netlify
export { handler };

interface RequestBody {
  base64Data: string;
  fileName?: string;
}

// 4MB limit for base64 string (equates to ~3MB binary)
const MAX_BASE64_SIZE = 4 * 1024 * 1024;

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[PROCESS-PDF] Function invoked, method:', event.httpMethod);
  
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
};