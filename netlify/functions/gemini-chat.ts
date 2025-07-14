import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

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

  console.log('[NETLIFY-GEMINI] Function invoked');

  try {
    // Parse and validate request body
    let requestBody: RequestBody;
    try {
      if (!event.body) {
        throw new Error('Request body is empty');
      }
      requestBody = JSON.parse(event.body);
    } catch (parseError: any) {
      console.error('[NETLIFY-GEMINI] Failed to parse request body:', parseError);
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

    // Enhanced API key management
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
    const GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2?.trim();
    const GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3?.trim();
    
    // Filter valid API keys
    const apiKeys = [GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3]
      .filter(key => key && key.length > 20 && key.startsWith('AIza'));
    
    if (apiKeys.length === 0) {
      console.error('[NETLIFY-GEMINI] No valid API keys configured');
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          error: 'Gemini API service is not configured properly. Please contact support.',
          type: 'SERVICE_UNAVAILABLE',
          details: 'No valid API keys found'
        }),
      };
    }

    console.log(`[NETLIFY-GEMINI] Found ${apiKeys.length} valid API keys`);

    // Validate and sanitize parameters
    const validatedMaxTokens = validateInteger(max_tokens, 1, 8000, 4000);
    const validatedTemperature = validateNumber(temperature, 0, 1, 0.7);

    console.log('[NETLIFY-GEMINI] Validated parameters:', {
      originalMaxTokens: max_tokens,
      validatedMaxTokens,
      originalTemperature: temperature,
      validatedTemperature
    });

    // Check for binary content
    const hasBinaryContent = messages.some(msg => 
      msg.parts?.some((part: any) => part.inlineData)
    );

    if (hasBinaryContent) {
      console.log('[NETLIFY-GEMINI] Binary content detected');
      
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

      const MAX_BINARY_SIZE = 500 * 1024; // 500KB
      if (totalBinarySize > MAX_BINARY_SIZE) {
        return {
          statusCode: 413,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Binary content too large: ${Math.round(totalBinarySize / 1024)}KB. Maximum allowed: ${MAX_BINARY_SIZE / 1024}KB`,
            type: 'PAYLOAD_TOO_LARGE',
            details: 'Consider using smaller files or text extraction'
          }),
        };
      }
    }

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
        console.log(`[NETLIFY-GEMINI] Attempt ${retryCount + 1}/${maxRetries}: API key ${keyNumber}/${apiKeys.length}, retry ${attemptNumber}`);
        
        // Dynamic import with error handling
        let GoogleGenAI;
        try {
          const genaiModule = await import('@google/genai');
          GoogleGenAI = genaiModule.GoogleGenAI;
          console.log('[NETLIFY-GEMINI] Successfully imported @google/genai');
        } catch (importError: any) {
          console.error('[NETLIFY-GEMINI] Failed to import @google/genai:', importError);
          throw new Error('Failed to load Gemini SDK. Service temporarily unavailable.');
        }

        const ai = new GoogleGenAI({ apiKey });
        console.log('[NETLIFY-GEMINI] GoogleGenAI client initialized');
        
        // Convert messages to Gemini format with validation
        const contents: GeminiMessage[] = messages.map((msg: any, index: number) => {
          try {
            if (msg.parts) {
              if (!Array.isArray(msg.parts)) {
                throw new Error(`Message ${index} parts must be an array`);
              }
              
              return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: msg.parts
              };
            } else if (msg.content) {
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
          } catch (msgError: any) {
            console.error(`[NETLIFY-GEMINI] Error processing message ${index}:`, msgError);
            throw new Error(`Invalid message format at index ${index}: ${msgError.message}`);
          }
        });

        console.log(`[NETLIFY-GEMINI] Converted ${contents.length} messages to Gemini format`);

        // Build request configuration
        const requestConfig: GeminiRequest = {
          contents,
          generationConfig: {
            maxOutputTokens: validatedMaxTokens,
            temperature: validatedTemperature,
            topP: 0.9,
            topK: 32,
            ...config
          }
        };

        // Add tools if provided
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
        const baseTimeout = hasBinaryContent ? 20000 : 25000;
        const timeoutMs = Math.min(baseTimeout + (attemptNumber * 2000), 28000);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log(`[NETLIFY-GEMINI] Request timeout after ${timeoutMs}ms`);
          controller.abort();
        }, timeoutMs);

        try {
          console.log('[NETLIFY-GEMINI] Making request to Gemini API...');
          
          // Try multiple models for better reliability
          const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
          let response;
          let modelUsed = '';
          
          for (const modelName of models) {
            try {
              const model = ai.getGenerativeModel({ 
                model: modelName,
                generationConfig: requestConfig.generationConfig,
                tools: requestConfig.tools
              });
              
              const requestPromise = model.generateContent(requestConfig.contents);
              const timeoutPromise = new Promise((_, reject) => {
                controller.signal.addEventListener('abort', () => {
                  reject(new Error('Request timeout - Netlify function limit exceeded'));
                });
              });
              
              response = await Promise.race([requestPromise, timeoutPromise]);
              modelUsed = modelName;
              console.log(`[NETLIFY-GEMINI] Successfully used model: ${modelName}`);
              break;
            } catch (modelError: any) {
              console.warn(`[NETLIFY-GEMINI] Model ${modelName} failed:`, modelError.message);
              if (modelName === models[models.length - 1]) {
                throw modelError;
              }
            }
          }
          
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
          } catch (textError: any) {
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
              attemptNumber: attemptNumber,
              modelUsed: modelUsed
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
        
        // Enhanced error categorization
        const isQuotaError = error.message?.includes('quota') || 
                           error.message?.includes('rate') || 
                           error.message?.includes('limit') ||
                           error.message?.includes('429') ||
                           error.status === 429;

        const isTimeoutError = error.message?.includes('timeout') ||
                              error.message?.includes('TIMEOUT') ||
                              error.code === 'ETIMEDOUT' ||
                              error.name === 'AbortError';

        const isServiceError = error.message?.includes('unavailable') ||
                              error.message?.includes('503') ||
                              error.message?.includes('502') ||
                              error.status === 503 ||
                              error.status === 502;

        const isAuthError = error.message?.includes('API key') ||
                           error.message?.includes('authentication') ||
                           error.status === 401 ||
                           error.status === 403;

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
          if (attemptNumber < 3) {
            const backoffMs = Math.min(Math.pow(2, attemptNumber) * 1000, 5000);
            console.log(`[NETLIFY-GEMINI] Waiting ${backoffMs}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
          retryCount++;
          continue;
        }

        if (isAuthError) {
          console.error(`[NETLIFY-GEMINI] Authentication error with key ${keyNumber}, trying next`);
          retryCount++;
          continue;
        }

        // For other errors, try next key/attempt
        console.warn(`[NETLIFY-GEMINI] Error with key ${keyNumber}: ${error.message}, trying next`);
        retryCount++;
      }
    }

    // All attempts failed
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
    let errorType = 'ALL_KEYS_FAILED';
    
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
      errorMessage = 'API authentication failed with all keys';
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
        suggestion: getSuggestionForError(errorType, hasBinaryContent),
        debugInfo: {
          lastErrorName: lastError?.name,
          lastErrorStatus: lastError?.status,
          lastErrorCode: lastError?.code
        }
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

function getSuggestionForError(errorType: string, hasBinaryContent: boolean): string {
  switch (errorType) {
    case 'AUTH_ERROR':
      return 'Please check that your Gemini API keys are correctly configured and valid';
    case 'SERVICE_UNAVAILABLE':
      return 'The Gemini service is temporarily unavailable. Please try again in 2-5 minutes';
    case 'TIMEOUT_ERROR':
      return hasBinaryContent 
        ? 'Try using smaller files (under 500KB) or convert to text format'
        : 'Try with smaller content or fewer sources';
    case 'QUOTA_EXCEEDED':
      return 'API quota exceeded. Please wait or check your API usage limits';
    case 'PAYLOAD_TOO_LARGE':
      return 'Content is too large. Try with smaller files or less content';
    case 'SAFETY_FILTER':
      return 'Content was blocked by safety filters. Please modify your content';
    case 'ALL_KEYS_FAILED':
      return 'All API keys failed. Check your API key configuration and try again';
    default:
      return 'Please try again or contact support if the issue persists';
  }
}