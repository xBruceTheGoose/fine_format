import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

// Ensure proper export for Netlify
export { handler };

interface RequestBody {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

interface OpenRouterMessage {
  role: string;
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[NETLIFY-OPENROUTER] Function invoked, method:', event.httpMethod);
  console.log('[NETLIFY-OPENROUTER] Headers:', JSON.stringify(event.headers, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log('[NETLIFY-OPENROUTER] Handling CORS preflight');
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
    console.log('[NETLIFY-OPENROUTER] Invalid method:', event.httpMethod);
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