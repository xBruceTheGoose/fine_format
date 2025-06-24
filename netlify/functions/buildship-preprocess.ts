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

    // Use the provided BuildShip API key
    const BUILDSHIP_API_KEY = process.env.BUILDSHIP_API_KEY || "784462ca6cbac7dbdf4d5fc9030a50b2894074f5e34550e113e5fe99dd1c1262";
    
    if (!BUILDSHIP_API_KEY) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'BuildShip API key not configured' }),
      };
    }

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

    // Call BuildShip multiFormatContentCleaner workflow
    const buildshipEndpoint = 'https://hiqtqy.buildship.run/executeWorkflow/D4xRme6b2N2vus1EeTNX/dd746df2-b48b-4b8a-9b63-7347c80ceeda';
    
    try {
      console.log('[NETLIFY-BUILDSHIP] Calling BuildShip multiFormatContentCleaner workflow');
      
      const response = await fetch(buildshipEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'BUILDSHIP_API_KEY': BUILDSHIP_API_KEY
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
        
        console.error('[NETLIFY-BUILDSHIP] BuildShip API error:', response.status, errorMessage);
        throw new Error(errorMessage);
      }

      const result: BuildShipResponse = await response.json();
      
      // Handle BuildShip response format
      if (result.error) {
        console.error('[NETLIFY-BUILDSHIP] BuildShip workflow error:', result.error);
        throw new Error(result.error);
      }

      if (!result.cleanedTexts || !Array.isArray(result.cleanedTexts)) {
        console.error('[NETLIFY-BUILDSHIP] Invalid response structure:', result);
        throw new Error('Invalid response from BuildShip workflow - expected cleanedTexts array');
      }

      // Validate cleaned texts
      const validCleanedTexts = result.cleanedTexts.filter(text => 
        typeof text === 'string' && text.trim().length > 50
      );

      if (validCleanedTexts.length === 0) {
        console.warn('[NETLIFY-BUILDSHIP] No valid cleaned texts received');
        throw new Error('No valid cleaned text content received from BuildShip workflow');
      }

      console.log('[NETLIFY-BUILDSHIP] Success:', {
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
          sourcesProcessed: validSources.length
        }),
      };

    } catch (error: any) {
      console.error('[NETLIFY-BUILDSHIP] BuildShip workflow failed:', error.message);
      
      // Enhanced error handling
      let errorMessage = 'Failed to process content with BuildShip workflow';
      let statusCode = 500;
      let errorType = 'BUILDSHIP_ERROR';
      
      if (error.message?.includes('timeout')) {
        errorMessage = 'BuildShip preprocessing timed out - content may be too large or complex';
        statusCode = 408;
        errorType = 'TIMEOUT_ERROR';
      } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
        errorMessage = 'BuildShip API quota exceeded - please try again later';
        statusCode = 429;
        errorType = 'QUOTA_EXCEEDED';
      } else if (error.message?.includes('invalid') || error.message?.includes('400')) {
        errorMessage = 'Invalid request format or content for BuildShip workflow';
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
          details: error.message,
          type: errorType,
          suggestion: 'Try with smaller files or fewer sources, or contact support if the issue persists'
        }),
      };
    }

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