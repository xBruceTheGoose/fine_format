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
    // Parse request body with better error handling
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

    // Validate messages array
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

    // Check for API keys
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) {
      console.error('[NETLIFY-GEMINI] No API key configured');
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

    console.log('[NETLIFY-GEMINI] API key found, proceeding with request');

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

      // Very conservative limit to prevent timeouts
      const MAX_BINARY_SIZE = 1 * 1024 * 1024; // 1MB to prevent timeouts
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

    try {
      console.log('[NETLIFY-GEMINI] Attempting to import @google/genai');
      
      // Dynamic import with better error handling
      const { GoogleGenAI } = await import('@google/genai');
      console.log('[NETLIFY-GEMINI] Successfully imported @google/genai');

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      console.log('[NETLIFY-GEMINI] GoogleGenAI client initialized');
      
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
          throw new Error(`Invalid message format at index ${index}: ${msgError.message}`);
        }
      });

      console.log(`[NETLIFY-GEMINI] Converted ${contents.length} messages to Gemini format`);

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

      console.log('[NETLIFY-GEMINI] Request config prepared:', {
        model: requestConfig.model,
        maxOutputTokens: requestConfig.config.maxOutputTokens,
        temperature: requestConfig.config.temperature,
        hasTools: !!tools,
        messageCount: contents.length,
        hasBinaryContent
      });

      // Set realistic timeout for Netlify functions
      const timeoutMs = hasBinaryContent ? 15000 : 20000; // 15s for binary, 20s for text
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[NETLIFY-GEMINI] Request timeout after ${timeoutMs}ms`);
        controller.abort();
      }, timeoutMs);

      try {
        console.log('[NETLIFY-GEMINI] Making request to Gemini API...');
        
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
        console.log('[NETLIFY-GEMINI] Received response from Gemini API');
        
        if (!response || typeof response.text !== 'function') {
          console.error('[NETLIFY-GEMINI] Invalid response structure:', response);
          throw new Error('Invalid response from Gemini API');
        }

        const responseText = response.text();
        
        if (!responseText || responseText.trim().length === 0) {
          console.error('[NETLIFY-GEMINI] Empty response from Gemini API');
          throw new Error('Empty response from Gemini API');
        }

        console.log('[NETLIFY-GEMINI] Success! Response length:', responseText.length);

        // Check if response was truncated
        const finishReason = response.candidates?.[0]?.finishReason;
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
            candidates: response.candidates,
            usage: response.usageMetadata,
            finishReason: finishReason,
            truncated: wasTruncated
          }),
        };

      } catch (requestError: any) {
        clearTimeout(timeoutId);
        console.error('[NETLIFY-GEMINI] Request error:', requestError);
        throw requestError;
      }

    } catch (error: any) {
      console.error('[NETLIFY-GEMINI] API call failed:', error);
      
      // Enhanced error handling with specific error types
      let errorMessage = 'Failed to process request';
      let statusCode = 500;
      let errorType = 'UNKNOWN_ERROR';
      
      if (error.message?.includes('timeout') || error.name === 'AbortError') {
        errorMessage = 'Request timed out - content may be too large or complex for processing';
        statusCode = 408;
        errorType = 'TIMEOUT_ERROR';
      } else if (error.message?.includes('quota') || error.status === 429) {
        errorMessage = 'API quota exceeded - please try again later';
        statusCode = 429;
        errorType = 'QUOTA_EXCEEDED';
      } else if (error.message?.includes('invalid') || error.status === 400) {
        errorMessage = 'Invalid request format or content';
        statusCode = 400;
        errorType = 'INVALID_REQUEST';
      } else if (error.message?.includes('SAFETY')) {
        errorMessage = 'Content was blocked by safety filters';
        statusCode = 400;
        errorType = 'SAFETY_FILTER';
      } else if (error.status === 502 || error.status === 503) {
        errorMessage = 'Gemini API service temporarily unavailable';
        statusCode = 503;
        errorType = 'SERVICE_UNAVAILABLE';
      } else if (error.message?.includes('import') || error.message?.includes('module')) {
        errorMessage = 'Service initialization failed - dependency issue';
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
          details: error.message,
          type: errorType,
          suggestion: hasBinaryContent ? 'Try using a smaller file or convert to text format' : 'Please try again or contact support'
        }),
      };
    }

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
        type: 'FUNCTION_ERROR'
      }),
    };
  }
};