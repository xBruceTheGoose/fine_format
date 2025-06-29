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

    // Try multiple API keys with fallback
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2;
    const GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3;
    
    const apiKeys = [GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3].filter(key => key?.trim());
    
    if (apiKeys.length === 0) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No Gemini API keys configured' }),
      };
    }

    console.log(`[NETLIFY-GEMINI] Available API keys: ${apiKeys.length}`);

    // Check for binary content and validate size BEFORE processing
    const hasBinaryContent = messages.some(msg => 
      msg.parts?.some(part => part.inlineData)
    );

    if (hasBinaryContent) {
      console.log('[NETLIFY-GEMINI] Binary content detected, validating size...');
      
      // Calculate total binary data size
      let totalBinarySize = 0;
      for (const msg of messages) {
        if (msg.parts) {
          for (const part of msg.parts) {
            if (part.inlineData?.data) {
              // Base64 data size (approximate original size = base64 length * 0.75)
              totalBinarySize += part.inlineData.data.length * 0.75;
            }
          }
        }
      }

      console.log(`[NETLIFY-GEMINI] Total binary content size: ${Math.round(totalBinarySize / 1024)} KB`);

      // CRITICAL: Much more restrictive limits to prevent 502 errors
      const MAX_BINARY_SIZE = 150 * 1024; // 150KB to prevent timeouts (was 10MB)
      if (totalBinarySize > MAX_BINARY_SIZE) {
        return {
          statusCode: 413,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Binary content too large: ${Math.round(totalBinarySize / 1024)}KB. Maximum allowed: ${MAX_BINARY_SIZE / 1024}KB`,
            details: 'Large files cause Netlify function timeouts. Please use smaller files or split content.',
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
        
        // Import GoogleGenAI dynamically
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey });
        
        // Convert messages to Gemini format - handle both content and parts
        const contents = messages.map((msg: any) => {
          if (msg.parts) {
            // Message already has parts (for binary content)
            return {
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: msg.parts
            };
          } else {
            // Regular text message
            return {
              role: msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            };
          }
        });

        const requestConfig: any = {
          model: 'gemini-2.0-flash-exp',
          contents,
          config: {
            maxOutputTokens: Math.min(max_tokens || 4000, 20000),
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

        console.log(`[NETLIFY-GEMINI] Making request with key ${keyNumber}, config:`, {
          model: requestConfig.model,
          maxOutputTokens: requestConfig.config.maxOutputTokens,
          temperature: requestConfig.config.temperature,
          hasTools: !!tools,
          messageCount: contents.length,
          hasBinaryContent
        });

        // CRITICAL: Realistic timeout for Netlify functions
        const timeoutMs = hasBinaryContent ? 20000 : 25000; // 20s for binary, 25s for text (increased from 15s)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout - Netlify function limit exceeded')), timeoutMs);
        });

        const requestPromise = ai.models.generateContent(requestConfig);
        const response = await Promise.race([requestPromise, timeoutPromise]);
        
        if (!response.text) {
          console.error(`[NETLIFY-GEMINI] No response text from Gemini API with key ${keyNumber}`);
          throw new Error('No response from Gemini API');
        }

        const responseText = response.text();
        console.log(`[NETLIFY-GEMINI] Success with key ${keyNumber}, response length:`, responseText.length);

        // Check if response was truncated
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          console.warn(`[NETLIFY-GEMINI] Response was truncated due to token limit with key ${keyNumber}`);
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
            truncated: response.candidates?.[0]?.finishReason === 'MAX_TOKENS',
            keyUsed: keyNumber
          }),
        };

      } catch (error: any) {
        lastError = error;
        console.error(`[NETLIFY-GEMINI] Key ${keyNumber} failed:`, error.message);
        console.error(`[NETLIFY-GEMINI] Error details:`, {
          name: error.name,
          message: error.message,
          stack: error.stack?.substring(0, 500),
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
                              error.code === 'ETIMEDOUT';

        if (isQuotaError) {
          console.warn(`[NETLIFY-GEMINI] Quota/rate limit detected on key ${keyNumber}, trying next key`);
          continue; // Try next key immediately for quota errors
        }

        if (isTimeoutError) {
          console.warn(`[NETLIFY-GEMINI] Timeout detected on key ${keyNumber}, trying next key`);
          continue; // Try next key for timeout errors
        }

        // For other errors, still try the next key but log the error type
        console.warn(`[NETLIFY-GEMINI] Error with key ${keyNumber}: ${error.message}, trying next key`);
        continue;
      }
    }

    // All keys failed
    console.error(`[NETLIFY-GEMINI] All ${apiKeys.length} API keys failed`);
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
    
    if (lastError?.message?.includes('timeout') || lastError?.message?.includes('TIMEOUT')) {
      errorMessage = 'Request timed out - content may be too large or complex for Netlify function processing';
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
        suggestion: hasBinaryContent ? 'Try using a smaller file (under 150KB) or convert to text format' : 'Please try again or contact support'
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-GEMINI] Request processing failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to process request',
        details: error.message,
        type: error.name || 'UnknownError',
        stack: error.stack?.substring(0, 200)
      }),
    };
  }
};