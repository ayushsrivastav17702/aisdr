import { db } from '../db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

interface SchemaRequirement {
  table: string;
  column: string;
  type: string;
  required: boolean;
  description: string;
}

interface SchemaCheckResult {
  valid: boolean;
  missing: Array<{
    table: string;
    column: string;
    description: string;
  }>;
  present: string[];
}

interface BackwardCompatibilityResult {
  valid: boolean;
  tests: Array<{
    name: string;
    passed: boolean;
    error?: string;
  }>;
}

export async function validateSchemaRequirements(): Promise<SchemaCheckResult> {
  const manifestPath = path.join(__dirname, '../config/config.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const requirements: SchemaRequirement[] = manifest.schemaRequirements;

  const missing: SchemaCheckResult['missing'] = [];
  const present: string[] = [];

  for (const req of requirements) {
    try {
      const result = await db.execute(sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = ${req.table} 
        AND column_name = ${req.column}
      `);

      if (result.rows.length > 0) {
        present.push(`${req.table}.${req.column}`);
      } else if (req.required) {
        missing.push({
          table: req.table,
          column: req.column,
          description: req.description,
        });
      }
    } catch (error) {
      missing.push({
        table: req.table,
        column: req.column,
        description: `Check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
  };
}

export async function validateBackwardCompatibility(): Promise<BackwardCompatibilityResult> {
  const tests: BackwardCompatibilityResult['tests'] = [];

  try {
    await db.execute(sql`
      SELECT id, prospect_id, subject, content, status 
      FROM emails 
      WHERE message_id IS NULL 
      LIMIT 1
    `);
    tests.push({ name: 'Emails without messageId load normally', passed: true });
  } catch (error) {
    tests.push({
      name: 'Emails without messageId load normally',
      passed: false,
      error: error instanceof Error ? error.message : 'Query failed',
    });
  }

  try {
    await db.execute(sql`
      SELECT id, email, token, expires_at 
      FROM user_invitations 
      WHERE accepted_at IS NULL 
      LIMIT 1
    `);
    tests.push({ name: 'Legacy invitations resolve', passed: true });
  } catch (error) {
    tests.push({
      name: 'Legacy invitations resolve',
      passed: false,
      error: error instanceof Error ? error.message : 'Query failed',
    });
  }

  try {
    await db.execute(sql`
      SELECT s.id, s.name, s.status,
             COUNT(sp.id) as prospect_count
      FROM sequences s
      LEFT JOIN sequence_prospects sp ON s.id = sp.sequence_id
      GROUP BY s.id
      LIMIT 5
    `);
    tests.push({ name: 'Existing sequences load normally', passed: true });
  } catch (error) {
    tests.push({
      name: 'Existing sequences load normally',
      passed: false,
      error: error instanceof Error ? error.message : 'Query failed',
    });
  }

  try {
    await db.execute(sql`
      SELECT eq.id, eq.message_id, eq.in_reply_to, eq.references
      FROM email_queue eq
      LIMIT 1
    `);
    tests.push({ name: 'Email queue threading columns accessible', passed: true });
  } catch (error) {
    tests.push({
      name: 'Email queue threading columns accessible',
      passed: false,
      error: error instanceof Error ? error.message : 'Query failed',
    });
  }

  return {
    valid: tests.every(t => t.passed),
    tests,
  };
}

export async function runSchemaParityCheck(): Promise<void> {
  console.log('🔍 Running schema parity check...\n');

  console.log('1️⃣  Validating schema requirements...');
  const schemaResult = await validateSchemaRequirements();

  if (!schemaResult.valid) {
    console.error('\n❌ SCHEMA PARITY VIOLATION');
    console.error('═'.repeat(60));
    for (const item of schemaResult.missing) {
      console.error(`  ✗ Missing: ${item.table}.${item.column}`);
      console.error(`    → ${item.description}`);
    }
    console.error('═'.repeat(60));
    console.error('\nDeploy is blocked. Apply migrations before deploying.');
    process.exit(1);
  }

  console.log(`   ✅ ${schemaResult.present.length} required columns verified`);
  for (const col of schemaResult.present) {
    console.log(`      • ${col}`);
  }

  console.log('\n2️⃣  Validating backward compatibility...');
  const compatResult = await validateBackwardCompatibility();

  for (const test of compatResult.tests) {
    const status = test.passed ? '✅' : '❌';
    console.log(`   ${status} ${test.name}`);
    if (!test.passed && test.error) {
      console.log(`      Error: ${test.error}`);
    }
  }

  if (!compatResult.valid) {
    console.error('\n❌ BACKWARD COMPATIBILITY VIOLATION');
    console.error('Deploy is blocked. Ensure backward compatibility before deploying.');
    process.exit(1);
  }

  console.log('\n✅ Schema parity check passed');
}

if (require.main === module) {
  runSchemaParityCheck().catch(console.error);
}
