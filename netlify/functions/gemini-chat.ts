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

    // Check for API key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY?.trim()) {
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

    console.log(`[NETLIFY-GEMINI] API key found, length: ${GEMINI_API_KEY.length}`);

    // Check for binary content and validate size BEFORE processing
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
      const MAX_BINARY_SIZE = 200 * 1024; // 200KB to prevent timeouts
      if (totalBinarySize > MAX_BINARY_SIZE) {
        return {
          statusCode: 413,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            error: `Binary content too large: ${Math.round(totalBinarySize / 1024)}KB. Maximum allowed: ${MAX_BINARY_SIZE / 1024}KB`,
            details: 'Large files cause function timeouts. Please use smaller files or convert to text.',
            type: 'PAYLOAD_TOO_LARGE'
          }),
        };
      }
    }

    try {
      console.log(`[NETLIFY-GEMINI] Attempting to import @google/genai`);
      
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

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
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

      // Build request configuration with comprehensive validation
      const requestConfig: any = {
        contents,
        generationConfig: {
          maxOutputTokens: Math.min(Math.max(1, max_tokens || 4000), 8000),
          temperature: Math.max(0, Math.min(1, temperature || 0.7)),
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

      // Set realistic timeout for Netlify functions
      const timeoutMs = hasBinaryContent ? 20000 : 25000; // 20s for binary, 25s for text
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[NETLIFY-GEMINI] Request timeout after ${timeoutMs}ms`);
        controller.abort();
      }, timeoutMs);

      try {
        console.log('[NETLIFY-GEMINI] Making request to Gemini API...');
        
        // Use the correct model and method with proper error handling
        const model = ai.getGenerativeModel({ 
          model: 'gemini-2.0-flash-exp',
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
            truncated: wasTruncated
          }),
        };

      } catch (requestError: any) {
        clearTimeout(timeoutId);
        console.error(`[NETLIFY-GEMINI] Request error:`, requestError);
        throw requestError;
      }

    } catch (error: any) {
      console.error(`[NETLIFY-GEMINI] API request failed:`, error);
      
      // Enhanced error handling with specific error types
      let errorMessage = 'Failed to process request with Gemini API';
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
      } else if (error.message?.includes('API key') || error.status === 401) {
        errorMessage = 'API authentication failed';
        statusCode = 401;
        errorType = 'AUTH_ERROR';
      } else if (error.message?.includes('Failed to load')) {
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
          details: error.message,
          type: errorType,
          suggestion: hasBinaryContent ? 'Try using a smaller file (under 200KB) or convert to text format' : 'Please try again or contact support'
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
        type: 'FUNCTION_ERROR',
        stack: error.stack?.substring(0, 200)
      }),
    };
  }
};