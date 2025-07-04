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

  console.log('[NETLIFY-OPENROUTER] Function invoked');

  try {
    // Parse request body with comprehensive error handling
    let requestBody: RequestBody;
    try {
      if (!event.body) {
        throw new Error('Request body is empty');
      }
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      console.error('[NETLIFY-OPENROUTER] Failed to parse request body:', parseError);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          type: 'INVALID_REQUEST'
        }),
      };
    }

    const { messages, temperature = 0.7, max_tokens = 4000 } = requestBody;

    // Comprehensive message validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('[NETLIFY-OPENROUTER] Invalid messages array:', messages);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Messages array is required and must be a non-empty array',
          type: 'INVALID_REQUEST'
        }),
      };
    }

    // Validate each message structure
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg || typeof msg !== 'object') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Message ${i} is not a valid object`,
            type: 'INVALID_REQUEST'
          }),
        };
      }
      
      if (!msg.role || !msg.content) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Message ${i} missing required 'role' or 'content' field`,
            type: 'INVALID_REQUEST'
          }),
        };
      }
    }

    // Try multiple API keys with fallback
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const OPENROUTER_API_KEY_2 = process.env.OPENROUTER_API_KEY_2;
    const OPENROUTER_API_KEY_3 = process.env.OPENROUTER_API_KEY_3;
    
    const apiKeys = [OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3].filter(key => key?.trim());
    
    if (apiKeys.length === 0) {
      console.error('[NETLIFY-OPENROUTER] No API keys configured');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'OpenRouter API service is not configured. Please contact support.',
          type: 'SERVICE_UNAVAILABLE'
        }),
      };
    }

    console.log(`[NETLIFY-OPENROUTER] Available API keys: ${apiKeys.length}`);

    let lastError: any = null;
    
    // Try each API key in sequence with comprehensive error handling
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const keyNumber = i + 1;
      
      try {
        console.log(`[NETLIFY-OPENROUTER] Trying API key ${keyNumber}/${apiKeys.length}`);
        
        // Set up abort controller for timeout handling
        const controller = new AbortController();
        const signal = controller.signal;

        // Set timeout slightly less than Netlify function limits
        const timeoutId = setTimeout(() => {
          console.log(`[NETLIFY-OPENROUTER] Request timeout after 25 seconds`);
          controller.abort();
        }, 25000); // 25 seconds

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
            temperature: Math.max(0, Math.min(1, temperature)),
            max_tokens: Math.min(Math.max(1, max_tokens), 8000),
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

        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error(`[NETLIFY-OPENROUTER] Failed to parse response JSON with key ${keyNumber}:`, parseError);
          throw new Error('Failed to parse response from OpenRouter API');
        }
        
        if (!data.choices?.[0]?.message?.content) {
          console.error(`[NETLIFY-OPENROUTER] Invalid response structure with key ${keyNumber}:`, data);
          throw new Error('Invalid response from OpenRouter API - missing content');
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
        
        // Handle timeout errors specifically
        if (error.name === 'AbortError') {
          console.error(`[NETLIFY-OPENROUTER] Key ${keyNumber} fetch aborted due to timeout (25s)`);
          lastError = new Error(`Request to OpenRouter timed out after 25 seconds with key ${keyNumber}`);
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

    // All keys failed - comprehensive error handling
    console.error(`[NETLIFY-OPENROUTER] All ${apiKeys.length} API keys failed`);
    console.error(`[NETLIFY-OPENROUTER] Final error details:`, {
      message: lastError?.message,
      name: lastError?.name,
      status: lastError?.status,
      code: lastError?.code
    });
    
    // Enhanced error handling with specific error types
    let errorMessage = 'Failed to process request with all available API keys';
    let statusCode = 500;
    let errorType = 'UNKNOWN_ERROR';
    
    if (lastError?.message?.includes('timeout') || lastError?.name === 'AbortError') {
      errorMessage = 'Request timed out - content may be too large or complex';
      statusCode = 408;
      errorType = 'TIMEOUT_ERROR';
    } else if (lastError?.message?.includes('quota') || lastError?.status === 429) {
      errorMessage = 'All API keys have exceeded quota - please try again later';
      statusCode = 429;
      errorType = 'QUOTA_EXCEEDED';
    } else if (lastError?.message?.includes('invalid') || lastError?.status === 400) {
      errorMessage = 'Invalid request format or content';
      statusCode = 400;
      errorType = 'INVALID_REQUEST';
    } else if (lastError?.status === 502 || lastError?.status === 503) {
      errorMessage = 'OpenRouter API service temporarily unavailable';
      statusCode = 503;
      errorType = 'SERVICE_UNAVAILABLE';
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
        type: errorType,
        keysAttempted: apiKeys.length
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-OPENROUTER] Function execution failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Internal server error - function execution failed',
        details: error.message,
        type: 'FUNCTION_ERROR'
      }),
    };
  }
};