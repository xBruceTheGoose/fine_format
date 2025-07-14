import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

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
      body: JSON.stringify({ 
        error: 'Method not allowed',
        type: 'METHOD_NOT_ALLOWED'
      }),
    };
  }

  console.log('[NETLIFY-OPENROUTER] Function invoked');

  try {
    // Parse and validate request body
    let requestBody: RequestBody;
    try {
      if (!event.body) {
        throw new Error('Request body is empty');
      }
      requestBody = JSON.parse(event.body);
    } catch (parseError: any) {
      console.error('[NETLIFY-OPENROUTER] Failed to parse request body:', parseError);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Invalid JSON in request body',
          type: 'INVALID_REQUEST',
          details: parseError.message
        }),
      };
    }

    const { 
      messages, 
      temperature = 0.7, 
      max_tokens = 4000,
      model = 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free'
    } = requestBody;

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

      if (typeof msg.content !== 'string') {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Message ${i} content must be a string`,
            type: 'INVALID_REQUEST'
          }),
        };
      }
    }

    // Enhanced API key management
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();
    const OPENROUTER_API_KEY_2 = process.env.OPENROUTER_API_KEY_2?.trim();
    const OPENROUTER_API_KEY_3 = process.env.OPENROUTER_API_KEY_3?.trim();
    
    // Filter valid API keys
    const apiKeys = [OPENROUTER_API_KEY, OPENROUTER_API_KEY_2, OPENROUTER_API_KEY_3]
      .filter(key => key && key.length > 20 && key.startsWith('sk-or-v1-'));
    
    if (apiKeys.length === 0) {
      console.error('[NETLIFY-OPENROUTER] No valid API keys configured');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'OpenRouter API service is not configured properly. Please contact support.',
          type: 'SERVICE_UNAVAILABLE',
          details: 'No valid API keys found'
        }),
      };
    }

    console.log(`[NETLIFY-OPENROUTER] Found ${apiKeys.length} valid API keys`);

    // Validate and sanitize parameters
    const validatedMaxTokens = validateInteger(max_tokens, 1, 8000, 4000);
    const validatedTemperature = validateNumber(temperature, 0, 1, 0.7);

    console.log('[NETLIFY-OPENROUTER] Validated parameters:', {
      originalMaxTokens: max_tokens,
      validatedMaxTokens,
      originalTemperature: temperature,
      validatedTemperature,
      model
    });

    let lastError: any = null;
    let retryCount = 0;
    const maxRetries = apiKeys.length * 2;
    
    // Enhanced retry logic with exponential backoff
    while (retryCount < maxRetries) {
      const keyIndex = retryCount % apiKeys.length;
      const apiKey = apiKeys[keyIndex];
      const keyNumber = keyIndex + 1;
      const attemptNumber = Math.floor(retryCount / apiKeys.length) + 1;
      
      try {
        console.log(`[NETLIFY-OPENROUTER] Attempt ${retryCount + 1}/${maxRetries}: API key ${keyNumber}/${apiKeys.length}, retry ${attemptNumber}`);
        
        // Set up abort controller for timeout handling
        const controller = new AbortController();
        const signal = controller.signal;

        // Enhanced timeout with retry consideration
        const baseTimeout = 25000;
        const timeoutMs = Math.min(baseTimeout + (attemptNumber * 2000), 28000);
        
        const timeoutId = setTimeout(() => {
          console.log(`[NETLIFY-OPENROUTER] Request timeout after ${timeoutMs}ms`);
          controller.abort();
        }, timeoutMs);

        // Build request payload
        const requestPayload: OpenRouterRequest = {
          model,
          messages: messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: validatedTemperature,
          max_tokens: validatedMaxTokens,
          stream: false,
          top_p: 0.95,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        };

        console.log('[NETLIFY-OPENROUTER] Request payload prepared:', {
          model: requestPayload.model,
          messageCount: requestPayload.messages.length,
          maxTokens: requestPayload.max_tokens,
          temperature: requestPayload.temperature
        });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.URL || 'https://fine-format.netlify.app',
            'X-Title': 'Fine Format - AI Dataset Generator',
          },
          body: JSON.stringify(requestPayload),
          signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorText;
          try {
            errorText = await response.text();
          } catch (textError) {
            errorText = 'Failed to read error response';
          }
          
          console.error(`[NETLIFY-OPENROUTER] API error with key ${keyNumber}:`, response.status, errorText);
          
          // Enhanced error categorization
          const isQuotaError = response.status === 429 || 
                             errorText.includes('quota') || 
                             errorText.includes('rate') || 
                             errorText.includes('limit');

          const isAuthError = response.status === 401 || response.status === 403 ||
                             errorText.includes('authentication') ||
                             errorText.includes('API key');

          const isServiceError = response.status === 502 || response.status === 503 ||
                                errorText.includes('unavailable') ||
                                errorText.includes('maintenance');

          if (isQuotaError) {
            console.warn(`[NETLIFY-OPENROUTER] Quota/rate limit detected on key ${keyNumber}, trying next key`);
            lastError = new Error(`Key ${keyNumber}: ${response.status} ${response.statusText} - ${errorText}`);
            retryCount++;
            continue;
          }

          if (isAuthError) {
            console.warn(`[NETLIFY-OPENROUTER] Auth error detected on key ${keyNumber}, trying next key`);
            lastError = new Error(`Key ${keyNumber}: ${response.status} ${response.statusText} - ${errorText}`);
            retryCount++;
            continue;
          }

          if (isServiceError) {
            console.warn(`[NETLIFY-OPENROUTER] Service error detected on key ${keyNumber}, retrying with backoff`);
            if (attemptNumber < 3) {
              const backoffMs = Math.min(Math.pow(2, attemptNumber) * 1000, 5000);
              console.log(`[NETLIFY-OPENROUTER] Waiting ${backoffMs}ms before retry`);
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
            lastError = new Error(`Key ${keyNumber}: ${response.status} ${response.statusText} - ${errorText}`);
            retryCount++;
            continue;
          }
          
          throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        let data;
        try {
          data = await response.json();
        } catch (parseError: any) {
          console.error(`[NETLIFY-OPENROUTER] Failed to parse response JSON with key ${keyNumber}:`, parseError);
          throw new Error('Failed to parse response from OpenRouter API');
        }
        
        // Comprehensive response validation
        if (!data.choices?.[0]?.message?.content) {
          console.error(`[NETLIFY-OPENROUTER] Invalid response structure with key ${keyNumber}:`, data);
          throw new Error('Invalid response from OpenRouter API - missing content');
        }

        const responseContent = data.choices[0].message.content;
        
        if (!responseContent || responseContent.trim().length === 0) {
          console.error(`[NETLIFY-OPENROUTER] Empty response content with key ${keyNumber}`);
          throw new Error('Empty response content from OpenRouter API');
        }

        console.log(`[NETLIFY-OPENROUTER] Success with key ${keyNumber}, response length:`, responseContent.length);
        
        // Check if response was truncated
        const finishReason = data.choices[0].finish_reason;
        const wasTruncated = finishReason === 'length';
        
        if (wasTruncated) {
          console.warn(`[NETLIFY-OPENROUTER] Response was truncated (${finishReason})`);
        }
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: responseContent,
            usage: data.usage,
            finishReason: finishReason,
            truncated: wasTruncated,
            keyUsed: keyNumber,
            attemptNumber: attemptNumber,
            modelUsed: model
          }),
        };

      } catch (error: any) {
        lastError = error;
        
        // Handle timeout errors specifically
        if (error.name === 'AbortError') {
          console.error(`[NETLIFY-OPENROUTER] Key ${keyNumber} fetch aborted due to timeout`);
          lastError = new Error(`Request to OpenRouter timed out with key ${keyNumber}`);
        }
        
        console.error(`[NETLIFY-OPENROUTER] Key ${keyNumber} failed:`, error.message);
        
        // Enhanced error categorization for retry logic
        const isQuotaError = error.message?.includes('quota') || 
                           error.message?.includes('rate') || 
                           error.message?.includes('limit') ||
                           error.message?.includes('429');

        const isTimeoutError = error.message?.includes('timeout') ||
                              error.name === 'AbortError';

        const isServiceError = error.message?.includes('unavailable') ||
                              error.message?.includes('503') ||
                              error.message?.includes('502');

        if (isQuotaError || isTimeoutError || isServiceError) {
          console.warn(`[NETLIFY-OPENROUTER] Retryable error with key ${keyNumber}, trying next`);
          retryCount++;
          continue;
        }

        // For other errors, still try the next key
        console.warn(`[NETLIFY-OPENROUTER] Error with key ${keyNumber}: ${error.message}, trying next key`);
        retryCount++;
        continue;
      }
    }

    // All keys failed
    console.error(`[NETLIFY-OPENROUTER] All ${maxRetries} attempts failed across ${apiKeys.length} API keys`);
    console.error(`[NETLIFY-OPENROUTER] Final error details:`, {
      message: lastError?.message,
      name: lastError?.name,
      status: lastError?.status,
      code: lastError?.code
    });
    
    // Enhanced error handling with specific error types
    let errorMessage = 'Failed to process request with all available API keys';
    let statusCode = 500;
    let errorType = 'ALL_KEYS_FAILED';
    
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
    } else if (lastError?.status === 401 || lastError?.status === 403) {
      errorMessage = 'API authentication failed with all keys';
      statusCode = 401;
      errorType = 'AUTH_ERROR';
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
        keysAttempted: apiKeys.length,
        attemptsTotal: maxRetries,
        suggestion: getSuggestionForError(errorType),
        debugInfo: {
          lastErrorName: lastError?.name,
          lastErrorStatus: lastError?.status,
          lastErrorCode: lastError?.code
        }
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
        type: 'FUNCTION_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack?.substring(0, 500) : undefined
      }),
    };
  }
};

// Helper functions for parameter validation
function validateNumber(value: any, min: number, max: number, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return Math.max(min, Math.min(max, value));
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return Math.max(min, Math.min(max, parsed));
    }
  }
  return defaultValue;
}

function validateInteger(value: any, min: number, max: number, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return Math.min(Math.max(min, Math.floor(value)), max);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return Math.min(Math.max(min, parsed), max);
    }
  }
  return defaultValue;
}

function getSuggestionForError(errorType: string): string {
  switch (errorType) {
    case 'AUTH_ERROR':
      return 'Please check that your OpenRouter API keys are correctly configured and valid';
    case 'SERVICE_UNAVAILABLE':
      return 'The OpenRouter service is temporarily unavailable. Please try again in 2-5 minutes';
    case 'TIMEOUT_ERROR':
      return 'Try with smaller content or fewer sources';
    case 'QUOTA_EXCEEDED':
      return 'API quota exceeded. Please wait or check your API usage limits';
    case 'INVALID_REQUEST':
      return 'Check your request format and content';
    case 'ALL_KEYS_FAILED':
      return 'All API keys failed. Check your API key configuration and try again';
    default:
      return 'Please try again or contact support if the issue persists';
  }
}