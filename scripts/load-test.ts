import http from 'http';

interface TestResult {
  endpoint: string;
  concurrentUsers: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  requestsPerSecond: number;
  totalDuration: number;
}

interface RequestResult {
  success: boolean;
  responseTime: number;
  statusCode: number;
}

async function makeRequest(options: http.RequestOptions, body?: string): Promise<RequestResult> {
  const start = Date.now();
  
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          success: res.statusCode! >= 200 && res.statusCode! < 400,
          responseTime: Date.now() - start,
          statusCode: res.statusCode!
        });
      });
    });

    req.on('error', () => {
      resolve({
        success: false,
        responseTime: Date.now() - start,
        statusCode: 0
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        success: false,
        responseTime: Date.now() - start,
        statusCode: 0
      });
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function runConcurrentTest(
  endpoint: string,
  method: string,
  concurrentUsers: number,
  requestsPerUser: number,
  body?: object,
  headers?: Record<string, string>
): Promise<TestResult> {
  console.log(`\n🚀 Testing ${method} ${endpoint}`);
  console.log(`   Concurrent users: ${concurrentUsers}`);
  console.log(`   Requests per user: ${requestsPerUser}`);
  console.log(`   Total requests: ${concurrentUsers * requestsPerUser}`);
  
  const results: RequestResult[] = [];
  const startTime = Date.now();

  const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
    for (let i = 0; i < requestsPerUser; i++) {
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: 5000,
        path: endpoint,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      const result = await makeRequest(options, body ? JSON.stringify(body) : undefined);
      results.push(result);
    }
  });

  await Promise.all(userPromises);
  
  const totalDuration = Date.now() - startTime;
  const successfulRequests = results.filter(r => r.success).length;
  const responseTimes = results.map(r => r.responseTime);
  
  return {
    endpoint,
    concurrentUsers,
    totalRequests: results.length,
    successfulRequests,
    failedRequests: results.length - successfulRequests,
    avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    requestsPerSecond: Math.round((results.length / totalDuration) * 1000 * 100) / 100,
    totalDuration
  };
}

function printResult(result: TestResult) {
  const successRate = ((result.successfulRequests / result.totalRequests) * 100).toFixed(1);
  
  console.log(`\n📊 Results for ${result.endpoint}:`);
  console.log(`   ├─ Success Rate: ${successRate}% (${result.successfulRequests}/${result.totalRequests})`);
  console.log(`   ├─ Avg Response: ${result.avgResponseTime}ms`);
  console.log(`   ├─ Min Response: ${result.minResponseTime}ms`);
  console.log(`   ├─ Max Response: ${result.maxResponseTime}ms`);
  console.log(`   ├─ Requests/sec: ${result.requestsPerSecond}`);
  console.log(`   └─ Total Duration: ${result.totalDuration}ms`);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('          AISDR Concurrent User Load Test');
  console.log('═══════════════════════════════════════════════════════════');

  const concurrentLevels = [10, 25, 50, 100];
  const requestsPerUser = 5;

  const testEndpoints = [
    { path: '/api/auth/config', method: 'GET' },
    { path: '/healthz', method: 'GET' },
  ];

  const allResults: TestResult[] = [];

  for (const endpoint of testEndpoints) {
    for (const users of concurrentLevels) {
      const result = await runConcurrentTest(
        endpoint.path,
        endpoint.method,
        users,
        requestsPerUser
      );
      printResult(result);
      allResults.push(result);
      
      // Brief pause between tests
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  
  console.log('\n| Endpoint | Users | Success Rate | Avg (ms) | RPS |');
  console.log('|----------|-------|--------------|----------|-----|');
  
  for (const r of allResults) {
    const successRate = ((r.successfulRequests / r.totalRequests) * 100).toFixed(0);
    console.log(`| ${r.endpoint.padEnd(8)} | ${String(r.concurrentUsers).padEnd(5)} | ${successRate.padStart(11)}% | ${String(r.avgResponseTime).padStart(8)} | ${String(r.requestsPerSecond).padStart(3)} |`);
  }

  console.log('\n✅ Load test complete!');
}

main().catch(console.error);
