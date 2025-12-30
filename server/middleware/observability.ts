import { Request, Response, NextFunction } from 'express';
import { getPoolStats } from '../db';

interface MetricsData {
  requestCount: number;
  errorCount: number;
  latencies: number[];
  rbacDenials: number;
  endpointStats: Record<string, {
    count: number;
    errors: number;
    latencies: number[];
  }>;
  slowQueries: Array<{
    endpoint: string;
    duration: number;
    timestamp: Date;
  }>;
  startTime: Date;
}

const SLOW_QUERY_THRESHOLD_MS = 200;
const MAX_LATENCIES_STORED = 10000;
const MAX_SLOW_QUERIES = 100;

let metrics: MetricsData = {
  requestCount: 0,
  errorCount: 0,
  latencies: [],
  rbacDenials: 0,
  endpointStats: {},
  slowQueries: [],
  startTime: new Date(),
};

export function resetMetrics(): void {
  metrics = {
    requestCount: 0,
    errorCount: 0,
    latencies: [],
    rbacDenials: 0,
    endpointStats: {},
    slowQueries: [],
    startTime: new Date(),
  };
}

export function recordRbacDenial(): void {
  metrics.rbacDenials++;
}

function calculatePercentile(arr: number[], percentile: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function getMetricsSummary() {
  const now = new Date();
  const uptimeMs = now.getTime() - metrics.startTime.getTime();
  const poolStats = getPoolStats();

  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const endpointSummary: Record<string, {
    count: number;
    errors: number;
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
    avgLatency: number;
  }> = {};

  for (const [endpoint, stats] of Object.entries(metrics.endpointStats)) {
    const avgLatency = stats.latencies.length > 0 
      ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length 
      : 0;
    
    endpointSummary[endpoint] = {
      count: stats.count,
      errors: stats.errors,
      errorRate: stats.count > 0 ? (stats.errors / stats.count) * 100 : 0,
      p50: calculatePercentile(stats.latencies, 50),
      p95: calculatePercentile(stats.latencies, 95),
      p99: calculatePercentile(stats.latencies, 99),
      avgLatency: Math.round(avgLatency * 100) / 100,
    };
  }

  return {
    summary: {
      totalRequests: metrics.requestCount,
      totalErrors: metrics.errorCount,
      errorRate: metrics.requestCount > 0 ? (metrics.errorCount / metrics.requestCount) * 100 : 0,
      rbacDenials: metrics.rbacDenials,
      uptimeSeconds: Math.floor(uptimeMs / 1000),
    },
    latency: {
      p50: calculatePercentile(metrics.latencies, 50),
      p95: calculatePercentile(metrics.latencies, 95),
      p99: calculatePercentile(metrics.latencies, 99),
      avg: metrics.latencies.length > 0 
        ? Math.round((metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length) * 100) / 100
        : 0,
    },
    dbPool: poolStats,
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
      externalMB: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100,
    },
    cpu: {
      userMicros: cpuUsage.user,
      systemMicros: cpuUsage.system,
    },
    endpoints: endpointSummary,
    slowQueries: metrics.slowQueries.slice(-20),
    collectedAt: now.toISOString(),
  };
}

export function observabilityMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;

  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.requestCount++;

    if (res.statusCode >= 400) {
      metrics.errorCount++;
    }

    if (res.statusCode === 401 || res.statusCode === 403) {
      metrics.rbacDenials++;
    }

    if (metrics.latencies.length < MAX_LATENCIES_STORED) {
      metrics.latencies.push(duration);
    }

    if (!metrics.endpointStats[endpoint]) {
      metrics.endpointStats[endpoint] = {
        count: 0,
        errors: 0,
        latencies: [],
      };
    }

    const endpointStat = metrics.endpointStats[endpoint];
    endpointStat.count++;
    
    if (res.statusCode >= 400) {
      endpointStat.errors++;
    }

    if (endpointStat.latencies.length < MAX_LATENCIES_STORED) {
      endpointStat.latencies.push(duration);
    }

    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      metrics.slowQueries.push({
        endpoint,
        duration,
        timestamp: new Date(),
      });

      if (metrics.slowQueries.length > MAX_SLOW_QUERIES) {
        metrics.slowQueries.shift();
      }
    }
  });

  next();
}
