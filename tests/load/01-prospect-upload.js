#!/usr/bin/env node
/**
 * Load Test: Prospect Upload (CSV Import)
 * 
 * Tests: How many prospects per request can be uploaded
 * Endpoint: POST /api/prospects/import
 * 
 * Expected behavior with P0 fix:
 * - Returns HTTP 202 immediately
 * - Processing happens async via setImmediate
 */

const autocannon = require('autocannon');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

// Test configurations
const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 30, 
    prospectsPerFile: 100,
    description: 'Baseline: 1 concurrent, 100 prospects/file'
  },
  medium: { 
    concurrency: 5, 
    duration: 60, 
    prospectsPerFile: 500,
    description: 'Medium: 5 concurrent, 500 prospects/file'
  },
  stress: { 
    concurrency: 10, 
    duration: 60, 
    prospectsPerFile: 1000,
    description: 'Stress: 10 concurrent, 1000 prospects/file'
  },
  breakpoint: { 
    concurrency: 20, 
    duration: 120, 
    prospectsPerFile: 5000,
    description: 'Breakpoint: 20 concurrent, 5000 prospects/file'
  }
};

function generateCSV(count) {
  let csv = 'firstName,lastName,email,company,title\n';
  for (let i = 0; i < count; i++) {
    const unique = `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;
    csv += `Test${i},User${i},test${unique}@example.com,TestCorp${i},Manager\n`;
  }
  return csv;
}

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);
  
  const csvContent = generateCSV(config.prospectsPerFile);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);
  
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="test.csv"',
    'Content-Type: text/csv',
    '',
    csvContent,
    `--${boundary}`,
    'Content-Disposition: form-data; name="fieldMappings"',
    '',
    JSON.stringify({
      firstName: 'firstName',
      lastName: 'lastName', 
      email: 'email',
      company: 'company',
      title: 'title'
    }),
    `--${boundary}--`
  ].join('\r\n');

  const instance = autocannon({
    url: `${BASE_URL}/api/prospects/import`,
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Cookie': AUTH_COOKIE
    },
    body: body,
    setupClient: (client) => {
      client.on('response', (statusCode, resBytes, responseTime) => {
        if (statusCode === 202) {
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
    
    // Pass/Fail criteria
    const passed = result.latency.p95 < 5000 && result.errors === 0;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 5s, 0 errors`);
  });

  autocannon.track(instance);
}

// Run with config from CLI arg
const configArg = process.argv[2] || 'baseline';
runTest(configArg);
