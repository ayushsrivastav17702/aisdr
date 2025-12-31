#!/usr/bin/env node
/**
 * Load Test: AI Enrichment
 * 
 * Tests: How many prospects can be enriched concurrently
 * Endpoint: POST /api/enrich (actual route from server/routes.ts:827)
 * 
 * Hard limits from code review:
 * - BullMQ workers: 3 concurrent
 * - Batch size: 10 prospects (but API accepts up to 50)
 * - Rate limit delay: 200ms between prospects
 * 
 * NOTE: This endpoint queues jobs via BullMQ if Redis available,
 * otherwise processes synchronously. Response time varies significantly.
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';
// Use real prospect IDs for meaningful test - set via env
const PROSPECT_IDS = process.env.PROSPECT_IDS ? process.env.PROSPECT_IDS.split(',') : [];

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 60, // Longer - enrichment is slow
    batchSize: 5,
    description: 'Baseline: 1 concurrent, 5 prospects/batch'
  },
  medium: { 
    concurrency: 3, 
    duration: 120,
    batchSize: 10,
    description: 'Medium: 3 concurrent (matches worker limit), 10 prospects/batch'
  },
  stress: { 
    concurrency: 5, 
    duration: 120,
    batchSize: 20,
    description: 'Stress: 5 concurrent (exceeds workers), 20 prospects/batch'
  },
  breakpoint: { 
    concurrency: 10, 
    duration: 180,
    batchSize: 50,
    description: 'Breakpoint: 10 concurrent, 50 prospects (max allowed)'
  }
};

function generateProspectIds(count) {
  // If real IDs provided, use those (cycling through if needed)
  if (PROSPECT_IDS.length > 0) {
    return Array.from({ length: count }, (_, i) => PROSPECT_IDS[i % PROSPECT_IDS.length]);
  }
  // Otherwise generate fake UUIDs - will return 404 but tests API throughput
  return Array.from({ length: count }, (_, i) => 
    `test-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`
  );
}

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);
  if (PROSPECT_IDS.length === 0) {
    console.log(`   ⚠️  No PROSPECT_IDS set - using fake IDs (tests throughput only)`);
    console.log(`   Set PROSPECT_IDS=id1,id2,id3 for real enrichment testing\n`);
  }
  
  const prospectIds = generateProspectIds(config.batchSize);

  const instance = autocannon({
    url: `${BASE_URL}/api/enrich`, // Correct endpoint
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    timeout: 60, // 60s timeout for enrichment
    headers: {
      'Content-Type': 'application/json',
      'Cookie': AUTH_COOKIE
    },
    body: JSON.stringify({ prospectIds }), // Schema from enrichmentRequestSchema
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200 || statusCode === 202) {
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
    
    // Expected: Enrichment is slow due to API calls
    // Pass criteria: p95 < 30s (matches AI timeout), errors < 5%
    const errorRate = result.errors / result.requests.total;
    const passed = result.latency.p95 < 30000 && errorRate < 0.05;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 30s, error rate < 5%`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
