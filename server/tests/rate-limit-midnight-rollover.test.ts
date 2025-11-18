import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../db';
import { automationRuns } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import automationService from '../services/automation.service';

/**
 * Regression test for midnight rollover to verify metadata persistence
 * 
 * This test ensures that:
 * 1. Rate limit metadata persists correctly across day boundaries
 * 2. Daily counters reset at midnight (00:00:00)
 * 3. lastResetDate format remains consistent (YYYY-MM-DD)
 * 4. Custom fields in rate_limit_config are preserved during rollover
 */
describe('Rate Limit Midnight Rollover', () => {
  let testAutomationRunId: string;
  const originalDate = Date;

  beforeEach(async () => {
    // Create a test automation run with rate limit config
    const [automationRun] = await db.insert(automationRuns).values({
      sequenceId: 'test-sequence-id',
      userId: 'test-user-id',
      prospectSource: 'apollo',
      prospectCount: 10,
      aiPersonalizationEnabled: true,
      status: 'running',
      rateLimitConfig: {
        dailyLimit: 100,
        currentDailyCount: 50,
        delayBetweenEmails: 30000,
        lastResetDate: '2025-01-15', // Yesterday's date
        lastEmailSentAt: '2025-01-15T23:59:00.000Z',
        customField: 'should-be-preserved', // Custom metadata
        maxRetries: 3 // Another custom field
      }
    }).returning();

    testAutomationRunId = automationRun.id;
  });

  afterEach(async () => {
    // Clean up test data
    if (testAutomationRunId) {
      await db.delete(automationRuns).where(eq(automationRuns.id, testAutomationRunId));
    }
    
    // Restore original Date
    global.Date = originalDate;
  });

  it('should reset daily counter at midnight while preserving metadata', async () => {
    // Mock current date to be the next day (2025-01-16)
    const mockDate = new Date('2025-01-16T00:00:01.000Z');
    global.Date = class extends originalDate {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as any;

    // Reserve a send slot (should trigger midnight rollover)
    const result = await automationService.reserveSendSlot(testAutomationRunId);

    // Should succeed because it's a new day
    expect(result.success).toBe(true);

    // Verify metadata persistence
    const updatedRun = await db.query.automationRuns.findFirst({
      where: eq(automationRuns.id, testAutomationRunId)
    });

    const config = updatedRun?.rateLimitConfig as any;

    // Counter should be reset to 1 (the slot we just reserved)
    expect(config.currentDailyCount).toBe(1);

    // lastResetDate should be updated to today in YYYY-MM-DD format
    expect(config.lastResetDate).toBe('2025-01-16');
    expect(config.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Custom fields should be preserved
    expect(config.customField).toBe('should-be-preserved');
    expect(config.maxRetries).toBe(3);

    // Daily limit should remain unchanged
    expect(config.dailyLimit).toBe(100);

    // Delay setting should be preserved
    expect(config.delayBetweenEmails).toBe(30000);

    // lastEmailSentAt should be updated to current time
    expect(config.lastEmailSentAt).toBe(mockDate.toISOString());
  });

  it('should maintain counter on same day', async () => {
    // Mock current date to be the same day (2025-01-15)
    const mockDate = new Date('2025-01-15T23:59:59.000Z');
    global.Date = class extends originalDate {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as any;

    // Get initial state
    const initialRun = await db.query.automationRuns.findFirst({
      where: eq(automationRuns.id, testAutomationRunId)
    });
    const initialCount = (initialRun?.rateLimitConfig as any).currentDailyCount;

    // Reserve a send slot (same day, should increment)
    const result = await automationService.reserveSendSlot(testAutomationRunId);

    // Should succeed
    expect(result.success).toBe(true);

    // Verify counter incremented
    const updatedRun = await db.query.automationRuns.findFirst({
      where: eq(automationRuns.id, testAutomationRunId)
    });

    const config = updatedRun?.rateLimitConfig as any;

    // Counter should increment (was 50, now 51)
    expect(config.currentDailyCount).toBe(initialCount + 1);

    // lastResetDate should remain unchanged
    expect(config.lastResetDate).toBe('2025-01-15');

    // Custom fields should be preserved
    expect(config.customField).toBe('should-be-preserved');
    expect(config.maxRetries).toBe(3);
  });

  it('should handle midnight rollover with NULL config', async () => {
    // Create automation run with NULL config
    const [freshRun] = await db.insert(automationRuns).values({
      sequenceId: 'test-sequence-fresh',
      userId: 'test-user-id',
      prospectSource: 'apollo',
      prospectCount: 5,
      aiPersonalizationEnabled: true,
      status: 'running',
      rateLimitConfig: null
    }).returning();

    try {
      const mockDate = new Date('2025-01-16T00:00:01.000Z');
      global.Date = class extends originalDate {
        constructor() {
          super();
          return mockDate;
        }
        static now() {
          return mockDate.getTime();
        }
      } as any;

      // Reserve slot (should initialize config)
      const result = await automationService.reserveSendSlot(freshRun.id);

      expect(result.success).toBe(true);

      // Verify config was initialized with correct date format
      const updatedRun = await db.query.automationRuns.findFirst({
        where: eq(automationRuns.id, freshRun.id)
      });

      const config = updatedRun?.rateLimitConfig as any;

      expect(config).toBeDefined();
      expect(config.currentDailyCount).toBe(1);
      expect(config.lastResetDate).toBe('2025-01-16');
      expect(config.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(config.dailyLimit).toBe(500); // Default
      expect(config.delayBetweenEmails).toBe(30000); // Default
    } finally {
      await db.delete(automationRuns).where(eq(automationRuns.id, freshRun.id));
    }
  });

  it('should preserve metadata across multiple rollovers', async () => {
    // Simulate rolling over multiple days
    const dates = [
      '2025-01-16T12:00:00.000Z',
      '2025-01-17T08:30:00.000Z',
      '2025-01-18T15:45:00.000Z'
    ];

    for (const dateStr of dates) {
      const mockDate = new Date(dateStr);
      global.Date = class extends originalDate {
        constructor() {
          super();
          return mockDate;
        }
        static now() {
          return mockDate.getTime();
        }
      } as any;

      await automationService.reserveSendSlot(testAutomationRunId);

      const run = await db.query.automationRuns.findFirst({
        where: eq(automationRuns.id, testAutomationRunId)
      });

      const config = run?.rateLimitConfig as any;

      // Custom fields should persist across rollovers
      expect(config.customField).toBe('should-be-preserved');
      expect(config.maxRetries).toBe(3);

      // Counter should reset to 1 each new day
      expect(config.currentDailyCount).toBe(1);

      // Date format should be consistent
      expect(config.lastResetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(config.lastResetDate).toBe(mockDate.toISOString().split('T')[0]);
    }
  });
});
