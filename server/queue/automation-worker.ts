import { Worker, Job } from 'bullmq';
import redisConnection from './redis-connection';
import { AutomationJobData } from './automation-queue';
import automationService from '../services/automation.service';
import { db } from '../db';
import { automationRuns } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const MAX_CONCURRENT_JOBS = 3; // Limit concurrent automations to avoid rate limit conflicts

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

  console.log(`[Worker] Processing automation job: ${automationRunId}`);
  
  // Update attempt tracking
  const run = await db.query.automationRuns.findFirst({
    where: (runs, { eq }) => eq(runs.id, automationRunId)
  });

  if (!run) {
    throw new Error(`Automation run ${automationRunId} not found`);
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

  // Update to running status with attempt tracking (atomic update with WHERE clause)
  const updateResult = await db.update(automationRuns)
    .set({
      status: 'running',
      attemptCount: (run.attemptCount || 0) + 1,
      lastAttemptAt: new Date(),
      startedAt: run.startedAt || new Date(),
    })
    .where(eq(automationRuns.id, automationRunId))
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

    // Mark as failed (processAutomation should have already done this, but ensure it)
    await db.update(automationRuns)
      .set({ 
        status: 'failed',
        errors: errorMessage
      })
      .where(eq(automationRuns.id, automationRunId));

    throw error; // Re-throw to trigger BullMQ retry
  }
}

export const automationWorker = new Worker<AutomationJobData>(
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
  console.error('[Worker] Worker error:', err);
});

console.log(`🔧 Automation worker started (concurrency: ${MAX_CONCURRENT_JOBS})`);

export default automationWorker;
