# Rate Limit Enhancements

This document describes the comprehensive enhancements made to the rate limiting system to ensure robustness, observability, and data consistency.

## Overview

Three major enhancements have been added to the rate limiting system:

1. **Regression Tests for Midnight Rollover** - Comprehensive test suite to verify metadata persistence
2. **Telemetry for Rate Limit Rejections** - Detailed logging of all rate limit events
3. **Audit Script for Legacy Data** - Tool to ensure data format consistency across all records

---

## 1. Midnight Rollover Regression Tests

### Location
`server/tests/rate-limit-midnight-rollover.test.ts`

### Purpose
Verifies that rate limit metadata persists correctly across day boundaries (midnight rollover) and that the daily counter resets properly.

### Test Coverage

#### ✅ Midnight Rollover with Metadata Preservation
- Simulates a day change (e.g., 2025-01-15 → 2025-01-16)
- Verifies `currentDailyCount` resets to 1
- Confirms `lastResetDate` updates to new day in `YYYY-MM-DD` format
- Ensures custom metadata fields are preserved (not overwritten)
- Checks `dailyLimit` and `delayBetweenEmails` remain unchanged

#### ✅ Same-Day Counter Increment
- Verifies counter increments on same day (no reset)
- Confirms `lastResetDate` remains unchanged
- Ensures custom fields persist through increments

#### ✅ NULL Config Initialization
- Tests rollover with fresh automation runs (NULL config)
- Verifies proper initialization with correct date format
- Ensures default values are applied correctly

#### ✅ Multi-Day Rollover Persistence
- Simulates multiple consecutive day changes
- Confirms metadata persists across multiple rollovers
- Validates date format consistency over time

### Running the Tests

```bash
# Run all rate limit tests
npm test -- rate-limit-midnight-rollover

# Run specific test
npm test -- rate-limit-midnight-rollover -t "should reset daily counter at midnight"
```

### Key Assertions

```typescript
// Date format must be YYYY-MM-DD
expect(config.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

// Counter resets to 1 on new day
expect(config.currentDailyCount).toBe(1);

// Custom metadata preserved
expect(config.customField).toBe('should-be-preserved');
```

---

## 2. Rate Limit Rejection Telemetry

### Location
`server/services/automation.service.ts` - `reserveSendSlot()` method

### Purpose
Captures detailed telemetry when rate limits are hit, providing visibility into:
- Why requests were rejected (daily limit vs delay)
- Current utilization levels
- Timing information for debugging

### Telemetry Format

#### Daily Limit Rejection
```javascript
[Rate Limit - Daily Limit] Automation {automationRunId} rejected {
  automationRunId: "abc-123",
  userId: "user-456",
  timestamp: "2025-01-16T15:30:00.000Z",
  currentCount: 500,
  dailyLimit: 500,
  delayBetweenEmails: 30000,
  lastEmailSentAt: "2025-01-16T15:29:30.000Z",
  lastResetDate: "2025-01-16",
  reason: "DAILY_LIMIT_REACHED",
  limitUtilization: "500/500",
  percentageUsed: 100
}
```

#### Delay Not Satisfied Rejection
```javascript
[Rate Limit - Delay] Automation {automationRunId} rejected {
  automationRunId: "abc-123",
  userId: "user-456",
  timestamp: "2025-01-16T15:30:00.000Z",
  currentCount: 250,
  dailyLimit: 500,
  delayBetweenEmails: 30000,
  lastEmailSentAt: "2025-01-16T15:29:45.000Z",
  lastResetDate: "2025-01-16",
  reason: "DELAY_NOT_SATISFIED",
  requiredDelayMs: 30000,
  actualDelayMs: 15000,
  nextSendAfter: "2025-01-16T15:30:15.000Z",
  waitTimeMs: 15000
}
```

### Use Cases

1. **Production Monitoring**: Track rate limit patterns and identify heavy users
2. **Capacity Planning**: Understand limit utilization to optimize configurations
3. **Debugging**: Diagnose why emails aren't sending in specific automations
4. **Alerting**: Set up alerts when limits are frequently hit

### Log Analysis Examples

```bash
# Find all daily limit rejections
grep "DAILY_LIMIT_REACHED" logs/application.log

# Count rejections by automation
grep "Rate Limit" logs/application.log | cut -d' ' -f4 | sort | uniq -c

# Find high-utilization automations (>90%)
grep "percentageUsed" logs/application.log | grep -E "(9[0-9]|100)"

# Track delay-based rejections
grep "DELAY_NOT_SATISFIED" logs/application.log
```

---

## 3. Legacy Data Audit Script

### Location
`server/scripts/audit-rate-limit-metadata.ts`

### Purpose
Audits existing `automation_runs` rows to ensure rate limit metadata format consistency, particularly the `lastResetDate` field.

### Features

- ✅ **Dry Run Mode** - Reports issues without modifying data
- ✅ **Fix Mode** - Automatically corrects inconsistencies
- ✅ **Comprehensive Checks** - Validates all metadata fields
- ✅ **Detailed Reporting** - Provides issue breakdown by severity

### Validation Checks

1. **lastResetDate Format**
   - Must be `YYYY-MM-DD` format
   - Cannot be null (warning if missing)

2. **lastEmailSentAt Format**
   - Must be ISO 8601 timestamp or null
   - Format: `2025-01-16T15:30:00.000Z`

3. **Numeric Field Types**
   - `dailyLimit` must be number
   - `currentDailyCount` must be number
   - `delayBetweenEmails` must be number

4. **Logical Consistency**
   - `currentDailyCount` should not exceed `dailyLimit`

### Running the Audit

```bash
# Dry run (report only, no changes)
tsx server/scripts/audit-rate-limit-metadata.ts

# Fix mode (updates database - BACKUP FIRST!)
tsx server/scripts/audit-rate-limit-metadata.ts --fix
```

**SAFETY WARNINGS:**
- ⚠️ ALWAYS run dry-run mode first to review issues
- ⚠️ BACKUP your database before using `--fix` mode
- ⚠️ Fix mode includes a 5-second delay for safety
- ⚠️ Test on staging environment before production use
- ⚠️ Fix mode caps counters at `dailyLimit` (preserves in-progress runs)
- ⚠️ Uses `Number()` for numeric parsing (preserves decimals)

### Sample Output

```
🔍 Starting Rate Limit Metadata Audit...

Mode: DRY RUN (report only)

📊 Total automation runs: 1250
📊 Runs with rate_limit_config: 847

================================================================================
📋 AUDIT REPORT
================================================================================
Total automation runs: 1250
Runs with rate_limit_config: 847
Inconsistent rows found: 12

📊 Issues by Severity:
  ERROR: 8
  WARNING: 4

🔍 Detailed Issues:

1. [ERROR] Invalid lastResetDate format
   Automation Run: run-abc-123
   User ID: user-456
   Current Value: "2025/01/15"
   Expected Format: YYYY-MM-DD (e.g., 2025-01-15)

2. [WARNING] Missing lastResetDate field
   Automation Run: run-def-456
   User ID: user-789
   Current Value: null
   Expected Format: YYYY-MM-DD

3. [ERROR] Invalid lastEmailSentAt format
   Automation Run: run-ghi-789
   User ID: user-012
   Current Value: "1673884800000"
   Expected Format: ISO 8601 timestamp (e.g., 2025-01-15T12:30:00.000Z)

================================================================================

💡 To fix these issues, run: tsx server/scripts/audit-rate-limit-metadata.ts --fix
```

### Auto-Fix Logic

When run with `--fix`, the script:

1. **lastResetDate**:
   - Invalid format → Converts to `YYYY-MM-DD`
   - Missing → Uses `createdAt` date or current date

2. **lastEmailSentAt**:
   - Invalid format → Attempts to parse and convert to ISO 8601
   - Unparseable → Sets to `null`

3. **Numeric Fields**:
   - Non-numeric → Uses `Number()` for parsing (preserves decimals, defaults to 0 if NaN)
   - **Note**: Uses safe numeric parsing to avoid lossy coercion

4. **Counter Exceeds Limit**:
   - **Caps** `currentDailyCount` at `dailyLimit` (preserves in-progress state)
   - **Does NOT reset to 0** to avoid data loss for active automation runs

---

## Integration with Existing System

### Metadata Structure

```typescript
interface RateLimitConfig {
  dailyLimit: number;              // Max emails per day
  currentDailyCount: number;       // Current count for today
  delayBetweenEmails: number;      // Milliseconds between sends
  lastResetDate: string;           // YYYY-MM-DD format
  lastEmailSentAt: string | null;  // ISO 8601 timestamp or null
  // Custom fields preserved during rollover
  [key: string]: any;
}
```

### Atomic Operations

The `reserveSendSlot()` method uses raw SQL with atomic `UPDATE` and `WHERE` clauses to ensure:
- Race condition prevention
- Metadata preservation during rollover
- Consistent date format (`YYYY-MM-DD`)
- Custom fields persist through updates

```sql
UPDATE automation_runs
SET rate_limit_config = CASE
  -- New day: reset counter, preserve custom fields
  WHEN COALESCE(rate_limit_config->>'lastResetDate', $1) != $1 THEN
    rate_limit_config || jsonb_build_object(
      'currentDailyCount', 1,
      'lastResetDate', $1::text,
      'lastEmailSentAt', $2::text
    )
  -- Same day: increment counter
  ELSE
    rate_limit_config || jsonb_build_object(
      'currentDailyCount', COALESCE((rate_limit_config->>'currentDailyCount')::int, 0) + 1,
      'lastEmailSentAt', $2::text
    )
END
WHERE id = $3
AND (rate_limit_config IS NULL OR ...)
```

---

## Best Practices

### 1. Monitor Telemetry Logs

Set up monitoring for rate limit rejections:

```bash
# Cron job to alert on high rejection rates
0 * * * * grep "Rate Limit" /var/log/app.log | wc -l > /tmp/hourly_rejections.txt
```

### 2. Run Audits Regularly

Schedule periodic audits to catch data inconsistencies:

```bash
# Weekly audit (dry run)
0 2 * * 0 tsx server/scripts/audit-rate-limit-metadata.ts

# Monthly fix (if issues detected)
0 3 1 * * tsx server/scripts/audit-rate-limit-metadata.ts --fix
```

### 3. Test Before Deploying

Always run the regression tests before deploying rate limit changes:

```bash
npm test -- rate-limit-midnight-rollover
```

### 4. Custom Metadata Fields

When adding custom fields to `rateLimitConfig`:

```typescript
// ✅ GOOD: Fields will persist through rollover
rateLimitConfig.maxRetries = 3;
rateLimitConfig.customTag = "priority";

// ❌ BAD: Don't use reserved field names
rateLimitConfig.lastResetDate = "custom-value"; // Will be overwritten
```

---

## Troubleshooting

### Issue: Counter Not Resetting at Midnight

**Diagnosis**:
```bash
# Check lastResetDate format
tsx server/scripts/audit-rate-limit-metadata.ts | grep "lastResetDate"
```

**Fix**:
```bash
tsx server/scripts/audit-rate-limit-metadata.ts --fix
```

### Issue: High Rate Limit Rejections

**Diagnosis**:
```bash
# Check telemetry logs
grep "Rate Limit" logs/application.log | tail -n 50
```

**Actions**:
1. Review `dailyLimit` settings
2. Adjust `delayBetweenEmails` if delay rejections
3. Consider load distribution

### Issue: Custom Fields Lost After Rollover

**Cause**: Likely running old code without metadata preservation

**Fix**: Update to latest version with `|| jsonb_build_object(...)` merge logic

---

## Performance Considerations

### Database Impact

- **Audit Script**: Reads all automation_runs with rate_limit_config
  - Impact: ~1-2 seconds per 1000 rows
  - Recommendation: Run during low-traffic periods

- **Telemetry Logging**: Console.warn calls on rejections
  - Impact: Negligible (only on rejections)
  - No database writes

### Test Suite

- **Execution Time**: ~500ms for full suite
- **Database Cleanup**: Automatic (beforeEach/afterEach)
- **Isolation**: Each test uses unique automation run

---

## Future Enhancements

1. **Metrics Dashboard**: Aggregate telemetry data for visualization
2. **Adaptive Limits**: Automatically adjust limits based on patterns
3. **Alert Integration**: Send alerts on high rejection rates
4. **Historical Analysis**: Track limit utilization trends over time
5. **Multi-Region Support**: Handle timezone-aware rollover

---

## References

- Rate Limit Implementation: `server/services/automation.service.ts`
- Test Suite: `server/tests/rate-limit-midnight-rollover.test.ts`
- Audit Script: `server/scripts/audit-rate-limit-metadata.ts`
- Documentation: `RATE_LIMIT_ENHANCEMENTS.md`
