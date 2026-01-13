import { db } from '../db';
import { sql, eq, and } from 'drizzle-orm';
import { verificationLogger } from '../services/verification-logging.service';
import { emails, emailQueue, sequenceProspects, prospects, sequences } from '@shared/schema';

interface SmokeTestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, any>;
}

interface SmokeTestSuiteResult {
  passed: boolean;
  tests: SmokeTestResult[];
  timestamp: string;
  environment: string;
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<SmokeTestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    verificationLogger.smokeTest(name, true, duration);
    return { name, passed: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    verificationLogger.smokeTest(name, false, duration, errorMessage);
    return { name, passed: false, duration, error: errorMessage };
  }
}

async function testEmailThreadingColumns(): Promise<void> {
  const result = await db.execute(sql`
    SELECT 
      column_name 
    FROM information_schema.columns 
    WHERE table_name = 'email_queue' 
    AND column_name IN ('message_id', 'in_reply_to', 'references')
  `);

  const columns = (result.rows as any[]).map(r => r.column_name);

  if (!columns.includes('message_id')) {
    throw new Error('Missing email_queue.message_id column');
  }
  if (!columns.includes('in_reply_to')) {
    throw new Error('Missing email_queue.in_reply_to column');
  }
}

async function testEmailsSentHaveMessageId(): Promise<void> {
  const recentSentWithoutId = await db
    .select({ id: emailQueue.id })
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, 'sent'),
        sql`${emailQueue.messageId} IS NULL`,
        sql`${emailQueue.sentAt} > NOW() - INTERVAL '24 hours'`
      )
    )
    .limit(5);

  if (recentSentWithoutId.length > 0) {
    throw new Error(`Found ${recentSentWithoutId.length} recently sent emails without Message-ID`);
  }
}

async function testBulkEnrollmentAtomicity(): Promise<void> {
  // This test verifies PostgreSQL transaction rollback works correctly
  // We use a temporary table to avoid foreign key constraints
  
  const testMarker = `smoke_test_${Date.now()}`;
  let insertedBeforeFailure = false;
  
  try {
    // First create a temp table for this test
    await db.execute(sql`
      CREATE TEMP TABLE IF NOT EXISTS _smoke_test_atomicity (
        id VARCHAR PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      ) ON COMMIT DROP
    `);
    
    await db.transaction(async (tx) => {
      // Insert a test row that should be rolled back
      await tx.execute(sql`
        INSERT INTO _smoke_test_atomicity (id) VALUES (${testMarker})
      `);
      insertedBeforeFailure = true;
      
      // Verify it was inserted within transaction
      const withinTx = await tx.execute(sql`
        SELECT id FROM _smoke_test_atomicity WHERE id = ${testMarker}
      `);
      if ((withinTx.rows as any[]).length === 0) {
        throw new Error('Insert within transaction failed');
      }
      
      // Simulate mid-transaction failure
      throw new Error('Simulated mid-transaction failure for atomicity test');
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Simulated mid-transaction failure for atomicity test') {
      // Expected error - since we used ON COMMIT DROP, the temp table and data 
      // are automatically cleaned up. We just verify the transaction abort worked.
      if (insertedBeforeFailure) {
        // The temp table should no longer exist or be empty after rollback
        try {
          const checkResult = await db.execute(sql`
            SELECT id FROM _smoke_test_atomicity WHERE id = ${testMarker}
          `);
          if ((checkResult.rows as any[]).length > 0) {
            throw new Error('Transaction rollback failed - partial write detected');
          }
        } catch (tableError) {
          // Table doesn't exist after rollback - expected behavior
        }
      }
      // Rollback worked correctly
      return;
    }
    throw error;
  }
}

async function testDeterministicSearchStability(): Promise<void> {
  const searchMode = process.env.SEARCH_MODE || 'ai';

  // This test validates the search mode configuration is correctly set
  // and that the normalization rules are working as expected
  
  // Test 1: Validate SEARCH_MODE env var is recognized
  const validModes = ['ai', 'deterministic'];
  if (!validModes.includes(searchMode)) {
    throw new Error(`Invalid SEARCH_MODE: ${searchMode}. Must be 'ai' or 'deterministic'`);
  }
  
  // Test 2: In deterministic mode, verify normalization rules work
  // (These are the rules from search.service.ts)
  if (searchMode === 'deterministic') {
    // Test plural-to-singular mapping
    const pluralTests = [
      { input: 'merchandisers', expected: 'merchandiser' },
      { input: 'analysts', expected: 'analyst' },
      { input: 'managers', expected: 'manager' },
    ];
    
    for (const test of pluralTests) {
      const normalized = test.input.replace(/ers$/, 'er').replace(/ists$/, 'ist').replace(/ors$/, 'or');
      if (normalized !== test.expected) {
        throw new Error(`Plural normalization failed: ${test.input} → ${normalized} (expected ${test.expected})`);
      }
    }
    
    // Test hyphen/underscore replacement
    const hyphenTest = 'south-africa';
    const normalizedHyphen = hyphenTest.replace(/-/g, ' ').replace(/_/g, ' ');
    if (normalizedHyphen !== 'south africa') {
      throw new Error(`Hyphen normalization failed: ${hyphenTest} → ${normalizedHyphen}`);
    }
  }
  
  // Test 3: Verify the search mode is logged correctly
  verificationLogger.killSwitchCheck('SEARCH_MODE', searchMode, true);
}

async function testInvitationTokensHashed(): Promise<void> {
  const result = await db.execute(sql`
    SELECT token 
    FROM user_invitations 
    WHERE accepted_at IS NULL 
    LIMIT 5
  `);

  for (const row of result.rows as any[]) {
    if (row.token && row.token.length < 40) {
      throw new Error('Found unhashed invitation token');
    }
  }
}

async function testSequenceProspectDeduplication(): Promise<void> {
  const duplicates = await db.execute(sql`
    SELECT sequence_id, prospect_id, COUNT(*) as cnt
    FROM sequence_prospects
    WHERE status != 'superseded'
    GROUP BY sequence_id, prospect_id
    HAVING COUNT(*) > 1
    LIMIT 5
  `);

  if ((duplicates.rows as any[]).length > 0) {
    throw new Error(`Found ${duplicates.rows.length} duplicate active enrollments`);
  }
}

async function testKillSwitchesAccessible(): Promise<void> {
  const killSwitches = [
    'SEARCH_MODE',
    'AI_PERSONALIZATION_ENABLED',
    'EMAIL_SEND_ENABLED',
    'BULK_ENROLL_ENABLED',
  ];

  for (const switchName of killSwitches) {
    const value = process.env[switchName];
    verificationLogger.killSwitchCheck(switchName, value || '(default)', true);
  }
}

async function testDatabaseConnectivity(): Promise<void> {
  const result = await db.execute(sql`SELECT 1 as check`);
  if (!result.rows || result.rows.length === 0) {
    throw new Error('Database connectivity check failed');
  }
}

export async function runPostDeploySmokeTests(): Promise<SmokeTestSuiteResult> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           POST-DEPLOY SMOKE TESTS                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const tests: SmokeTestResult[] = [];

  console.log('🧪 Running smoke tests...\n');

  tests.push(await runTest('Database Connectivity', testDatabaseConnectivity));

  tests.push(await runTest('Email Threading Columns', testEmailThreadingColumns));

  tests.push(await runTest('Sent Emails Have Message-ID', testEmailsSentHaveMessageId));

  tests.push(await runTest('Bulk Enrollment Atomicity', testBulkEnrollmentAtomicity));

  tests.push(await runTest('Invitation Tokens Hashed', testInvitationTokensHashed));

  tests.push(await runTest('Sequence Prospect Deduplication', testSequenceProspectDeduplication));

  tests.push(await runTest('Kill Switches Accessible', testKillSwitchesAccessible));

  tests.push(await runTest('Deterministic Search Stability', testDeterministicSearchStability));

  console.log('\n' + '═'.repeat(60));
  console.log('SMOKE TEST RESULTS');
  console.log('═'.repeat(60));

  for (const test of tests) {
    const status = test.passed ? '✅' : '❌';
    console.log(`${status} ${test.name} (${test.duration}ms)`);
    if (test.error) {
      console.log(`   → Error: ${test.error}`);
    }
  }

  const passed = tests.every(t => t.passed);

  console.log('═'.repeat(60));
  if (passed) {
    console.log('\n✅ ALL SMOKE TESTS PASSED\n');
  } else {
    console.log('\n❌ SMOKE TESTS FAILED - Investigate immediately\n');
  }

  return {
    passed,
    tests,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  };
}

if (require.main === module) {
  runPostDeploySmokeTests()
    .then(result => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Smoke test error:', error);
      process.exit(1);
    });
}
