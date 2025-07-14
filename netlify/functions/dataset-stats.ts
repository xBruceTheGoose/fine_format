import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Handler } from '@netlify/functions';

// Ensure proper export for Netlify
export { handler };

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

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const handler: Handler = async (event) => {
  console.log('[DATASET-STATS] Function invoked, method:', event.httpMethod);
  
  if (event.httpMethod === 'POST' && event.body) {
    // Update metrics
    const update = JSON.parse(event.body);
    metrics.total++;
    metrics.successful += update.success ? 1 : 0;
    metrics.lastGenerated = new Date().toISOString();
    metrics.averageSize = ((metrics.averageSize * (metrics.total - 1)) + update.size) / metrics.total;
  }