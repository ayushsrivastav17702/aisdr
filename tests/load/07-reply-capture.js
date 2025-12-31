#!/usr/bin/env node
/**
 * Load Test: Reply/Inbox APIs
 * 
 * Tests: Reply listing and inbox query performance under load
 * Endpoint: GET /api/replies (list replies)
 * 
 * NOTE: Reply ingestion happens via background IMAP polling (reply-detection.service.ts),
 * not via API. This test measures reply LISTING/QUERY performance instead.
 * 
 * Hard limits from code review:
 * - Poll interval: 20 seconds (background)
 * - Sequential mailbox processing (background risk)
 * - IMAP connection per mailbox per poll (background)
 * 
 * What this test measures:
 * - Reply list query performance
 * - Database read load for reply data
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 30,
    description: 'Baseline: 1 concurrent reply list query'
  },
  medium: { 
    concurrency: 10, 
    duration: 60,
    description: 'Medium: 10 concurrent (multiple users checking inbox)'
  },
  stress: { 
    concurrency: 25, 
    duration: 60,
    description: 'Stress: 25 concurrent inbox checks'
  },
  breakpoint: { 
    concurrency: 50, 
    duration: 120,
    description: 'Breakpoint: 50 concurrent (heavy inbox load)'
  }
};

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);
  console.log(`   Note: IMAP polling is background process (20s interval)`);
  console.log(`   This test measures reply LIST query performance\n`);

  const instance = autocannon({
    url: `${BASE_URL}/api/replies?limit=50`, // List replies endpoint
    method: 'GET',
    connections: config.concurrency,
    duration: config.duration,
    timeout: 30,
    headers: {
      'Cookie': AUTH_COOKIE
    },
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200) {
          process.stdout.write('.');
        } else if (statusCode === 429) {
          process.stdout.write('B'); // Blocked by isProcessing
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
    
    const queriesPer30s = result.requests.average * 30;
    
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
    console.log(`\n  📬 Reply Query Capacity:`);
    console.log(`     List queries/30s:   ${queriesPer30s.toFixed(0)}`);
    console.log(`     Background poll:    Every 20s (sequential mailboxes)`);
    
    // Pass criteria: p95 < 2s for list queries, low error rate
    const errorRate = result.errors / result.requests.total;
    const passed = result.latency.p95 < 2000 && errorRate < 0.05;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 2s, error rate < 5%`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
