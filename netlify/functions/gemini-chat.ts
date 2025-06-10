import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

interface RequestBody {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
  tools?: any;
  config?: any;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
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
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { messages, temperature = 0.7, max_tokens = 4000, tools, config }: RequestBody = JSON.parse(event.body || '{}');

    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Messages array is required' }),
      };
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Gemini API key not configured' }),
      };
    }

    // Simple rate limiting (in production, use Redis or similar)
    const clientIP = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    
    // Import GoogleGenAI dynamically
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Convert messages to Gemini format
    const contents = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: Array.isArray(msg.parts) ? msg.parts : [{ text: msg.content }]
    }));

    const requestConfig: any = {
      model: 'gemini-2.0-flash-exp',
      contents,
      config: {
        maxOutputTokens: Math.min(max_tokens || 4000, 20000), // Increased max limit
        temperature: temperature || 0.7,
        topP: 0.95,
        topK: 40,
        ...config
      }
    };

    // Add tools if provided (for web search)
    if (tools) {
      requestConfig.config.tools = tools;
    }

    console.log('[NETLIFY-GEMINI] Making request with config:', {
      model: requestConfig.model,
      maxOutputTokens: requestConfig.config.maxOutputTokens,
      temperature: requestConfig.config.temperature,
      hasTools: !!tools,
      messageCount: contents.length
    });

    const response = await ai.models.generateContent(requestConfig);
    
    if (!response.text) {
      console.error('[NETLIFY-GEMINI] No response text from Gemini API');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No response from Gemini API' }),
      };
    }

    const responseText = response.text();
    console.log('[NETLIFY-GEMINI] Response received, length:', responseText.length);

    // Check if response was truncated
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      console.warn('[NETLIFY-GEMINI] Response was truncated due to token limit');
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: responseText,
        candidates: response.candidates,
        usage: response.usageMetadata,
        finishReason: response.candidates?.[0]?.finishReason,
        truncated: response.candidates?.[0]?.finishReason === 'MAX_TOKENS'
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-GEMINI] Request failed:', error);
    
    // Enhanced error handling
    let errorMessage = 'Failed to process request';
    let statusCode = 500;
    
    if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out - content may be too large';
      statusCode = 408;
    } else if (error.message?.includes('quota')) {
      errorMessage = 'API quota exceeded - please try again later';
      statusCode = 429;
    } else if (error.message?.includes('invalid')) {
      errorMessage = 'Invalid request format';
      statusCode = 400;
    }
    
    return {
      statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: errorMessage,
        details: error.message,
        type: error.name || 'UnknownError'
      }),
    };
  }
};