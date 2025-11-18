/**
 * Audit Script: Rate Limit Metadata Consistency
 * 
 * This script audits legacy automation_runs rows to ensure:
 * 1. lastResetDate format is consistent (YYYY-MM-DD)
 * 2. All rate limit metadata fields are properly formatted
 * 3. Identifies and optionally fixes inconsistent entries
 * 
 * Usage:
 *   tsx server/scripts/audit-rate-limit-metadata.ts         # Dry run (report only)
 *   tsx server/scripts/audit-rate-limit-metadata.ts --fix   # Fix inconsistencies
 * 
 * SAFETY WARNINGS:
 * - ALWAYS run dry-run mode first to review issues
 * - BACKUP your database before using --fix mode
 * - Fix mode caps counters at dailyLimit (preserves in-progress runs)
 * - Fix mode uses Number() for numeric parsing (preserves decimals)
 * - Test on staging environment before production use
 */

import { db } from '../db';
import { automationRuns } from '@shared/schema';
import { sql, isNotNull } from 'drizzle-orm';

interface AuditResult {
  totalRows: number;
  rowsWithConfig: number;
  inconsistentRows: number;
  fixedRows: number;
  issues: AuditIssue[];
}

interface AuditIssue {
  automationRunId: string;
  userId: string;
  issue: string;
  currentValue: any;
  expectedFormat: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
}

async function auditRateLimitMetadata(fix: boolean = false): Promise<AuditResult> {
  console.log('🔍 Starting Rate Limit Metadata Audit...\n');
  console.log(`Mode: ${fix ? 'FIX (will update database)' : 'DRY RUN (report only)'}\n`);

  const result: AuditResult = {
    totalRows: 0,
    rowsWithConfig: 0,
    inconsistentRows: 0,
    fixedRows: 0,
    issues: []
  };

  // Fetch all automation runs with rate limit config
  const runs = await db.select({
    id: automationRuns.id,
    userId: automationRuns.userId,
    rateLimitConfig: automationRuns.rateLimitConfig,
    status: automationRuns.status,
    createdAt: automationRuns.createdAt
  })
  .from(automationRuns)
  .where(isNotNull(automationRuns.rateLimitConfig));

  result.totalRows = runs.length;
  console.log(`📊 Total automation runs: ${result.totalRows}`);
  console.log(`📊 Runs with rate_limit_config: ${runs.length}\n`);

  const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
  const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

  for (const run of runs) {
    result.rowsWithConfig++;
    const config = run.rateLimitConfig as any;

    if (!config) continue;

    let hasIssue = false;

    // Check 1: lastResetDate format (should be YYYY-MM-DD)
    if (config.lastResetDate) {
      if (!dateFormatRegex.test(config.lastResetDate)) {
        hasIssue = true;
        result.issues.push({
          automationRunId: run.id,
          userId: run.userId,
          issue: 'Invalid lastResetDate format',
          currentValue: config.lastResetDate,
          expectedFormat: 'YYYY-MM-DD (e.g., 2025-01-15)',
          severity: 'ERROR'
        });
      }
    } else {
      hasIssue = true;
      result.issues.push({
        automationRunId: run.id,
        userId: run.userId,
        issue: 'Missing lastResetDate field',
        currentValue: null,
        expectedFormat: 'YYYY-MM-DD',
        severity: 'WARNING'
      });
    }

    // Check 2: lastEmailSentAt format (should be ISO timestamp or null)
    if (config.lastEmailSentAt && !isoTimestampRegex.test(config.lastEmailSentAt)) {
      hasIssue = true;
      result.issues.push({
        automationRunId: run.id,
        userId: run.userId,
        issue: 'Invalid lastEmailSentAt format',
        currentValue: config.lastEmailSentAt,
        expectedFormat: 'ISO 8601 timestamp (e.g., 2025-01-15T12:30:00.000Z)',
        severity: 'ERROR'
      });
    }

    // Check 3: Required numeric fields
    const numericFields = ['dailyLimit', 'currentDailyCount', 'delayBetweenEmails'];
    for (const field of numericFields) {
      if (config[field] !== undefined && typeof config[field] !== 'number') {
        hasIssue = true;
        result.issues.push({
          automationRunId: run.id,
          userId: run.userId,
          issue: `Invalid ${field} type`,
          currentValue: `${config[field]} (${typeof config[field]})`,
          expectedFormat: 'number',
          severity: 'ERROR'
        });
      }
    }

    // Check 4: Counter should not exceed limit
    if (config.currentDailyCount && config.dailyLimit) {
      if (config.currentDailyCount > config.dailyLimit) {
        hasIssue = true;
        result.issues.push({
          automationRunId: run.id,
          userId: run.userId,
          issue: 'currentDailyCount exceeds dailyLimit',
          currentValue: `${config.currentDailyCount} > ${config.dailyLimit}`,
          expectedFormat: 'currentDailyCount <= dailyLimit',
          severity: 'WARNING'
        });
      }
    }

    if (hasIssue) {
      result.inconsistentRows++;

      // Fix if requested
      if (fix) {
        try {
          const fixedConfig = { ...config };

          // Fix lastResetDate if invalid or missing
          if (!config.lastResetDate || !dateFormatRegex.test(config.lastResetDate)) {
            // Try to parse from createdAt or use today
            const resetDate = run.createdAt 
              ? new Date(run.createdAt).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            fixedConfig.lastResetDate = resetDate;
          }

          // Fix lastEmailSentAt if invalid
          if (config.lastEmailSentAt && !isoTimestampRegex.test(config.lastEmailSentAt)) {
            try {
              fixedConfig.lastEmailSentAt = new Date(config.lastEmailSentAt).toISOString();
            } catch {
              fixedConfig.lastEmailSentAt = null;
            }
          }

          // Fix numeric fields (avoid lossy coercion - only fix if truly invalid)
          for (const field of numericFields) {
            if (fixedConfig[field] !== undefined && typeof fixedConfig[field] !== 'number') {
              const parsed = Number(fixedConfig[field]);
              // Only set to 0 if NaN, otherwise preserve the parsed value
              fixedConfig[field] = isNaN(parsed) ? 0 : parsed;
            }
          }

          // Cap counter at limit rather than resetting to 0 (preserve in-progress state)
          if (fixedConfig.currentDailyCount > fixedConfig.dailyLimit) {
            fixedConfig.currentDailyCount = fixedConfig.dailyLimit;
            console.log(`⚠️  Capped currentDailyCount to dailyLimit for automation ${run.id}`);
          }

          // Update database
          await db.update(automationRuns)
            .set({ rateLimitConfig: fixedConfig })
            .where(sql`id = ${run.id}`);

          result.fixedRows++;
          console.log(`✅ Fixed automation run ${run.id}`);
        } catch (error) {
          console.error(`❌ Failed to fix automation run ${run.id}:`, error);
        }
      }
    }
  }

  return result;
}

function printAuditReport(result: AuditResult, fix: boolean) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 AUDIT REPORT');
  console.log('='.repeat(80));
  console.log(`Total automation runs: ${result.totalRows}`);
  console.log(`Runs with rate_limit_config: ${result.rowsWithConfig}`);
  console.log(`Inconsistent rows found: ${result.inconsistentRows}`);
  
  if (fix) {
    console.log(`Rows fixed: ${result.fixedRows}`);
  }

  if (result.issues.length > 0) {
    console.log('\n📊 Issues by Severity:');
    const bySeverity = result.issues.reduce((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(bySeverity).forEach(([severity, count]) => {
      console.log(`  ${severity}: ${count}`);
    });

    console.log('\n🔍 Detailed Issues:');
    result.issues.forEach((issue, index) => {
      console.log(`\n${index + 1}. [${issue.severity}] ${issue.issue}`);
      console.log(`   Automation Run: ${issue.automationRunId}`);
      console.log(`   User ID: ${issue.userId}`);
      console.log(`   Current Value: ${JSON.stringify(issue.currentValue)}`);
      console.log(`   Expected Format: ${issue.expectedFormat}`);
    });
  } else {
    console.log('\n✅ No issues found! All rate limit metadata is consistent.');
  }

  console.log('\n' + '='.repeat(80));

  if (!fix && result.inconsistentRows > 0) {
    console.log('\n💡 To fix these issues, run: npm run audit:rate-limits --fix');
  }
}

// Main execution
async function main() {
  try {
    const fix = process.argv.includes('--fix');
    
    // Safety warning for fix mode
    if (fix) {
      console.log('\n⚠️  WARNING: Running in FIX mode - database will be modified!');
      console.log('⚠️  Ensure you have a database backup before proceeding.');
      console.log('⚠️  Press Ctrl+C to cancel within 5 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    const result = await auditRateLimitMetadata(fix);
    printAuditReport(result, fix);

    if (result.inconsistentRows > 0 && !fix) {
      process.exit(1); // Exit with error code if issues found in dry run
    }
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { auditRateLimitMetadata, type AuditResult, type AuditIssue };
