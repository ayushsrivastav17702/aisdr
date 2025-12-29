import { db } from '../db';
import { users, sequences, emailQueue, emailReplies, prospects, emailMailboxes } from '@shared/schema';
import { eq, and, count, sql, isNull, inArray, gte } from 'drizzle-orm';
import { getPoolStats } from '../db';

interface LoadTestResult {
  endpoint: string;
  concurrent: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  dbQueries: number;
  cacheHits: number;
}

async function getTeamMemberIds(organizationId: string): Promise<string[]> {
  const teamMembers = await db.select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt)
    ));
  return teamMembers.map(m => m.id);
}

async function simulateStatsEndpoint(orgId: string): Promise<number> {
  const start = performance.now();
  
  const [memberIds, userCounts] = await Promise.all([
    getTeamMemberIds(orgId),
    db.select({
      totalUsers: count(),
      activeUsers: sql<number>`count(*) filter (where ${users.isActive} = true)`,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, orgId),
      isNull(users.deletedAt)
    ))
    .then(r => r[0])
  ]);

  if (memberIds.length > 0) {
    await Promise.all([
      db.select({ sent: count() })
        .from(emailQueue)
        .where(and(
          inArray(emailQueue.userId, memberIds),
          eq(emailQueue.status, 'sent')
        )),
      
      db.select({ active: count() })
        .from(sequences)
        .where(and(
          inArray(sequences.userId, memberIds),
          eq(sequences.status, 'active')
        )),
      
      db.select({
        total: count(),
        positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
      })
      .from(emailReplies)
      .innerJoin(sequences, eq(emailReplies.sequenceId, sequences.id))
      .where(inArray(sequences.userId, memberIds))
    ]);
  }

  return performance.now() - start;
}

async function simulateCampaignsEndpointOptimized(orgId: string, limit = 20): Promise<number> {
  const start = performance.now();
  
  const campaignList = await db.select({
    id: sequences.id,
    name: sequences.name,
    status: sequences.status,
    userId: sequences.userId,
    totalProspects: sequences.totalProspects,
    ownerEmail: users.email,
  })
  .from(sequences)
  .innerJoin(users, eq(sequences.userId, users.id))
  .where(and(
    eq(users.organizationId, orgId),
    isNull(users.deletedAt)
  ))
  .orderBy(sql`${sequences.createdAt} desc`)
  .limit(limit);

  const campaignIds = campaignList.map(c => c.id);
  
  if (campaignIds.length > 0) {
    await Promise.all([
      db.select({
        sequenceId: emailQueue.sequenceId,
        sentCount: count(),
      })
      .from(emailQueue)
      .where(and(
        inArray(emailQueue.sequenceId, campaignIds),
        eq(emailQueue.status, 'sent')
      ))
      .groupBy(emailQueue.sequenceId),
      
      db.select({
        sequenceId: emailReplies.sequenceId,
        replyCount: count(),
      })
      .from(emailReplies)
      .where(inArray(emailReplies.sequenceId, campaignIds))
      .groupBy(emailReplies.sequenceId)
    ]);
  }

  return performance.now() - start;
}

async function simulateTeamEndpoint(orgId: string, limit = 50): Promise<number> {
  const start = performance.now();
  
  await Promise.all([
    db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      status: users.status,
      isActive: users.isActive,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(
      eq(users.organizationId, orgId),
      isNull(users.deletedAt)
    ))
    .orderBy(sql`${users.createdAt} desc`)
    .limit(limit),
    
    db.select({ total: count() })
      .from(users)
      .where(and(
        eq(users.organizationId, orgId),
        isNull(users.deletedAt)
      ))
  ]);

  return performance.now() - start;
}

async function simulateAnalyticsEndpoint(orgId: string): Promise<number> {
  const start = performance.now();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const memberIds = await getTeamMemberIds(orgId);

  if (memberIds.length > 0) {
    await Promise.all([
      db.select({ sent: count() })
        .from(emailQueue)
        .where(and(
          inArray(emailQueue.userId, memberIds),
          eq(emailQueue.status, 'sent'),
          gte(emailQueue.sentAt, startDate)
        )),
      
      db.select({
        status: sequences.status,
        count: count(),
      })
      .from(sequences)
      .where(inArray(sequences.userId, memberIds))
      .groupBy(sequences.status),
      
      db.select({
        userId: users.id,
        emailsSent: sql<number>`count(${emailQueue.id}) filter (where ${emailQueue.status} = 'sent')`,
      })
      .from(users)
      .leftJoin(emailQueue, and(
        eq(users.id, emailQueue.userId),
        gte(emailQueue.sentAt, startDate)
      ))
      .where(and(
        eq(users.organizationId, orgId),
        isNull(users.deletedAt)
      ))
      .groupBy(users.id)
      .limit(5),
      
      db.select({
        total: count(),
        positive: sql<number>`count(*) filter (where ${emailReplies.sentiment} = 'positive')`,
      })
      .from(emailReplies)
      .innerJoin(sequences, eq(emailReplies.sequenceId, sequences.id))
      .where(and(
        inArray(sequences.userId, memberIds),
        gte(emailReplies.receivedAt, startDate)
      ))
    ]);
  }

  return performance.now() - start;
}

function calculatePercentile(sortedLatencies: number[], percentile: number): number {
  if (sortedLatencies.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedLatencies.length) - 1;
  return sortedLatencies[Math.max(0, index)];
}

async function runConcurrentLoad(
  endpointFn: (orgId: string) => Promise<number>,
  endpointName: string,
  orgId: string,
  concurrent: number,
  iterations: number
): Promise<LoadTestResult> {
  const latencies: number[] = [];
  let successCount = 0;
  let errorCount = 0;

  console.log(`\n📊 Testing ${endpointName} with ${concurrent} concurrent, ${iterations} iterations...`);

  for (let iter = 0; iter < iterations; iter++) {
    const batch = Array(concurrent).fill(null).map(async () => {
      try {
        const latency = await endpointFn(orgId);
        latencies.push(latency);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    });
    
    await Promise.all(batch);
  }

  latencies.sort((a, b) => a - b);

  return {
    endpoint: endpointName,
    concurrent,
    totalRequests: successCount + errorCount,
    successCount,
    errorCount,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p95Latency: calculatePercentile(latencies, 95),
    p99Latency: calculatePercentile(latencies, 99),
    minLatency: latencies[0] || 0,
    maxLatency: latencies[latencies.length - 1] || 0,
    dbQueries: 0,
    cacheHits: 0,
  };
}

async function runLoadSimulation() {
  console.log('🚀 Manager Role Load Simulation');
  console.log('================================\n');
  
  const orgs = await db.select({ id: users.organizationId })
    .from(users)
    .where(and(
      isNull(users.deletedAt),
      sql`${users.organizationId} IS NOT NULL`
    ))
    .limit(1);
  
  if (orgs.length === 0 || !orgs[0].id) {
    console.log('⚠️  No organizations found with non-null organizationId.');
    console.log('Please run the simulation after creating test data.');
    return;
  }

  const testOrgId = orgs[0].id;
  console.log(`Using organization: ${testOrgId}`);
  
  const poolBefore = getPoolStats();
  console.log(`\n📈 Pool Stats Before: ${JSON.stringify(poolBefore)}`);

  const results: LoadTestResult[] = [];

  results.push(await runConcurrentLoad(
    simulateStatsEndpoint,
    '/api/manager/stats',
    testOrgId,
    100,
    5
  ));

  results.push(await runConcurrentLoad(
    simulateCampaignsEndpointOptimized,
    '/api/manager/campaigns',
    testOrgId,
    100,
    5
  ));

  results.push(await runConcurrentLoad(
    simulateTeamEndpoint,
    '/api/manager/team',
    testOrgId,
    100,
    5
  ));

  results.push(await runConcurrentLoad(
    simulateAnalyticsEndpoint,
    '/api/manager/analytics',
    testOrgId,
    50,
    5
  ));

  const poolAfter = getPoolStats();
  
  console.log('\n\n📊 LOAD SIMULATION RESULTS');
  console.log('===========================\n');
  
  console.log('| Endpoint | Concurrent | Total | Success | Errors | Avg(ms) | p95(ms) | p99(ms) | Max(ms) |');
  console.log('|----------|------------|-------|---------|--------|---------|---------|---------|---------|');
  
  for (const r of results) {
    console.log(`| ${r.endpoint.padEnd(25)} | ${r.concurrent.toString().padStart(10)} | ${r.totalRequests.toString().padStart(5)} | ${r.successCount.toString().padStart(7)} | ${r.errorCount.toString().padStart(6)} | ${r.avgLatency.toFixed(1).padStart(7)} | ${r.p95Latency.toFixed(1).padStart(7)} | ${r.p99Latency.toFixed(1).padStart(7)} | ${r.maxLatency.toFixed(1).padStart(7)} |`);
  }

  console.log(`\n📈 Pool Stats After: ${JSON.stringify(poolAfter)}`);
  
  const passedTests = results.filter(r => r.p95Latency < 2000 && r.errorCount === 0);
  console.log(`\n✅ Tests Passed: ${passedTests.length}/${results.length}`);
  
  if (passedTests.length === results.length) {
    console.log('🎉 All tests passed! Manager endpoints are performing within acceptable limits.');
  } else {
    console.log('⚠️  Some tests exceeded p95 < 2s threshold or had errors.');
  }

  process.exit(0);
}

runLoadSimulation().catch(console.error);
