// API route for Gemini chat completions
// This will be a Vercel serverless function or similar

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, temperature = 0.7, max_tokens = 4000, tools, config } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  // Simple rate limiting (in production, use Redis or similar)
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const rateLimitKey = `gemini_${clientIP}`;
  
  // Basic in-memory rate limiting (10 requests per minute)
  if (!global.rateLimits) global.rateLimits = {};
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;
  
  if (!global.rateLimits[rateLimitKey]) {
    global.rateLimits[rateLimitKey] = { count: 0, resetTime: now + windowMs };
  }
  
  const rateLimit = global.rateLimits[rateLimitKey];
  
  if (now > rateLimit.resetTime) {
    rateLimit.count = 0;
    rateLimit.resetTime = now + windowMs;
  }
  
  if (rateLimit.count >= maxRequests) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }
  
  rateLimit.count++;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    // Convert messages to Gemini format
    const contents = messages.map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: Array.isArray(msg.parts) ? msg.parts : [{ text: msg.content }]
    }));

    const requestConfig: any = {
      model: 'gemini-2.0-flash-exp',
      contents,
    };

    // Add generation config if provided
    if (config) {
      requestConfig.config = config;
    }

    // Add tools if provided (for web search)
    if (tools) {
      requestConfig.config = { ...requestConfig.config, tools };
    }

    const response = await ai.models.generateContent(requestConfig);
    
    if (!response.text) {
      return res.status(500).json({ error: 'No response from Gemini API' });
    }

    return res.status(200).json({
      content: response.text(),
      candidates: response.candidates,
      usage: response.usageMetadata,
    });

  } catch (error: any) {
    console.error('Gemini API request failed:', error);
    return res.status(500).json({ 
      error: 'Failed to process request',
      details: error.message 
    });
  }
}