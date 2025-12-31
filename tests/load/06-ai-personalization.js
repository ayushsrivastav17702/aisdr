#!/usr/bin/env node
/**
 * Load Test: AI Personalization Pipeline
 * 
 * Tests: Full flow (research → mapping → email generation)
 * Endpoint: POST /api/ai/personalize
 * 
 * Hard limits from code review:
 * - AI timeout: 30s
 * - Concurrent AI requests: 10 (medium preset)
 * - Fallback chain: OpenAI → OpenRouter → Anthropic
 * - No request throttling (risk identified)
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const AUTH_COOKIE = process.env.AUTH_COOKIE || '';

const CONFIGS = {
  baseline: { 
    concurrency: 1, 
    duration: 60, // Longer due to AI latency
    description: 'Baseline: 1 concurrent AI personalization'
  },
  medium: { 
    concurrency: 5, 
    duration: 120,
    description: 'Medium: 5 concurrent (tests AI throttling)'
  },
  stress: { 
    concurrency: 10, 
    duration: 120,
    description: 'Stress: 10 concurrent (matches config limit)'
  },
  breakpoint: { 
    concurrency: 25, 
    duration: 180,
    description: 'Breakpoint: 25 concurrent (exceeds throttling)'
  }
};

function generatePersonalizationRequest() {
  const unique = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    prospectId: `prospect-${unique}`,
    prospectData: {
      firstName: 'John',
      lastName: 'Doe',
      email: `john.doe.${unique}@testcorp.com`,
      company: 'TestCorp Inc',
      title: 'VP of Engineering',
      industry: 'Technology',
      linkedinUrl: `https://linkedin.com/in/johndoe${unique}`
    },
    sequenceId: 'test-sequence-id',
    stepTemplate: {
      subject: 'Quick question about {{company}}',
      body: 'Hi {{firstName}},\n\nI noticed {{company}} is doing interesting work in {{industry}}...'
    }
  };
}

async function runTest(configName = 'baseline') {
  const config = CONFIGS[configName];
  if (!config) {
    console.error(`Unknown config: ${configName}. Options: ${Object.keys(CONFIGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n📊 Running: ${config.description}\n`);
  console.log(`   ⚠️  Warning: This test makes real AI API calls`);
  console.log(`   Expected latency: 2-30s per request (AI processing)\n`);

  const instance = autocannon({
    url: `${BASE_URL}/api/ai/personalize`,
    method: 'POST',
    connections: config.concurrency,
    duration: config.duration,
    timeout: 60, // 60s timeout for AI calls
    headers: {
      'Content-Type': 'application/json',
      'Cookie': AUTH_COOKIE
    },
    requests: [
      {
        method: 'POST',
        setupRequest: (req) => {
          req.body = JSON.stringify(generatePersonalizationRequest());
          return req;
        }
      }
    ],
    setupClient: (client) => {
      client.on('response', (statusCode) => {
        if (statusCode === 200) {
          process.stdout.write('.');
        } else if (statusCode === 429) {
          process.stdout.write('R'); // Rate limited
        } else if (statusCode === 504) {
          process.stdout.write('T'); // Timeout
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
    console.log(`  Latency max:      ${result.latency.max}ms`);
    console.log(`  Errors:           ${result.errors}`);
    console.log(`  Timeouts:         ${result.timeouts}`);
    console.log(`  2xx responses:    ${result['2xx']}`);
    console.log(`  Non-2xx:          ${result.non2xx}`);
    console.log(`  Total requests:   ${result.requests.total}`);
    
    // Pass criteria: p95 < 30s (AI timeout), success rate > 80%
    const successRate = result['2xx'] / result.requests.total;
    const passed = result.latency.p95 < 30000 && successRate > 0.8;
    console.log(`\n  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Criteria: p95 < 30s, success rate > 80%`);
    console.log(`  Success rate: ${(successRate * 100).toFixed(1)}%`);
  });

  autocannon.track(instance);
}

const configArg = process.argv[2] || 'baseline';
runTest(configArg);
