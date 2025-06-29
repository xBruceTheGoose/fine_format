import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

interface RequestBody {
  messages: any[];
  temperature?: number;
  max_tokens?: number;
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
    const { messages, temperature = 0.7, max_tokens = 4000 }: RequestBody = JSON.parse(event.body || '{}');

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

    // Try multiple API keys with fallback
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_API_KEY_2 = process.env.OPENROUTER_API_KEY_2;
    const OPENROUTER_API_KEY_3 = process.env.OPENROUTER_API_KEY_3;
    
    const apiKeys = [OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3].filter(key => key?.trim());
    
    if (apiKeys.length === 0) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No OpenRouter API keys configured' }),
      };
    }

    console.log(`[NETLIFY-OPENROUTER] Available API keys: ${apiKeys.length}`);

    let lastError: any = null;
    
    // Try each API key in sequence
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const keyNumber = i + 1;
      
      try {
        const controller = new AbortController();
        const signal = controller.signal;

        // Set timeout slightly less than typical Netlify function limits (e.g., 25s if limit is 26s)
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 25000); // 25 seconds

        console.log(`[NETLIFY-OPENROUTER] Trying API key ${keyNumber}/${apiKeys.length}`);
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.URL || 'https://fine-format.netlify.app',
            'X-Title': 'Fine Format - AI Dataset Generator',
          },
          body: JSON.stringify({
            model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
            messages,
            temperature,
            max_tokens,
            stream: false,
            top_p: 0.95,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
          }),
          signal, // Pass the abort signal to fetch
        });

        clearTimeout(timeoutId); // Clear the timeout if fetch completes

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[NETLIFY-OPENROUTER] API error with key ${keyNumber}:`, response.status, errorText);
          
          // Check if this is a quota/rate limit error
          const isQuotaError = response.status === 429 || 
                             errorText.includes('quota') || 
                             errorText.includes('rate') || 
                             errorText.includes('limit');

          if (isQuotaError) {
            console.warn(`[NETLIFY-OPENROUTER] Quota/rate limit detected on key ${keyNumber}, trying next key`);
            lastError = new Error(`Key ${keyNumber}: ${response.status} ${response.statusText} - ${errorText}`);
            continue; // Try next key immediately for quota errors
          }
          
          throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        
        if (!data.choices?.[0]?.message?.content) {
          console.error(`[NETLIFY-OPENROUTER] Invalid response structure with key ${keyNumber}:`, data);
          throw new Error('Invalid response from OpenRouter API');
        }

        console.log(`[NETLIFY-OPENROUTER] Success with key ${keyNumber}, response length:`, data.choices[0].message.content.length);
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: data.choices[0].message.content,
            usage: data.usage,
            gapFillingEnabled: true,
            keyUsed: keyNumber
          }),
        };

      } catch (error: any) {
        lastError = error;
        if (error.name === 'AbortError') {
          console.error(`[NETLIFY-OPENROUTER] Key ${keyNumber} fetch aborted due to timeout (25s)`);
          lastError = new Error(`Request to OpenRouter timed out after 25 seconds with key ${keyNumber}`); // Ensure lastError reflects timeout
        }
        console.error(`[NETLIFY-OPENROUTER] Key ${keyNumber} failed:`, error.message);
        
        // Check if this is a quota/rate limit error
        const isQuotaError = error.message?.includes('quota') || 
                           error.message?.includes('rate') || 
                           error.message?.includes('limit') ||
                           error.message?.includes('429');

        if (isQuotaError) {
          console.warn(`[NETLIFY-OPENROUTER] Quota/rate limit detected on key ${keyNumber}, trying next key`);
          continue; // Try next key immediately for quota errors
        }

        // For other errors, still try the next key but log the error type
        console.warn(`[NETLIFY-OPENROUTER] Error with key ${keyNumber}: ${error.message}, trying next key`);
        continue;
      }
    }

    // All keys failed
    console.error(`[NETLIFY-OPENROUTER] All ${apiKeys.length} API keys failed`);
    
    // Enhanced error handling
    let errorMessage = 'Failed to process request with all available API keys';
    let statusCode = 500;
    
    if (lastError?.message?.includes('timeout')) {
      errorMessage = 'Request timed out - content may be too large';
      statusCode = 408;
    } else if (lastError?.message?.includes('quota')) {
      errorMessage = 'All API keys have exceeded quota - please try again later';
      statusCode = 429;
    } else if (lastError?.message?.includes('invalid')) {
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
        details: lastError?.message,
        type: lastError?.name || 'UnknownError',
        keysAttempted: apiKeys.length
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-OPENROUTER] Request processing failed:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to process request',
        details: error.message 
      }),
    };
  }
};