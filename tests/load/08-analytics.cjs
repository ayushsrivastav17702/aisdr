#!/usr/bin/env node
/**
 * Load Test: Analytics Dashboard
 * 
 * Tests: Dashboard aggregation under load
 * Endpoint: GET /api/analytics/dashboard
 * 
 * Note: Analytics queries can be expensive with large datasets
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 30,
    description: 'Baseline: 1 concurrent dashboard load'
  },
  medium: { 
    concurrency: 10, 
    duration: 60,
    description: 'Medium: 10 concurrent (multiple users)'
  },
  stress: { 
    concurrency: 25, 
    duration: 60,
    description: 'Stress: 25 concurrent dashboard requests'
  },
  breakpoint: { 
    concurrency: 50, 
    duration: 120,
    description: 'Breakpoint: 50 concurrent (heavy load)'
  }
};

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);

  const instance = autocannon({
    url: `${BASE_URL}/api/analytics/overview`, // Correct endpoint from analytics.routes.ts
    method: 'GET',
    connections: config.concurrency,
    duration: config.duration,
    headers: {
      'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : undefined, 'Cookie': AUTH_COOKIE
    },
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200) {
          process.stdout.write('.');
        } else if (statusCode >= 400) {
          process.stdout.write('X');
        }
      });
    }
  }, (err, result) => {
    if (err) {
      console.error('Error:', err);
      process.exit(1);
    }
    
    console.log('\n\n📈 Results:\n');
    console.log(`  Requests/sec:     ${result.requests.average.toFixed(2)}`);
    console.log(`  Latency p50:      ${result.latency.p50}ms`);
    console.log(`  Latency p95:      ${result.latency.p95}ms`);
    console.log(`  Latency p99:      ${result.latency.p99}ms`);
    console.log(`  Errors:           ${result.errors}`);
    console.log(`  Timeouts:         ${result.timeouts}`);
    console.log(`  2xx responses:    ${result['2xx']}`);
    console.log(`  Non-2xx:          ${result.non2xx}`);
    console.log(`  Total requests:   ${result.requests.total}`);
    console.log(`  Throughput:       ${(result.throughput.average / 1024).toFixed(2)} KB/s`);
    
    // Pass criteria: p95 < 3s, 0 errors (dashboard should be responsive)
    const passed = result.latency.p95 < 3000 && result.errors === 0;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 3s, 0 errors`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
