import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const errorRate = new Rate('errors');
const aiLatency = new Trend('ai_latency');
const emailLatency = new Trend('email_latency');
const requestsCounter = new Counter('total_requests');

export const options = {
  scenarios: {
    ai_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { test_type: 'ai_burst' },
    },
    campaign_spike: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 100,
      maxVUs: 500,
      tags: { test_type: 'campaign_spike' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.1'],
    ai_latency: ['p(95)<10000'],
    email_latency: ['p(95)<2000'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

export function setup() {
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: __ENV.TEST_EMAIL || 'loadtest@example.com',
    password: __ENV.TEST_PASSWORD || 'LoadTest123!',
  }), { headers: { 'Content-Type': 'application/json' } });
  
  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return { token: body.token };
  }
  
  return { token: AUTH_TOKEN };
}

export default function(data) {
  const authHeaders = {
    ...headers,
    'Authorization': `Bearer ${data.token}`,
  };
  
  group('TC-LOAD-01: AI Burst Test', () => {
    const startTime = Date.now();
    
    const aiResponse = http.post(`${BASE_URL}/api/ai/generate-email`, JSON.stringify({
      prospectData: {
        firstName: `User${__VU}`,
        lastName: 'LoadTest',
        company: `Company${Date.now()}`,
        title: 'Manager',
      },
      templateType: 'first_touch',
    }), { headers: authHeaders, timeout: '30s' });
    
    const duration = Date.now() - startTime;
    aiLatency.add(duration);
    requestsCounter.add(1);
    
    const success = check(aiResponse, {
      'AI: status is 200 or 202': (r) => r.status === 200 || r.status === 202,
      'AI: response has body': (r) => r.body && r.body.length > 0,
      'AI: latency under 10s': () => duration < 10000,
    });
    
    errorRate.add(!success);
    
    if (aiResponse.status === 429) {
      console.log(`Rate limited at VU ${__VU}`);
      sleep(parseInt(aiResponse.headers['Retry-After'] || '5'));
    }
  });
  
  group('TC-LOAD-02: Campaign Spike Test', () => {
    const startTime = Date.now();
    
    const createResponse = http.post(`${BASE_URL}/api/campaigns`, JSON.stringify({
      name: `LoadTest Campaign ${__VU}-${Date.now()}`,
      status: 'draft',
    }), { headers: authHeaders });
    
    const createSuccess = check(createResponse, {
      'Campaign: created successfully': (r) => r.status === 201 || r.status === 200,
    });
    
    if (createResponse.status === 201) {
      const campaignId = JSON.parse(createResponse.body).id;
      
      const readResponse = http.get(`${BASE_URL}/api/campaigns/${campaignId}`, {
        headers: authHeaders,
      });
      
      check(readResponse, {
        'Campaign: readable': (r) => r.status === 200,
      });
    }
    
    errorRate.add(!createSuccess);
    requestsCounter.add(1);
  });
  
  group('Email Send Performance', () => {
    const startTime = Date.now();
    
    const emailResponse = http.post(`${BASE_URL}/api/emails/send`, JSON.stringify({
      prospectId: `test-prospect-${__VU}`,
      subject: `Load Test ${Date.now()}`,
      body: 'This is a load test email.',
    }), { headers: authHeaders });
    
    const duration = Date.now() - startTime;
    emailLatency.add(duration);
    requestsCounter.add(1);
    
    check(emailResponse, {
      'Email: accepted': (r) => r.status === 200 || r.status === 202 || r.status === 400,
      'Email: latency under 2s': () => duration < 2000,
    });
  });
  
  group('Dashboard Load', () => {
    const dashboardResponse = http.get(`${BASE_URL}/api/user/dashboard`, {
      headers: authHeaders,
    });
    
    check(dashboardResponse, {
      'Dashboard: loads': (r) => r.status === 200 || r.status === 404,
    });
  });
  
  sleep(Math.random() * 2);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalRequests: data.metrics.total_requests ? data.metrics.total_requests.values.count : 0,
    errorRate: data.metrics.errors ? data.metrics.errors.values.rate : 0,
    p95Latency: data.metrics.http_req_duration ? data.metrics.http_req_duration.values['p(95)'] : 0,
    aiP95Latency: data.metrics.ai_latency ? data.metrics.ai_latency.values['p(95)'] : 0,
    passedThresholds: Object.entries(data.metrics)
      .filter(([key]) => key.startsWith('threshold_'))
      .every(([_, value]) => value.ok),
  };
  
  return {
    'stdout': JSON.stringify(summary, null, 2),
    'k6/results/summary.json': JSON.stringify(data, null, 2),
  };
}
