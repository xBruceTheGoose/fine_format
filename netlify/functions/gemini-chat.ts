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
    // Parse request body with comprehensive error handling
    let requestBody: RequestBody;
    try {
      if (!event.body) {
        throw new Error('Request body is empty');
      }
      requestBody = JSON.parse(event.body);
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

    // Comprehensive message validation
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error('[NETLIFY-GEMINI] Invalid messages array:', messages);
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
      
      if (!msg.role) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Message ${i} missing required 'role' field`,
            type: 'INVALID_REQUEST'
          }),
        };
      }
      
      if (!msg.content && !msg.parts) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Message ${i} missing required 'content' or 'parts' field`,
            type: 'INVALID_REQUEST'
          }),
        };
      }
    }

    // Enhanced API key management with better error handling
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
    const GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2?.trim();
    const GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3?.trim();
    
    const apiKeys = [GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3].filter(key => key && key.length > 10);
    
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

    // Enhanced parameter validation with better error handling
    const validatedMaxTokens = validateInteger(max_tokens, 1, 8000, 4000);
    const validatedTemperature = validateNumber(temperature, 0, 1, 0.7);

    console.log('[NETLIFY-GEMINI] Validated parameters:', {
      originalMaxTokens: max_tokens,
      validatedMaxTokens,
      originalTemperature: temperature,
      validatedTemperature
    });

    // Check for binary content - this should be rare since we extract text first
    const hasBinaryContent = messages.some(msg => 
      msg.parts?.some(part => part.inlineData)
    );

    if (hasBinaryContent) {
      console.log('[NETLIFY-GEMINI] Binary content detected - this should be rare after text extraction');
      
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

      // Conservative limit for any remaining binary content
      const MAX_BINARY_SIZE = 300 * 1024; // 300KB
      if (totalBinarySize > MAX_BINARY_SIZE) {
        return {
          statusCode: 413,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Binary content too large: ${Math.round(totalBinarySize / 1024)}KB. Maximum allowed: ${MAX_BINARY_SIZE / 1024}KB`,
            details: 'Binary content should have been extracted to text. Please contact support.',
            type: 'PAYLOAD_TOO_LARGE'
          }),
        };
      }
    }

    let lastError: any = null;
    let retryCount = 0;
    const maxRetries = apiKeys.length * 2; // Allow retries across all keys
    
    // Enhanced retry logic with exponential backoff
    while (retryCount < maxRetries) {
      const keyIndex = retryCount % apiKeys.length;
      const apiKey = apiKeys[keyIndex];
      const keyNumber = keyIndex + 1;
      const attemptNumber = Math.floor(retryCount / apiKeys.length) + 1;
      
      try {
        console.log(`[NETLIFY-GEMINI] Attempt ${retryCount + 1}/${maxRetries}: API key ${keyNumber}/${apiKeys.length}, retry ${attemptNumber}`);
        
        // Dynamic import with better error handling
        let GoogleGenAI;
        try {
          const genaiModule = await import('@google/genai');
          GoogleGenAI = genaiModule.GoogleGenAI;
          console.log('[NETLIFY-GEMINI] Successfully imported @google/genai');
        } catch (importError) {
          console.error('[NETLIFY-GEMINI] Failed to import @google/genai:', importError);
          throw new Error('Failed to load Gemini SDK. Service temporarily unavailable.');
        }

        const ai = new GoogleGenAI({ apiKey });
        console.log('[NETLIFY-GEMINI] GoogleGenAI client initialized');
        
        // Convert messages to Gemini format with comprehensive validation
        const contents = messages.map((msg: any, index: number) => {
          try {
            if (msg.parts) {
              // Validate parts structure
              if (!Array.isArray(msg.parts)) {
                throw new Error(`Message ${index} parts must be an array`);
              }
              
              return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: msg.parts
              };
            } else if (msg.content) {
              // Validate content
              if (typeof msg.content !== 'string') {
                throw new Error(`Message ${index} content must be a string`);
              }
              
              return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
              };
            } else {
              throw new Error(`Message ${index} missing content or parts`);
            }
          } catch (msgError) {
            console.error(`[NETLIFY-GEMINI] Error processing message ${index}:`, msgError);
            throw new Error(`Invalid message format at index ${index}: ${msgError.message}`);
          }
        });

        console.log(`[NETLIFY-GEMINI] Converted ${contents.length} messages to Gemini format`);

        // Build request configuration with validated parameters
        const requestConfig: any = {
          contents,
          generationConfig: {
            maxOutputTokens: validatedMaxTokens,
            temperature: validatedTemperature,
            topP: 0.95,
            topK: 40,
            ...config
          }
        };

        // Add tools if provided (for web search)
        if (tools) {
          requestConfig.tools = tools;
        }

        console.log('[NETLIFY-GEMINI] Request config prepared:', {
          maxOutputTokens: requestConfig.generationConfig.maxOutputTokens,
          temperature: requestConfig.generationConfig.temperature,
          hasTools: !!tools,
          messageCount: contents.length,
          hasBinaryContent
        });

        // Enhanced timeout with retry consideration
        const baseTimeout = hasBinaryContent ? 15000 : 20000;
        const timeoutMs = baseTimeout + (attemptNumber * 2000); // Increase timeout on retries
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log(`[NETLIFY-GEMINI] Request timeout after ${timeoutMs}ms`);
          controller.abort();
        }, timeoutMs);

        try {
          console.log('[NETLIFY-GEMINI] Making request to Gemini API...');
          
          // Use the correct model and method with proper error handling
          const model = ai.getGenerativeModel({ 
            model: 'gemini-1.5-flash', // Use more stable model
            generationConfig: requestConfig.generationConfig,
            tools: requestConfig.tools
          });
          
          // Make the API request with timeout and comprehensive error handling
          const requestPromise = model.generateContent(requestConfig.contents);
          const timeoutPromise = new Promise((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('Request timeout - Netlify function limit exceeded'));
            });
          });
          
          const response = await Promise.race([requestPromise, timeoutPromise]);
          
          clearTimeout(timeoutId);
          console.log('[NETLIFY-GEMINI] Received response from Gemini API');
          
          // Comprehensive response validation
          if (!response) {
            throw new Error('No response received from Gemini API');
          }
          
          if (!response.response) {
            console.error('[NETLIFY-GEMINI] Invalid response structure:', response);
            throw new Error('Invalid response structure from Gemini API');
          }

          let responseText;
          try {
            responseText = response.response.text();
          } catch (textError) {
            console.error('[NETLIFY-GEMINI] Failed to extract text from response:', textError);
            throw new Error('Failed to extract text from Gemini API response');
          }
          
          if (!responseText || responseText.trim().length === 0) {
            console.error('[NETLIFY-GEMINI] Empty response from Gemini API');
            throw new Error('Empty response from Gemini API');
          }

          console.log('[NETLIFY-GEMINI] Success! Response length:', responseText.length);

          // Check if response was truncated
          const finishReason = response.response.candidates?.[0]?.finishReason;
          const wasTruncated = finishReason === 'MAX_TOKENS' || finishReason === 'LENGTH';
          
          if (wasTruncated) {
            console.warn(`[NETLIFY-GEMINI] Response was truncated (${finishReason})`);
          }

          return {
            statusCode: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: responseText,
              candidates: response.response.candidates,
              usage: response.response.usageMetadata,
              finishReason: finishReason,
              truncated: wasTruncated,
              keyUsed: keyNumber,
              attemptNumber: attemptNumber
            }),
          };

        } catch (requestError: any) {
          clearTimeout(timeoutId);
          console.error(`[NETLIFY-GEMINI] Request error with key ${keyNumber}, attempt ${attemptNumber}:`, requestError);
          throw requestError;
        }

      } catch (error: any) {
        lastError = error;
        console.error(`[NETLIFY-GEMINI] Key ${keyNumber}, attempt ${attemptNumber} failed:`, error.message);
        
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

        // Check if this is a service unavailable error
        const isServiceError = error.message?.includes('unavailable') ||
                              error.message?.includes('503') ||
                              error.message?.includes('502') ||
                              error.status === 503 ||
                              error.status === 502;

        if (isQuotaError) {
          console.warn(`[NETLIFY-GEMINI] Quota/rate limit detected on key ${keyNumber}, trying next`);
          retryCount++;
          continue;
        }

        if (isTimeoutError) {
          console.warn(`[NETLIFY-GEMINI] Timeout detected on key ${keyNumber}, trying next`);
          retryCount++;
          continue;
        }

        if (isServiceError) {
          console.warn(`[NETLIFY-GEMINI] Service error detected on key ${keyNumber}, retrying with backoff`);
          // Add exponential backoff for service errors
          if (attemptNumber < 3) {
            const backoffMs = Math.pow(2, attemptNumber) * 1000;
            console.log(`[NETLIFY-GEMINI] Waiting ${backoffMs}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
          retryCount++;
          continue;
        }

        // For other errors, try next key/attempt
        console.warn(`[NETLIFY-GEMINI] Error with key ${keyNumber}: ${error.message}, trying next`);
        retryCount++;
      }
    }

    // All attempts failed - comprehensive error handling
    console.error(`[NETLIFY-GEMINI] All ${maxRetries} attempts failed across ${apiKeys.length} API keys`);
    console.error(`[NETLIFY-GEMINI] Final error details:`, {
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
    } else if (lastError?.status === 502 || lastError?.status === 503 || lastError?.message?.includes('unavailable')) {
      errorMessage = 'Gemini API service temporarily unavailable - please try again in a few minutes';
      statusCode = 503;
      errorType = 'SERVICE_UNAVAILABLE';
    } else if (lastError?.message?.includes('import') || lastError?.message?.includes('module')) {
      errorMessage = 'Service initialization failed - dependency issue';
      statusCode = 503;
      errorType = 'SERVICE_UNAVAILABLE';
    } else if (lastError?.message?.includes('API key') || lastError?.status === 401) {
      errorMessage = 'API authentication failed';
      statusCode = 401;
      errorType = 'AUTH_ERROR';
    } else if (lastError?.message?.includes('Failed to load')) {
      errorMessage = 'Service dependencies failed to load';
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
        attemptsTotal: maxRetries,
        keysAttempted: apiKeys.length,
        suggestion: hasBinaryContent ? 'Try using a smaller file (under 300KB) or convert to text format' : 'Please try again or contact support'
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

// Helper functions for parameter validation
function validateNumber(value: any, min: number, max: number, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.max(min, Math.min(max, value));
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) {
      return Math.max(min, Math.min(max, parsed));
    }
  }
  return defaultValue;
}

function validateInteger(value: any, min: number, max: number, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.min(Math.max(min, Math.floor(value)), max);
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed)) {
      return Math.min(Math.max(min, parsed), max);
    }
  }
  return defaultValue;
}