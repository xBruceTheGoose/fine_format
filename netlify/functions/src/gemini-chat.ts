import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

// Ensure proper export for Netlify
export { handler };

interface RequestBody {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  tools?: any;
  config?: any;
}

interface GeminiMessage {
  role: string;
  parts: Array<{ text?: string; inlineData?: any }>;
}

interface GeminiRequest {
  contents: GeminiMessage[];
  generationConfig: {
    maxOutputTokens: number;
    temperature: number;
    topP: number;
    topK: number;
    [key: string]: any;
  };
  tools?: any[];
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[NETLIFY-GEMINI] Function invoked, method:', event.httpMethod);
  console.log('[NETLIFY-GEMINI] Headers:', JSON.stringify(event.headers, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('[NETLIFY-GEMINI] Handling CORS preflight');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    console.log('[NETLIFY-GEMINI] Invalid method:', event.httpMethod);
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Method not allowed',
        type: 'METHOD_NOT_ALLOWED'
      }),
    };
  }
};