#!/usr/bin/env node
/**
 * Load Test: Sequence Creation
 * 
 * Tests: How many sequences can be created per user
 * Endpoint: POST /api/sequences
 * 
 * Hard limits from code review:
 * - No explicit limit on sequences per user
 * - AI-generated sequences have 30s timeout
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 30,
    description: 'Baseline: 1 concurrent sequence creation'
  },
  medium: { 
    concurrency: 5, 
    duration: 60,
    description: 'Medium: 5 concurrent sequence creations'
  },
  stress: { 
    concurrency: 10, 
    duration: 60,
    description: 'Stress: 10 concurrent sequence creations'
  },
  breakpoint: { 
    concurrency: 25, 
    duration: 120,
    description: 'Breakpoint: 25 concurrent sequence creations'
  }
};

let counter = 0;

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);

  const instance = autocannon({
    url: `${BASE_URL}/api/sequences`,
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': AUTH_COOKIE
    },
    requests: [
      {
        method: 'POST',
        setupRequest: (req) => {
          counter++;
          req.body = JSON.stringify({
            name: `Load Test Sequence ${Date.now()}-${counter}`,
            description: 'Created by autocannon load test',
            type: 'outbound'
          });
          return req;
        }
      }
    ],
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200 || statusCode === 201) {
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
    console.log(`  Sequences created: ${result['2xx']}`);
    
    // Pass criteria: p95 < 1s, 0 errors (simple DB insert)
    const passed = result.latency.p95 < 1000 && result.errors === 0;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 1s, 0 errors`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
