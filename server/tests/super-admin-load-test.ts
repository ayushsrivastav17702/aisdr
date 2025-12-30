/**
 * Super Admin Load Testing Suite
 * 
 * Comprehensive load testing for all Super Admin API endpoints
 * Uses autocannon for concurrent request simulation
 * 
 * Usage: npx tsx server/tests/super-admin-load-test.ts
 */

// @ts-ignore - autocannon types
import autocannon from 'autocannon';
type Result = any;

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SA_EMAIL = process.env.SA_EMAIL || 'superadmin@example.com';
const SA_PASSWORD = process.env.SA_PASSWORD || 'SuperAdmin123!';

interface TestResult {
  endpoint: string;
  concurrency: number;
  duration: number;
  requests: {
    total: number;
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
  };
  latency: {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    average: number;
    mean: number;
    stddev: number;
    min: number;
    max: number;
  };
  errors: number;
  timeouts: number;
  errorRate: number;
  statusCodes: Record<string, number>;
}

interface MetricsSnapshot {
  timestamp: string;
  dbPool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  summary: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    rbacDenials: number;
  };
  slowQueries?: Array<{
    endpoint: string;
    duration: number;
    timestamp: string;
  }>;
}

let authCookie = '';
let testTenantId: string | null = null;

async function login(): Promise<string> {
  console.log('\n🔐 Authenticating as Super Admin...');
  
  const response = await fetch(`${BASE_URL}/api/super-admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SA_EMAIL, password: SA_PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('No auth cookie received');
  }

  const cookieMatch = setCookie.match(/super_admin_token=([^;]+)/);
  if (!cookieMatch) {
    throw new Error('Could not extract auth token from cookie');
  }

  console.log('✅ Authentication successful');
  return `super_admin_token=${cookieMatch[1]}`;
}

async function getServerMetrics(): Promise<MetricsSnapshot | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/super-admin/internal/metrics`, {
      headers: { Cookie: authCookie },
    });
    
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Could not fetch server metrics:', error);
  }
  return null;
}

async function resetServerMetrics(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/super-admin/internal/metrics/reset`, {
      method: 'POST',
      headers: { Cookie: authCookie },
    });
  } catch (error) {
    console.warn('Could not reset server metrics:', error);
  }
}

async function getTenantId(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/super-admin/tenants?limit=1`, {
    headers: { Cookie: authCookie },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch tenants');
  }
  
  const data = await response.json();
  if (!data.tenants || data.tenants.length === 0) {
    throw new Error('No tenants available for testing');
  }
  
  return data.tenants[0].id;
}

function processResult(result: Result, endpoint: string, concurrency: number): TestResult {
  return {
    endpoint,
    concurrency,
    duration: result.duration,
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      mean: result.requests.mean,
      stddev: result.requests.stddev,
      min: result.requests.min,
      max: result.requests.max,
    },
    latency: {
      average: result.latency.average,
      mean: result.latency.mean,
      stddev: result.latency.stddev,
      min: result.latency.min,
      max: result.latency.max,
      p50: result.latency.p50,
      p95: result.latency.p95,
      p99: result.latency.p99,
    },
    throughput: {
      average: result.throughput.average,
      mean: result.throughput.mean,
      stddev: result.throughput.stddev,
      min: result.throughput.min,
      max: result.throughput.max,
    },
    errors: result.errors,
    timeouts: result.timeouts,
    errorRate: result.requests.total > 0 ? (result.errors / result.requests.total) * 100 : 0,
    statusCodes: result.statusCodeStats || {},
  };
}

async function runTest(
  endpoint: string,
  method: string,
  concurrency: number,
  duration: number = 60,
  body?: object,
  path?: string
): Promise<TestResult> {
  const url = `${BASE_URL}${path || endpoint}`;
  
  console.log(`\n📊 Testing: ${method} ${endpoint} @ ${concurrency} VUs for ${duration}s`);
  
  const opts: autocannon.Options = {
    url,
    connections: concurrency,
    pipelining: 1,
    duration,
    method: method as any,
    headers: {
      'Cookie': authCookie,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  };

  return new Promise((resolve, reject) => {
    const instance = autocannon(opts, (err: Error | null, result: Result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(processResult(result, endpoint, concurrency));
    });

    autocannon.track(instance, { renderProgressBar: true });
  });
}

function formatLatencyTable(results: TestResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('LATENCY ANALYSIS (milliseconds)');
  console.log('='.repeat(120));
  console.log(
    'Endpoint'.padEnd(45) +
    'VUs'.padStart(5) +
    'p50'.padStart(10) +
    'p95'.padStart(10) +
    'p99'.padStart(10) +
    'Avg'.padStart(10) +
    'Min'.padStart(10) +
    'Max'.padStart(10)
  );
  console.log('-'.repeat(120));
  
  for (const r of results) {
    console.log(
      r.endpoint.padEnd(45) +
      r.concurrency.toString().padStart(5) +
      r.latency.p50.toFixed(2).padStart(10) +
      r.latency.p95.toFixed(2).padStart(10) +
      r.latency.p99.toFixed(2).padStart(10) +
      r.latency.average.toFixed(2).padStart(10) +
      r.latency.min.toFixed(2).padStart(10) +
      r.latency.max.toFixed(2).padStart(10)
    );
  }
}

function formatErrorTable(results: TestResult[]): void {
  console.log('\n' + '='.repeat(100));
  console.log('ERROR ANALYSIS');
  console.log('='.repeat(100));
  console.log(
    'Endpoint'.padEnd(45) +
    'VUs'.padStart(5) +
    'Total Req'.padStart(12) +
    'Errors'.padStart(10) +
    'Timeouts'.padStart(10) +
    'Error Rate'.padStart(12)
  );
  console.log('-'.repeat(100));
  
  for (const r of results) {
    const errorRate = r.errorRate.toFixed(2) + '%';
    console.log(
      r.endpoint.padEnd(45) +
      r.concurrency.toString().padStart(5) +
      r.requests.total.toString().padStart(12) +
      r.errors.toString().padStart(10) +
      r.timeouts.toString().padStart(10) +
      errorRate.padStart(12)
    );
  }
}

function formatThroughputTable(results: TestResult[]): void {
  console.log('\n' + '='.repeat(90));
  console.log('THROUGHPUT ANALYSIS');
  console.log('='.repeat(90));
  console.log(
    'Endpoint'.padEnd(45) +
    'VUs'.padStart(5) +
    'Req/sec Avg'.padStart(15) +
    'Req/sec Min'.padStart(15) +
    'Req/sec Max'.padStart(15)
  );
  console.log('-'.repeat(90));
  
  for (const r of results) {
    console.log(
      r.endpoint.padEnd(45) +
      r.concurrency.toString().padStart(5) +
      r.requests.average.toFixed(2).padStart(15) +
      r.requests.min.toString().padStart(15) +
      r.requests.max.toString().padStart(15)
    );
  }
}

function identifyBottlenecks(results: TestResult[]): string[] {
  const bottlenecks: string[] = [];
  
  for (const r of results) {
    if (r.latency.p99 > 2000) {
      bottlenecks.push(`⚠️  ${r.endpoint} @ ${r.concurrency} VUs: p99 latency ${r.latency.p99.toFixed(0)}ms exceeds 2s threshold`);
    }
    if (r.latency.p95 > 1000) {
      bottlenecks.push(`⚠️  ${r.endpoint} @ ${r.concurrency} VUs: p95 latency ${r.latency.p95.toFixed(0)}ms exceeds 1s threshold`);
    }
    if (r.errorRate > 1) {
      bottlenecks.push(`❌ ${r.endpoint} @ ${r.concurrency} VUs: Error rate ${r.errorRate.toFixed(2)}% exceeds 1% threshold`);
    }
    if (r.errorRate > 5) {
      bottlenecks.push(`🔴 ${r.endpoint} @ ${r.concurrency} VUs: CRITICAL error rate ${r.errorRate.toFixed(2)}% exceeds 5%`);
    }
  }
  
  return bottlenecks;
}

function generateRecommendations(results: TestResult[], metricsSnapshots: MetricsSnapshot[]): string[] {
  const recommendations: string[] = [];
  
  const highLatencyEndpoints = results.filter(r => r.latency.p95 > 500);
  if (highLatencyEndpoints.length > 0) {
    recommendations.push('🔧 Consider adding database indexes for slow endpoints:');
    for (const r of highLatencyEndpoints) {
      recommendations.push(`   - ${r.endpoint}: Add composite indexes on frequently queried columns`);
    }
  }
  
  const auditResults = results.filter(r => r.endpoint.includes('audit'));
  if (auditResults.some(r => r.latency.p95 > 300)) {
    recommendations.push('🔧 Audit logs: Consider adding index on (createdAt DESC) for faster pagination');
    recommendations.push('🔧 Audit logs: Consider caching recent audit entries with 30s TTL');
  }
  
  const tenantResults = results.filter(r => r.endpoint.includes('tenants'));
  if (tenantResults.some(r => r.latency.p95 > 400)) {
    recommendations.push('🔧 Tenant queries: Add composite index on (status, plan, createdAt)');
    recommendations.push('🔧 Tenant search: Consider implementing full-text search with pg_trgm');
  }
  
  const dbPoolIssues = metricsSnapshots.filter(m => m.dbPool.waitingCount > 5);
  if (dbPoolIssues.length > 0) {
    recommendations.push('🔧 Database pool saturation detected - consider increasing pool.max from 20 to 30-40');
    recommendations.push('🔧 Implement connection pooling with PgBouncer for production');
  }
  
  const memoryGrowth = metricsSnapshots.filter(m => m.memory.heapUsedMB > 500);
  if (memoryGrowth.length > 0) {
    recommendations.push('🔧 Memory usage high - review for memory leaks in long-running requests');
    recommendations.push('🔧 Consider implementing request timeout middleware (30s max)');
  }
  
  const statsResults = results.filter(r => r.endpoint === '/api/super-admin/stats');
  if (statsResults.some(r => r.latency.p95 > 500)) {
    recommendations.push('🔧 Dashboard stats: Cache aggregations with 60s TTL');
    recommendations.push('🔧 Dashboard stats: Pre-compute metrics in background job');
  }
  
  recommendations.push('\n📚 General recommendations:');
  recommendations.push('   - Implement rate limiting: 100 req/min for read endpoints, 20 req/min for write endpoints');
  recommendations.push('   - Add response compression (gzip) for JSON payloads > 1KB');
  recommendations.push('   - Consider Redis caching for frequently accessed tenant data');
  
  return recommendations;
}

async function runLoadTestSuite(): Promise<void> {
  console.log('🚀 Super Admin Load Testing Suite');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Super Admin: ${SA_EMAIL}`);
  console.log('='.repeat(60));

  try {
    authCookie = await login();
    testTenantId = await getTenantId();
    console.log(`📋 Using test tenant: ${testTenantId}`);

    await resetServerMetrics();
    
    const results: TestResult[] = [];
    const metricsSnapshots: MetricsSnapshot[] = [];
    const concurrencyLevels = [5, 10, 20, 50];
    const testDuration = 30;

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 1: Authentication Endpoints');
    console.log('═'.repeat(80));

    for (const vu of concurrencyLevels) {
      results.push(await runTest('/api/super-admin/me', 'GET', vu, testDuration));
      const metrics = await getServerMetrics();
      if (metrics) metricsSnapshots.push(metrics);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 2: Dashboard & Stats (Read-Only)');
    console.log('═'.repeat(80));

    for (const vu of concurrencyLevels) {
      results.push(await runTest('/api/super-admin/stats', 'GET', vu, testDuration));
      const metrics = await getServerMetrics();
      if (metrics) metricsSnapshots.push(metrics);
    }

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 3: Tenant Management');
    console.log('═'.repeat(80));

    for (const vu of concurrencyLevels) {
      results.push(await runTest('/api/super-admin/tenants', 'GET', vu, testDuration));
      const metrics = await getServerMetrics();
      if (metrics) metricsSnapshots.push(metrics);
    }

    for (const vu of [5, 10, 20]) {
      results.push(await runTest(
        '/api/super-admin/tenants?search=test',
        'GET',
        vu,
        testDuration,
        undefined,
        '/api/super-admin/tenants?search=test'
      ));
    }

    for (const vu of [5, 10]) {
      results.push(await runTest(
        `/api/super-admin/tenants/${testTenantId}`,
        'GET',
        vu,
        testDuration,
        undefined,
        `/api/super-admin/tenants/${testTenantId}`
      ));
    }

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 4: User Management');
    console.log('═'.repeat(80));

    for (const vu of concurrencyLevels) {
      results.push(await runTest('/api/super-admin/users', 'GET', vu, testDuration));
      const metrics = await getServerMetrics();
      if (metrics) metricsSnapshots.push(metrics);
    }

    for (const vu of [5, 10, 20]) {
      results.push(await runTest(
        '/api/super-admin/users?page=1&limit=50',
        'GET',
        vu,
        testDuration,
        undefined,
        '/api/super-admin/users?page=1&limit=50'
      ));
    }

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 5: Audit Logs');
    console.log('═'.repeat(80));

    for (const vu of concurrencyLevels) {
      results.push(await runTest('/api/super-admin/audit-logs', 'GET', vu, testDuration));
      const metrics = await getServerMetrics();
      if (metrics) metricsSnapshots.push(metrics);
    }

    for (const vu of [5, 10]) {
      results.push(await runTest(
        '/api/super-admin/audit-logs?limit=100',
        'GET',
        vu,
        testDuration,
        undefined,
        '/api/super-admin/audit-logs?limit=100'
      ));
    }

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 6: RBAC Enforcement Under Load');
    console.log('═'.repeat(80));

    console.log('\n🔒 Testing unauthorized access patterns...');
    for (const vu of [10, 20]) {
      results.push(await runTest(
        '/api/campaigns (SA→SDR route)',
        'GET',
        vu,
        testDuration,
        undefined,
        '/api/campaigns'
      ));
    }

    const finalMetrics = await getServerMetrics();
    if (finalMetrics) metricsSnapshots.push(finalMetrics);

    console.log('\n\n');
    console.log('█'.repeat(80));
    console.log('                    LOAD TEST RESULTS SUMMARY');
    console.log('█'.repeat(80));

    formatLatencyTable(results);
    formatErrorTable(results);
    formatThroughputTable(results);

    console.log('\n' + '='.repeat(80));
    console.log('DATABASE POOL UTILIZATION');
    console.log('='.repeat(80));
    
    if (metricsSnapshots.length > 0) {
      const maxWaiting = Math.max(...metricsSnapshots.map(m => m.dbPool.waitingCount));
      const avgIdle = metricsSnapshots.reduce((sum, m) => sum + m.dbPool.idleCount, 0) / metricsSnapshots.length;
      const poolSize = metricsSnapshots[0]?.dbPool.totalCount || 20;
      
      console.log(`Pool Size: ${poolSize}`);
      console.log(`Max Waiting Connections: ${maxWaiting}`);
      console.log(`Avg Idle Connections: ${avgIdle.toFixed(1)}`);
      console.log(`Pool Saturation: ${maxWaiting > 0 ? '⚠️  Detected' : '✅ None'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('MEMORY USAGE TRENDS');
    console.log('='.repeat(80));
    
    if (metricsSnapshots.length > 0) {
      const firstMemory = metricsSnapshots[0].memory.heapUsedMB;
      const lastMemory = metricsSnapshots[metricsSnapshots.length - 1].memory.heapUsedMB;
      const maxMemory = Math.max(...metricsSnapshots.map(m => m.memory.heapUsedMB));
      const memoryGrowth = lastMemory - firstMemory;
      
      console.log(`Starting Heap: ${firstMemory.toFixed(1)} MB`);
      console.log(`Ending Heap: ${lastMemory.toFixed(1)} MB`);
      console.log(`Peak Heap: ${maxMemory.toFixed(1)} MB`);
      console.log(`Growth: ${memoryGrowth > 0 ? '+' : ''}${memoryGrowth.toFixed(1)} MB`);
      console.log(`Memory Pressure: ${maxMemory > 400 ? '⚠️  High' : '✅ Normal'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('BOTTLENECKS IDENTIFIED');
    console.log('='.repeat(80));
    
    const bottlenecks = identifyBottlenecks(results);
    if (bottlenecks.length === 0) {
      console.log('✅ No critical bottlenecks detected');
    } else {
      for (const b of bottlenecks) {
        console.log(b);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('RECOMMENDATIONS');
    console.log('='.repeat(80));
    
    const recommendations = generateRecommendations(results, metricsSnapshots);
    for (const r of recommendations) {
      console.log(r);
    }

    console.log('\n' + '='.repeat(80));
    console.log('SLOW QUERIES (if any)');
    console.log('='.repeat(80));
    
    if (finalMetrics && finalMetrics.slowQueries && finalMetrics.slowQueries.length > 0) {
      for (const sq of finalMetrics.slowQueries.slice(-10)) {
        console.log(`  ${sq.endpoint}: ${sq.duration}ms at ${sq.timestamp}`);
      }
    } else {
      console.log('No slow queries recorded (threshold: 200ms)');
    }

    console.log('\n\n🏁 Load testing complete!');
    console.log(`Total tests run: ${results.length}`);
    console.log(`Total requests: ${results.reduce((sum, r) => sum + r.requests.total, 0)}`);

  } catch (error) {
    console.error('\n❌ Load test failed:', error);
    process.exit(1);
  }
}

runLoadTestSuite();
