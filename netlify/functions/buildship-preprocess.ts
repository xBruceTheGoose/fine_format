import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

interface BuildShipSource {
  type: 'file' | 'url';
  content: string;
  metadata: {
    name: string;
    mimeType?: string;
    isBinary?: boolean;
    url?: string;
  };
}

interface RequestBody {
  sources: BuildShipSource[];
}

interface BuildShipResponse {
  cleanedTexts?: string[];
  error?: string;
  message?: string;
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
    const { sources }: RequestBody = JSON.parse(event.body || '{}');

    if (!sources || !Array.isArray(sources)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Sources array is required' }),
      };
    }

    // Try multiple API keys with fallback
    const BUILDSHIP_API_KEY = process.env.BUILDSHIP_API_KEY;
    const BUILDSHIP_API_KEY_2 = process.env.BUILDSHIP_API_KEY_2;
    const BUILDSHIP_API_KEY_3 = process.env.BUILDSHIP_API_KEY_3;
    
    const apiKeys = [BUILDSHIP_API_KEY, BUILDSHIP_API_KEY_2, BUILDSHIP_API_KEY_3].filter(key => key?.trim());
    
    if (apiKeys.length === 0) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No BuildShip API keys configured' }),
      };
    }

    console.log(`[NETLIFY-BUILDSHIP] Available API keys: ${apiKeys.length}`);
    console.log(`[NETLIFY-BUILDSHIP] Processing ${sources.length} sources`);

    // Validate sources
    const validSources = sources.filter(source => 
      source && 
      typeof source === 'object' &&
      ['file', 'url'].includes(source.type) &&
      typeof source.content === 'string' &&
      source.content.trim().length > 0 &&
      source.metadata &&
      typeof source.metadata.name === 'string'
    );

    if (validSources.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'No valid sources provided' }),
      };
    }

    console.log(`[NETLIFY-BUILDSHIP] Validated ${validSources.length} sources`);

    const buildshipEndpoint = 'https://hiqtqy.buildship.run/executeWorkflow/D4xRme6b2N2vus1EeTNX/dd746df2-b48b-4b8a-9b63-7347c80ceeda';
    let lastError: any = null;
    
    // Try each API key in sequence
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const keyNumber = i + 1;
      
      try {
        console.log(`[NETLIFY-BUILDSHIP] Trying API key ${keyNumber}/${apiKeys.length}`);
        
        const response = await fetch(buildshipEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'BUILDSHIP_API_KEY': apiKey
          },
          body: JSON.stringify({
            sources: validSources
          }),
          signal: AbortSignal.timeout(180000) // 3 minute timeout for preprocessing
        });

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          
          try {
            const errorData = await response.json();
            if (errorData.error || errorData.message) {
              errorMessage = errorData.error || errorData.message;
            }
          } catch {
            // If we can't parse error JSON, use the HTTP status
          }
          
          console.error(`[NETLIFY-BUILDSHIP] API error with key ${keyNumber}:`, response.status, errorMessage);
          
          // Check if this is a quota/rate limit error
          const isQuotaError = response.status === 429 || 
                             errorMessage.includes('quota') || 
                             errorMessage.includes('rate') || 
                             errorMessage.includes('limit');

          if (isQuotaError) {
            console.warn(`[NETLIFY-BUILDSHIP] Quota/rate limit detected on key ${keyNumber}, trying next key`);
            lastError = new Error(`Key ${keyNumber}: ${errorMessage}`);
            continue; // Try next key immediately for quota errors
          }
          
          throw new Error(errorMessage);
        }

        const result: BuildShipResponse = await response.json();
        
        // Handle BuildShip response format
        if (result.error) {
          console.error(`[NETLIFY-BUILDSHIP] BuildShip error with key ${keyNumber}:`, result.error);
          throw new Error(result.error);
        }

        if (!result.cleanedTexts || !Array.isArray(result.cleanedTexts)) {
          console.error(`[NETLIFY-BUILDSHIP] Invalid response structure with key ${keyNumber}:`, result);
          throw new Error('Invalid response from BuildShip API - expected cleanedTexts array');
        }

        // Validate cleaned texts
        const validCleanedTexts = result.cleanedTexts.filter(text => 
          typeof text === 'string' && text.trim().length > 50
        );

        if (validCleanedTexts.length === 0) {
          console.warn(`[NETLIFY-BUILDSHIP] No valid cleaned texts with key ${keyNumber}`);
          throw new Error('No valid cleaned text content received from BuildShip');
        }

        console.log(`[NETLIFY-BUILDSHIP] Success with key ${keyNumber}:`, {
          sourcesProcessed: validSources.length,
          cleanedTextsReceived: result.cleanedTexts.length,
          validCleanedTexts: validCleanedTexts.length,
          totalLength: validCleanedTexts.reduce((sum, text) => sum + text.length, 0)
        });
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            cleanedTexts: validCleanedTexts,
            sourcesProcessed: validSources.length,
            keyUsed: keyNumber
          }),
        };

      } catch (error: any) {
        lastError = error;
        console.error(`[NETLIFY-BUILDSHIP] Key ${keyNumber} failed:`, error.message);
        
        // Check if this is a quota/rate limit error
        const isQuotaError = error.message?.includes('quota') || 
                           error.message?.includes('rate') || 
                           error.message?.includes('limit') ||
                           error.message?.includes('429');

        if (isQuotaError) {
          console.warn(`[NETLIFY-BUILDSHIP] Quota/rate limit detected on key ${keyNumber}, trying next key`);
          continue; // Try next key immediately for quota errors
        }

        // For other errors, still try the next key but log the error type
        console.warn(`[NETLIFY-BUILDSHIP] Error with key ${keyNumber}: ${error.message}, trying next key`);
        continue;
      }
    }

    // All keys failed
    console.error(`[NETLIFY-BUILDSHIP] All ${apiKeys.length} API keys failed`);
    
    // Enhanced error handling
    let errorMessage = 'Failed to process content with all available API keys';
    let statusCode = 500;
    let errorType = 'UNKNOWN_ERROR';
    
    if (lastError?.message?.includes('timeout')) {
      errorMessage = 'BuildShip preprocessing timed out - content may be too large or complex';
      statusCode = 408;
      errorType = 'TIMEOUT_ERROR';
    } else if (lastError?.message?.includes('quota')) {
      errorMessage = 'All API keys have exceeded quota - please try again later';
      statusCode = 429;
      errorType = 'QUOTA_EXCEEDED';
    } else if (lastError?.message?.includes('invalid')) {
      errorMessage = 'Invalid request format or content';
      statusCode = 400;
      errorType = 'INVALID_REQUEST';
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
        suggestion: 'Try with smaller files or fewer sources, or contact support if the issue persists'
      }),
    };

  } catch (error: any) {
    console.error('[NETLIFY-BUILDSHIP] Request processing failed:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to process BuildShip request',
        details: error.message,
        type: error.name || 'UnknownError'
      }),
    };
  }
};