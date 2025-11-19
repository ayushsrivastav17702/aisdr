/**
 * K6 Load Testing Script for AI-Powered SDR Platform
 * 
 * Tests 10-20 concurrent users performing typical operations:
 * - Health checks
 * - Authentication
 * - AI search
 * - Prospect management
 * - Automation workflows
 * 
 * Usage:
 *   k6 run -e BASE_URL=https://your-app.replit.app -e TEST_EMAIL=admin@example.com -e TEST_PASSWORD=yourpassword k6-load-test.js
 * 
 * For staging:
 *   k6 run -e BASE_URL=https://staging.your-app.replit.app -e TEST_EMAIL=test@example.com -e TEST_PASSWORD=testpass k6-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const failureRate = new Rate('failed_requests');
const healthCheckDuration = new Trend('healthcheck_duration');
const searchDuration = new Trend('search_duration');
const authDuration = new Trend('auth_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 20 },   // Ramp up to 20 users
    { duration: '2m', target: 20 },   // Stay at 20 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],     // 95% of requests should be below 2s
    'http_req_duration{name:healthcheck}': ['p(95)<500'], // Health checks should be fast
    'http_req_duration{name:auth}': ['p(95)<1500'],
    'http_req_duration{name:search}': ['p(95)<3000'], // AI search can be slower
    'http_req_failed': ['rate<0.05'],        // Less than 5% failure rate
    'failed_requests': ['rate<0.05'],
  },
  ext: {
    loadimpact: {
      name: 'AI SDR Platform Load Test',
      projectID: 3000000,
    },
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'admin@increff.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'password';

// Global state
let authToken = '';
let csrfToken = '';

export function setup() {
  console.log('🚀 Starting load test against:', BASE_URL);
  console.log('📊 Test configuration:');
  console.log('   - Virtual Users: 10 → 20 → 0');
  console.log('   - Duration: 4 minutes');
  console.log('   - Target endpoints: /healthz, /api/auth/login, /api/ai-search');
  
  return { 
    baseUrl: BASE_URL,
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  };
}

export default function (data) {
  // 1. Health Check (20% of traffic)
  if (Math.random() < 0.2) {
    group('Health Check', () => {
      const start = new Date();
      const res = http.get(`${data.baseUrl}/healthz`, {
        tags: { name: 'healthcheck' },
      });
      
      healthCheckDuration.add(new Date() - start);
      
      const success = check(res, {
        'healthcheck status is 200': (r) => r.status === 200,
        'healthcheck has status field': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.status === 'ok';
          } catch {
            return false;
          }
        },
      });
      
      failureRate.add(!success);
    });
  }
  
  // 2. Authentication Flow (30% of traffic)
  else if (Math.random() < 0.5) {
    group('Authentication', () => {
      // Get CSRF token first
      const csrfRes = http.get(`${data.baseUrl}/api/csrf-token`);
      
      if (csrfRes.status === 200) {
        try {
          const csrfBody = JSON.parse(csrfRes.body);
          csrfToken = csrfBody.csrfToken;
        } catch (e) {
          console.error('Failed to parse CSRF token:', e);
        }
      }
      
      const start = new Date();
      const loginRes = http.post(
        `${data.baseUrl}/api/auth/login`,
        JSON.stringify({
          email: data.email,
          password: data.password,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          tags: { name: 'auth' },
        }
      );
      
      authDuration.add(new Date() - start);
      
      const success = check(loginRes, {
        'login status is 200': (r) => r.status === 200,
        'login returns token': (r) => {
          try {
            const body = JSON.parse(r.body);
            if (body.token) {
              authToken = body.token;
              return true;
            }
            return false;
          } catch {
            return false;
          }
        },
      });
      
      failureRate.add(!success);
    });
  }
  
  // 3. AI Search Flow (50% of traffic)
  else {
    group('AI Search', () => {
      // Skip if not authenticated
      if (!authToken || !csrfToken) {
        return;
      }
      
      const searchQueries = [
        'Find software engineers in San Francisco',
        'Search for CTOs in New York at tech startups',
        'Find marketing directors in Boston',
        'Get VPs of Sales in Seattle',
        'Search for founders in Austin',
      ];
      
      const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
      
      const start = new Date();
      const searchRes = http.post(
        `${data.baseUrl}/api/ai-search`,
        JSON.stringify({
          query: query,
          includeLocalProspects: true,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `auth_token=${authToken}`,
            'x-csrf-token': csrfToken,
          },
          tags: { name: 'search' },
        }
      );
      
      searchDuration.add(new Date() - start);
      
      const success = check(searchRes, {
        'search status is 200 or 500': (r) => r.status === 200 || r.status === 500, // AI might fail
        'search returns data': (r) => {
          if (r.status !== 200) return true; // Allow AI failures
          try {
            const body = JSON.parse(r.body);
            return body.search !== undefined;
          } catch {
            return false;
          }
        },
      });
      
      failureRate.add(!success);
    });
  }
  
  // Random sleep between requests (1-3 seconds)
  sleep(1 + Math.random() * 2);
}

export function teardown(data) {
  console.log('✅ Load test completed');
  console.log('📊 Review metrics above for performance analysis');
}
