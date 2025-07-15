import { Handler } from '@netlify/functions';

interface DatasetMetrics {
  total: number;
  successful: number;
  lastGenerated: string;
  averageSize: number;
}

// In a production environment, this would be stored in a database
let metrics: DatasetMetrics = {
  total: 0,
  successful: 0,
  lastGenerated: new Date().toISOString(),
  averageSize: 0
};

export const handler: Handler = async (event) => {
  console.log('[DATASET-STATS] Function invoked, method:', event.httpMethod);
  
  if (event.httpMethod === 'POST' && event.body) {
    // Update metrics
    const update = JSON.parse(event.body);
    metrics.total++;
    metrics.successful += update.success ? 1 : 0;
    metrics.lastGenerated = new Date().toISOString();
    metrics.averageSize = ((metrics.averageSize * (metrics.total - 1)) + update.size) / metrics.total;
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: JSON.stringify(metrics)
  };
};