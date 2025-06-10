interface DatasetMetricsUpdate {
  success: boolean;
  size: number;
  timeElapsed: number;
  successRate: number;
}

class MetricsService {
  private baseUrl = '/.netlify/functions/dataset-stats';

  async updateMetrics(metrics: DatasetMetricsUpdate): Promise<void> {
    try {
      await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metrics),
      });
    } catch (error) {
      console.warn('[METRICS] Failed to update dataset metrics:', error);
    }
  }
}

export const metricsService = new MetricsService();
