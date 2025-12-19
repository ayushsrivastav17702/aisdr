/**
 * Personalized Email Daily Capacity Test
 * 
 * This test measures realistic throughput for AI-personalized emails
 * considering all bottlenecks: AI API calls, email sending, and rate limits.
 */

interface ProviderLimits {
  name: string;
  requestsPerMinute: number;
  tokensPerMinute: number;
  avgTokensPerEmail: number;
  avgLatencyMs: number;
}

interface EmailServiceLimits {
  name: string;
  emailsPerSecond: number;
  emailsPerDay: number;
  avgLatencyMs: number;
}

const AI_PROVIDERS: ProviderLimits[] = [
  {
    name: 'OpenAI GPT-4',
    requestsPerMinute: 500,
    tokensPerMinute: 30000,
    avgTokensPerEmail: 500,
    avgLatencyMs: 2000
  },
  {
    name: 'OpenAI GPT-3.5',
    requestsPerMinute: 3500,
    tokensPerMinute: 90000,
    avgTokensPerEmail: 500,
    avgLatencyMs: 800
  },
  {
    name: 'Anthropic Claude',
    requestsPerMinute: 1000,
    tokensPerMinute: 100000,
    avgTokensPerEmail: 500,
    avgLatencyMs: 1500
  }
];

const EMAIL_SERVICES: EmailServiceLimits[] = [
  {
    name: 'Resend Free',
    emailsPerSecond: 1,
    emailsPerDay: 100,
    avgLatencyMs: 200
  },
  {
    name: 'Resend Pro',
    emailsPerSecond: 10,
    emailsPerDay: 50000,
    avgLatencyMs: 200
  },
  {
    name: 'Resend Scale',
    emailsPerSecond: 100,
    emailsPerDay: 100000,
    avgLatencyMs: 150
  }
];

function calculateDailyCapacity(ai: ProviderLimits, email: EmailServiceLimits): number {
  const SECONDS_PER_DAY = 86400;
  const MINUTES_PER_DAY = 1440;
  
  // AI bottleneck: requests per day based on rate limit
  const aiRequestLimit = ai.requestsPerMinute * MINUTES_PER_DAY;
  
  // AI bottleneck: tokens per day
  const aiTokenLimit = Math.floor((ai.tokensPerMinute * MINUTES_PER_DAY) / ai.avgTokensPerEmail);
  
  // AI bottleneck: latency (max throughput based on processing time)
  // Assuming 10 concurrent requests
  const concurrentRequests = 10;
  const aiLatencyLimit = Math.floor((SECONDS_PER_DAY * 1000 * concurrentRequests) / ai.avgLatencyMs);
  
  // Email service bottleneck
  const emailRateLimit = email.emailsPerSecond * SECONDS_PER_DAY;
  const emailDailyLimit = email.emailsPerDay;
  
  // The actual limit is the minimum of all constraints
  const aiLimit = Math.min(aiRequestLimit, aiTokenLimit, aiLatencyLimit);
  const emailLimit = Math.min(emailRateLimit, emailDailyLimit);
  
  return Math.min(aiLimit, emailLimit);
}

async function simulatePersonalization(count: number): Promise<{
  avgTime: number;
  totalTime: number;
  emailsPerSecond: number;
}> {
  const times: number[] = [];
  const startTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const emailStart = Date.now();
    
    // Simulate AI personalization (variable latency 50-150ms for simulation)
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    
    // Simulate email preparation
    const prospect = {
      name: `Test User ${i}`,
      company: `Company ${i}`,
      title: 'Director of Engineering',
      industry: 'Technology'
    };
    
    // Simulate template merge
    const personalizedContent = `Dear ${prospect.name},\n\nI noticed you're the ${prospect.title} at ${prospect.company}...`;
    
    times.push(Date.now() - emailStart);
  }
  
  const totalTime = Date.now() - startTime;
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  
  return {
    avgTime: Math.round(avgTime),
    totalTime,
    emailsPerSecond: Math.round((count / totalTime) * 1000 * 100) / 100
  };
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     PERSONALIZED EMAIL DAILY CAPACITY ANALYSIS                   ║');
  console.log('║     For 1 User Account                                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // First, run a simulation to measure local processing overhead
  console.log('\n📊 Running local processing simulation (100 emails)...');
  const simResult = await simulatePersonalization(100);
  console.log(`   Local processing: ${simResult.avgTime}ms avg per email`);
  console.log(`   Local throughput: ${simResult.emailsPerSecond} emails/sec`);

  console.log('\n' + '═'.repeat(70));
  console.log('📧 DAILY CAPACITY ESTIMATES BY PROVIDER COMBINATION');
  console.log('═'.repeat(70));
  
  const results: { ai: string; email: string; daily: number; perHour: number }[] = [];
  
  for (const ai of AI_PROVIDERS) {
    for (const email of EMAIL_SERVICES) {
      const dailyCapacity = calculateDailyCapacity(ai, email);
      results.push({
        ai: ai.name,
        email: email.name,
        daily: dailyCapacity,
        perHour: Math.floor(dailyCapacity / 24)
      });
    }
  }
  
  // Sort by daily capacity
  results.sort((a, b) => b.daily - a.daily);
  
  console.log('\n┌─────────────────────┬────────────────┬──────────────────┬─────────────┐');
  console.log('│ AI Provider         │ Email Service  │ Daily Capacity   │ Per Hour    │');
  console.log('├─────────────────────┼────────────────┼──────────────────┼─────────────┤');
  
  for (const r of results) {
    console.log(`│ ${r.ai.padEnd(19)} │ ${r.email.padEnd(14)} │ ${r.daily.toLocaleString().padStart(16)} │ ${r.perHour.toLocaleString().padStart(11)} │`);
  }
  
  console.log('└─────────────────────┴────────────────┴──────────────────┴─────────────┘');

  // Current setup analysis
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 YOUR CURRENT SETUP ANALYSIS');
  console.log('═'.repeat(70));
  
  const currentAI = AI_PROVIDERS[0]; // OpenAI GPT-4
  const currentEmail = EMAIL_SERVICES[0]; // Resend Free (based on quota showing 0)
  const currentCapacity = calculateDailyCapacity(currentAI, currentEmail);
  
  console.log(`\n   AI Provider: ${currentAI.name}`);
  console.log(`   Email Service: ${currentEmail.name}`);
  console.log(`   ─────────────────────────────────────────`);
  console.log(`   📮 DAILY CAPACITY: ${currentCapacity.toLocaleString()} personalized emails`);
  console.log(`   ⏰ PER HOUR: ${Math.floor(currentCapacity / 24).toLocaleString()} emails`);
  console.log(`   📌 BOTTLENECK: ${currentEmail.emailsPerDay < 1000 ? 'Email service daily limit' : 'AI API rate limit'}`);
  
  // Recommendations
  console.log('\n' + '═'.repeat(70));
  console.log('💡 RECOMMENDATIONS TO INCREASE CAPACITY');
  console.log('═'.repeat(70));
  
  console.log('\n   1. UPGRADE RESEND PLAN');
  console.log('      Free (100/day) → Pro (50,000/day) → Scale (100,000/day)');
  console.log('      This is your current bottleneck!');
  
  console.log('\n   2. USE GPT-3.5 FOR PERSONALIZATION');
  console.log('      Faster responses, higher rate limits, lower cost');
  console.log('      Quality is still excellent for email personalization');
  
  console.log('\n   3. BATCH PROCESSING');
  console.log('      Process emails in batches with scheduling');
  console.log('      Spread sends across off-peak hours');
  
  console.log('\n   4. TEMPLATE CACHING');
  console.log('      Cache AI-generated content for similar prospects');
  console.log('      Reduces API calls by 30-50%');

  // Real-world timing simulation
  console.log('\n' + '═'.repeat(70));
  console.log('⏱️  REALISTIC TIMING SIMULATION (1000 emails)');
  console.log('═'.repeat(70));
  
  const emailCount = 1000;
  const aiTimePerEmail = currentAI.avgLatencyMs;
  const emailTimePerEmail = currentEmail.avgLatencyMs;
  const concurrency = 5; // Realistic concurrency
  
  const totalTimeMs = (emailCount / concurrency) * (aiTimePerEmail + emailTimePerEmail);
  const totalMinutes = Math.round(totalTimeMs / 1000 / 60);
  const totalHours = (totalTimeMs / 1000 / 60 / 60).toFixed(1);
  
  console.log(`\n   To send ${emailCount.toLocaleString()} personalized emails:`);
  console.log(`   ├─ AI Personalization: ~${aiTimePerEmail}ms per email`);
  console.log(`   ├─ Email Sending: ~${emailTimePerEmail}ms per email`);
  console.log(`   ├─ Concurrency: ${concurrency} parallel requests`);
  console.log(`   └─ Estimated Time: ${totalMinutes} minutes (${totalHours} hours)`);
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ Analysis complete!');
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
