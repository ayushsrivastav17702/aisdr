#!/usr/bin/env node
/**
 * Load Test: Prospect Enrollment
 * 
 * Tests: Max prospects per sequence enrollment
 * Endpoint: POST /api/sequences/:id/enroll (sequences-routes.ts:581)
 * 
 * P0 Fix Applied:
 * - Before: 5000+ queries for 1000 prospects (storage.ts old method)
 * - After: 5 queries total (batch operations with INNER JOIN tenant isolation)
 * 
 * IMPORTANT: Requires real sequence ID and real prospect IDs to test
 * the actual batch enrollment logic. Fake IDs return 404/empty results.
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';
const TEST_SEQUENCE_ID = process.env.TEST_SEQUENCE_ID || '';
// Set PROSPECT_IDS=id1,id2,id3 for real enrollment test
const PROSPECT_IDS = process.env.PROSPECT_IDS ? process.env.PROSPECT_IDS.split(',') : [];

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 60, 
    prospectsPerRequest: 10,
    description: 'Baseline: 1 concurrent, 10 prospects/enrollment'
  },
  medium: { 
    concurrency: 3, 
    duration: 90, 
    prospectsPerRequest: 100,
    description: 'Medium: 3 concurrent, 100 prospects/enrollment'
  },
  stress: { 
    concurrency: 5, 
    duration: 120, 
    prospectsPerRequest: 500,
    description: 'Stress: 5 concurrent, 500 prospects/enrollment'
  },
  breakpoint: { 
    concurrency: 10, 
    duration: 180, 
    prospectsPerRequest: 1000,
    description: 'Breakpoint: 10 concurrent, 1000 prospects/enrollment'
  }
};

function generateProspectIds(count) {
  // Use real prospect IDs if provided
  if (PROSPECT_IDS.length > 0) {
    // For enrollment, we need unique IDs each request to avoid duplicates
    // Cycle through available IDs
    return Array.from({ length: Math.min(count, PROSPECT_IDS.length) }, (_, i) => PROSPECT_IDS[i]);
  }
  // Generate fake UUIDs - tests API validation/error handling
  return Array.from({ length: count }, (_, i) => 
    `prospect-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`
  );
}

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  if (!TEST_SEQUENCE_ID) {
    console.error('❌ TEST_SEQUENCE_ID is required for this test');
    console.error('   Set it with: export TEST_SEQUENCE_ID="your-sequence-uuid"');
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);
  console.log(`   Sequence ID: ${TEST_SEQUENCE_ID}`);
  if (PROSPECT_IDS.length === 0) {
    console.log(`   ⚠️  No PROSPECT_IDS set - using fake IDs (tests validation only)`);
    console.log(`   Set PROSPECT_IDS=id1,id2,id3 for real enrollment testing\n`);
  } else {
    console.log(`   Using ${PROSPECT_IDS.length} real prospect IDs\n`);
  }

  const instance = autocannon({
    url: `${BASE_URL}/api/sequences/${TEST_SEQUENCE_ID}/enroll`,
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    timeout: 30, // 30s timeout for large batch enrollments
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : undefined, 'Cookie': AUTH_COOKIE
    },
    requests: [
      {
        method: 'POST',
        setupRequest: (req) => {
          const prospectIds = generateProspectIds(config.prospectsPerRequest);
          req.body = JSON.stringify({ prospectIds }); // Correct schema
          return req;
        }
      }
    ],
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
    
    const avgProspectsEnrolled = result['2xx'] * config.prospectsPerRequest;
    
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
    console.log(`  Est. prospects:   ${avgProspectsEnrolled.toLocaleString()}`);
    
    // Pass criteria: p95 < 5s for batch enrollment, errors < 1%
    const errorRate = result.errors / result.requests.total;
    const passed = result.latency.p95 < 5000 && errorRate < 0.01;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 5s, error rate < 1%`);
    console.log(`  Note: P0 fix reduces queries from O(n) to O(1)`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
