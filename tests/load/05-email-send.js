#!/usr/bin/env node
/**
 * Load Test: Email Queue Add
 * 
 * Tests: Email queue throughput (adding emails to queue)
 * Endpoint: POST /api/email-queue (add email to queue)
 * 
 * NOTE: Email processing happens via background worker/polling,
 * not via API trigger. This test measures queue addition rate.
 * 
 * Hard limits from code review:
 * - Batch fetch size: 50 emails per poll
 * - Daily automation limit: 5000 (medium preset)
 * - Delay between emails: 10s (medium preset)
 * - Dedup checks: 3 queries per email
 * 
 * ALTERNATIVE: Test via automation runs which queue emails
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';
const TEST_SEQUENCE_ID = process.env.TEST_SEQUENCE_ID || '';
const TEST_PROSPECT_ID = process.env.TEST_PROSPECT_ID || '';

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 30,
    description: 'Baseline: 1 concurrent email queue add'
  },
  medium: { 
    concurrency: 5, 
    duration: 60,
    description: 'Medium: 5 concurrent queue additions'
  },
  stress: { 
    concurrency: 10, 
    duration: 60,
    description: 'Stress: 10 concurrent queue additions'
  },
  breakpoint: { 
    concurrency: 25, 
    duration: 120,
    description: 'Breakpoint: 25 concurrent queue additions'
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
  console.log(`   Note: Email processing is background (BullMQ/polling)`);
  console.log(`   This tests email queue ADD throughput\n`);
  
  if (!TEST_SEQUENCE_ID || !TEST_PROSPECT_ID) {
    console.error('❌ Required env vars not set:');
    console.error('   TEST_SEQUENCE_ID=your-sequence-uuid');
    console.error('   TEST_PROSPECT_ID=your-prospect-uuid');
    console.error('\n   To get these IDs:');
    console.error('   1. Create a sequence in the app');
    console.error('   2. Import some prospects');
    console.error('   3. Copy their UUIDs from the database or API responses');
    process.exit(1);
  }

  const instance = autocannon({
    url: `${BASE_URL}/api/email-queue`,
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    headers: {
      'Content-Type': 'application/json',
      'Cookie': AUTH_COOKIE
    },
    requests: [{
      method: 'POST',
      setupRequest: (req) => {
        counter++;
        req.body = JSON.stringify({
          sequenceId: TEST_SEQUENCE_ID,
          prospectId: TEST_PROSPECT_ID,
          subject: `Load Test Email ${counter}`,
          body: `This is load test email number ${counter}`,
          stepOrder: counter % 5 + 1 // Vary step order to test dedup
        });
        return req;
      }
    }],
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200 || statusCode === 202) {
          process.stdout.write('.');
        } else if (statusCode === 429) {
          process.stdout.write('R'); // Rate limited
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
    
    const emailsPerMinute = result.requests.average * 60;
    const emailsPer30s = result.requests.average * 30;
    
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
    console.log(`\n  📧 Email Capacity Estimates:`);
    console.log(`     Queue triggers/min: ${emailsPerMinute.toFixed(0)}`);
    console.log(`     Queue triggers/30s: ${emailsPer30s.toFixed(0)}`);
    console.log(`     Actual email rate:  Governed by delayBetweenEmailsMs (10s)`);
    
    // Pass criteria: p95 < 2s (queue trigger should be fast), errors < 5%
    const errorRate = result.errors / result.requests.total;
    const passed = result.latency.p95 < 2000 && errorRate < 0.05;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 2s, error rate < 5%`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
