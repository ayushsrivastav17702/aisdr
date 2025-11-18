import { Worker, Job } from 'bullmq';
import { redisConnection, isRedisConfigured } from './redis-connection';
import { AutomationJobData } from './automation-queue';
import automationService from '../services/automation.service';
import { db } from '../db';
import { automationRuns } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const MAX_CONCURRENT_JOBS = 3; // Limit concurrent automations to avoid rate limit conflicts

if (!isRedisConfigured || !redisConnection) {
  console.warn('⚠️  Automation worker NOT started - Redis unavailable');
  console.warn('ℹ️  Immediate automations will still work, but scheduled automations require Redis/Upstash');
}


async function processAutomationJob(job: Job<AutomationJobData>): Promise<void> {
  const { 
    automationRunId, 
    sequenceId, 
    prospectSource, 
    prospectCount, 
    aiPersonalizationEnabled, 
    apolloFilters, 
    userId 
  } = job.data;

  console.log(`[Worker] Processing automation job: ${automationRunId} for user: ${userId}`);
  
  // SECURITY: Load automation run with user scoping to prevent cross-tenant access
  const run = await db.query.automationRuns.findFirst({
    where: (runs, { eq, and }) => and(
      eq(runs.id, automationRunId),
      eq(runs.userId, userId) // CRITICAL: Prevent cross-tenant access
    )
  });

  if (!run) {
    throw new Error(`Automation run ${automationRunId} not found or access denied for user ${userId}`);
  }

  // Check if automation was cancelled
  if (run.status === 'cancelled' || run.isStopped) {
    console.log(`[Worker] Automation ${automationRunId} was cancelled or stopped, skipping execution`);
    return;
  }

  // Ensure we have a valid status transition (scheduled -> running)
  const validTransitions = ['scheduled', 'failed'];
  if (!run.status || !validTransitions.includes(run.status)) {
    console.log(`[Worker] Automation ${automationRunId} has invalid status ${run.status} for execution, skipping`);
    return;
  }

  // Update to running status with attempt tracking (atomic update with userId scoping)
  const updateResult = await db.update(automationRuns)
    .set({
      status: 'running',
      attemptCount: (run.attemptCount || 0) + 1,
      lastAttemptAt: new Date(),
      startedAt: run.startedAt || new Date(),
    })
    .where(and(
      eq(automationRuns.id, automationRunId),
      eq(automationRuns.userId, userId) // CRITICAL: Scoped update
    ))
    .returning();

  if (updateResult.length === 0) {
    console.log(`[Worker] Failed to update automation ${automationRunId} status, may have been updated by another process`);
    return;
  }

  try {
    // Execute automation (this is the main processing logic)
    await automationService.processAutomation(
      automationRunId,
      sequenceId,
      prospectSource,
      prospectCount,
      aiPersonalizationEnabled,
      apolloFilters,
      userId
    );

    // CRITICAL: Re-validate automation after execution (check for mid-flight cancellation)
    const finalRun = await db.query.automationRuns.findFirst({
      where: (runs, { eq, and }) => and(
        eq(runs.id, automationRunId),
        eq(runs.userId, userId)
      )
    });

    if (!finalRun) {
      console.log(`[Worker] Automation ${automationRunId} not found after execution, skipping completion`);
      return;
    }

    // Don't overwrite if cancelled during execution
    if (finalRun.status === 'cancelled' || finalRun.isStopped) {
      console.log(`[Worker] Automation ${automationRunId} was cancelled during execution, preserving cancelled status`);
      // Ensure status is cancelled if isStopped is true but status isn't cancelled yet
      await db.update(automationRuns)
        .set({ status: 'cancelled' })
        .where(and(
          eq(automationRuns.id, automationRunId),
          eq(automationRuns.userId, userId)
        ));
      return;
    }

    // Success - clear any previous errors (user-scoped update)
    await db.update(automationRuns)
      .set({
        status: 'completed',
        errors: null, // Clear stale errors
        completedAt: new Date(),
      })
      .where(and(
        eq(automationRuns.id, automationRunId),
        eq(automationRuns.userId, userId)
      ));

    console.log(`[Worker] ✅ Automation ${automationRunId} completed successfully`);
  } catch (error) {
    console.error(`[Worker] ❌ Automation ${automationRunId} failed:`, error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log error to automation
    await automationService.logAutomationError(
      automationRunId,
      null,
      errorMessage
    );

    // Mark as failed (user-scoped update)
    await db.update(automationRuns)
      .set({ 
        status: 'failed',
        errors: errorMessage
      })
      .where(and(
        eq(automationRuns.id, automationRunId),
        eq(automationRuns.userId, userId)
      ));

    throw error; // Re-throw to trigger BullMQ retry
  }
}

let automationWorker: Worker<AutomationJobData> | null = null;

if (isRedisConfigured && redisConnection) {
  automationWorker = new Worker<AutomationJobData>(
    'automation',
    processAutomationJob,
    {
      connection: redisConnection,
      concurrency: MAX_CONCURRENT_JOBS,
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // per 60 seconds
      },
    }
  );

  automationWorker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed for automation ${job.data.automationRunId}`);
  });

  automationWorker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed for automation ${job?.data.automationRunId}:`, err.message);
  });

  automationWorker.on('error', (err) => {
    // Only log non-connection errors
    if (err.message && !err.message.includes('ECONNREFUSED')) {
      console.error('[Worker] Worker error:', err.message);
    }
  });

  console.log(`🔧 Automation worker started (concurrency: ${MAX_CONCURRENT_JOBS})`);
}

export { automationWorker };
export default automationWorker;
