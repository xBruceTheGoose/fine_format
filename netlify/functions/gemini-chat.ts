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

  console.log('[NETLIFY-GEMINI] Function invoked');

  try {
    // Parse request body
    let requestBody: RequestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('[NETLIFY-GEMINI] Failed to parse request body:', parseError);
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

    const { messages, temperature = 0.7, max_tokens = 4000, tools, config } = requestBody;

    if (!messages || !Array.isArray(messages)) {
      console.error('[NETLIFY-GEMINI] Invalid messages array:', messages);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Messages array is required and must be an array',
          type: 'INVALID_REQUEST'
        }),
      };
    }

    // Check for API keys with better error handling
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2;
    const GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3;
    
    const apiKeys = [GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3].filter(key => key?.trim());
    
    if (apiKeys.length === 0) {
      console.error('[NETLIFY-GEMINI] No API keys configured');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Gemini API service is not configured. Please contact support.',
          type: 'SERVICE_UNAVAILABLE'
        }),
      };
    }

    console.log(`[NETLIFY-GEMINI] Available API keys: ${apiKeys.length}`);

    // Check for binary content and validate size
    const hasBinaryContent = messages.some(msg => 
      msg.parts?.some(part => part.inlineData)
    );

    if (hasBinaryContent) {
      console.log('[NETLIFY-GEMINI] Binary content detected, validating size...');
      
      let totalBinarySize = 0;
      for (const msg of messages) {
        if (msg.parts) {
          for (const part of msg.parts) {
            if (part.inlineData?.data) {
              totalBinarySize += part.inlineData.data.length * 0.75;
            }
          }
        }
      }

      console.log(`[NETLIFY-GEMINI] Total binary content size: ${Math.round(totalBinarySize / 1024)} KB`);

      // Conservative limit to prevent timeouts
      const MAX_BINARY_SIZE = 2 * 1024 * 1024; // 2MB to prevent timeouts
      if (totalBinarySize > MAX_BINARY_SIZE) {
        return {
          statusCode: 413,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Binary content too large: ${Math.round(totalBinarySize / 1024)}KB. Maximum allowed: ${MAX_BINARY_SIZE / 1024}KB`,
            details: 'Large files cause function timeouts. Please use smaller files.',
            type: 'PAYLOAD_TOO_LARGE'
          }),
        };
      }
    }

    let lastError: any = null;
    
    // Try each API key in sequence
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const keyNumber = i + 1;
      
      try {
        console.log(`[NETLIFY-GEMINI] Trying API key ${keyNumber}/${apiKeys.length}`);
        
        // Dynamic import with error handling
        let GoogleGenAI;
        try {
          const genaiModule = await import('@google/genai');
          GoogleGenAI = genaiModule.GoogleGenAI;
        } catch (importError) {
          console.error('[NETLIFY-GEMINI] Failed to import @google/genai:', importError);
          throw new Error('Failed to load Gemini SDK. Service temporarily unavailable.');
        }

        const ai = new GoogleGenAI({ apiKey });
        
        // Convert messages to Gemini format with validation
        const contents = messages.map((msg: any, index: number) => {
          try {
            if (msg.parts) {
              // Message already has parts (for binary content)
              return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: msg.parts
              };
            } else if (msg.content) {
              // Regular text message
              return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
              };
            } else {
              throw new Error(`Message ${index} missing content or parts`);
            }
          } catch (msgError) {
            console.error(`[NETLIFY-GEMINI] Error processing message ${index}:`, msgError);
            throw new Error(`Invalid message format at index ${index}`);
          }
        });

        // Build request configuration with validation
        const requestConfig: any = {
          model: 'gemini-2.0-flash-exp',
          contents,
          config: {
            maxOutputTokens: Math.min(max_tokens || 4000, 8000),
            temperature: Math.max(0, Math.min(1, temperature || 0.7)),
            topP: 0.95,
            topK: 40,
            ...config
          }
        };

        // Add tools if provided (for web search)
        if (tools) {
          requestConfig.config.tools = tools;
        }

        console.log(`[NETLIFY-GEMINI] Making request with key ${keyNumber}:`, {
          model: requestConfig.model,
          maxOutputTokens: requestConfig.config.maxOutputTokens,
          temperature: requestConfig.config.temperature,
          hasTools: !!tools,
          messageCount: contents.length,
          hasBinaryContent
        });

        // Set realistic timeout for Netlify functions
        const timeoutMs = hasBinaryContent ? 20000 : 25000; // 20s for binary, 25s for text
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log(`[NETLIFY-GEMINI] Request timeout after ${timeoutMs}ms with key ${keyNumber}`);
          controller.abort();
        }, timeoutMs);

        try {
          // Make the API request with timeout
          const requestPromise = ai.models.generateContent(requestConfig);
          const response = await Promise.race([
            requestPromise,
            new Promise((_, reject) => {
              controller.signal.addEventListener('abort', () => {
                reject(new Error('Request timeout - Netlify function limit exceeded'));
              });
            })
          ]);
          
          clearTimeout(timeoutId);
          
          if (!response || typeof response.text !== 'function') {
            console.error(`[NETLIFY-GEMINI] Invalid response structure from key ${keyNumber}:`, response);
            throw new Error('Invalid response from Gemini API');
          }

          const responseText = response.text();
          
          if (!responseText || responseText.trim().length === 0) {
            console.error(`[NETLIFY-GEMINI] Empty response from key ${keyNumber}`);
            throw new Error('Empty response from Gemini API');
          }

          console.log(`[NETLIFY-GEMINI] Success with key ${keyNumber}, response length:`, responseText.length);

          // Check if response was truncated
          const finishReason = response.candidates?.[0]?.finishReason;
          const wasTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
          
          if (wasTruncated) {
            console.warn(`[NETLIFY-GEMINI] Response was truncated (${finishReason}) with key ${keyNumber}`);
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
              finishReason: finishReason,
              truncated: wasTruncated,
              keyUsed: keyNumber
            }),
          };

        } catch (requestError: any) {
          clearTimeout(timeoutId);
          throw requestError;
        }

      } catch (error: any) {
        lastError = error;
        console.error(`[NETLIFY-GEMINI] Key ${keyNumber} failed:`, {
          message: error.message,
          name: error.name,
          status: error.status,
          code: error.code
        });
        
        // Check if this is a quota/rate limit error
        const isQuotaError = error.message?.includes('quota') || 
                           error.message?.includes('rate') || 
                           error.message?.includes('limit') ||
                           error.message?.includes('429') ||
                           error.status === 429;

        // Check if this is a timeout error
        const isTimeoutError = error.message?.includes('timeout') ||
                              error.message?.includes('TIMEOUT') ||
                              error.code === 'ETIMEDOUT' ||
                              error.name === 'AbortError';

        if (isQuotaError) {
          console.warn(`[NETLIFY-GEMINI] Quota/rate limit detected on key ${keyNumber}, trying next key`);
          continue;
        }

        if (isTimeoutError) {
          console.warn(`[NETLIFY-GEMINI] Timeout detected on key ${keyNumber}, trying next key`);
          continue;
        }

        // For other errors, still try the next key
        console.warn(`[NETLIFY-GEMINI] Error with key ${keyNumber}: ${error.message}, trying next key`);
        continue;
      }
    }

    // All keys failed
    console.error(`[NETLIFY-GEMINI] All ${apiKeys.length} API keys failed`);
    console.error(`[NETLIFY-GEMINI] Final error:`, {
      message: lastError?.message,
      name: lastError?.name,
      status: lastError?.status,
      code: lastError?.code,
      stack: lastError?.stack?.substring(0, 500)
    });
    
    // Enhanced error handling with specific error types
    let errorMessage = 'Failed to process request with all available API keys';
    let statusCode = 500;
    let errorType = 'UNKNOWN_ERROR';
    
    if (lastError?.message?.includes('timeout') || lastError?.name === 'AbortError') {
      errorMessage = 'Request timed out - content may be too large or complex for processing';
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
    } else if (lastError?.message?.includes('SAFETY')) {
      errorMessage = 'Content was blocked by safety filters';
      statusCode = 400;
      errorType = 'SAFETY_FILTER';
    } else if (lastError?.status === 502 || lastError?.status === 503) {
      errorMessage = 'Gemini API service temporarily unavailable';
      statusCode = 503;
      errorType = 'SERVICE_UNAVAILABLE';
    } else if (lastError?.message?.includes('SDK') || lastError?.message?.includes('import')) {
      errorMessage = 'Service initialization failed - please try again';
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
        keysAttempted: apiKeys.length,
        suggestion: hasBinaryContent ? 'Try using a smaller file or convert to text format' : 'Please try again or contact support'
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-GEMINI] Function execution failed:', error);
    
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
        stack: error.stack?.substring(0, 200)
      }),
    };
  }
};