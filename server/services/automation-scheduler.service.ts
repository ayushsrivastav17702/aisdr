import { db } from '../db';
import { automationRuns, type InsertAutomationRun, type AutomationRun } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import { automationQueue, isRedisConfigured } from '../queue/automation-queue';
import automationService from './automation.service';

class AutomationSchedulerService {
  /**
   * Schedule an automation run
   */
  async scheduleAutomation(
    automationData: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'> & { scheduledFor: Date }
  ): Promise<AutomationRun> {
    // Create automation run with 'scheduled' status
    const [automationRun] = await db.insert(automationRuns)
      .values({
        ...automationData,
        status: 'scheduled',
      })
      .returning();

    if (isRedisConfigured && automationQueue) {
      // Queue-based scheduling (preferred)
      const delay = Math.max(0, automationData.scheduledFor.getTime() - Date.now());

      try {
        await automationQueue.add(
          'runAutomation',
          {
            automationRunId: automationRun.id,
            sequenceId: automationRun.sequenceId,
            prospectSource: (automationRun.prospectSource as 'apollo' | 'existing') || 'apollo',
            prospectCount: automationRun.prospectCount,
            aiPersonalizationEnabled: automationRun.aiPersonalizationEnabled ?? true,
            apolloFilters: automationRun.apolloFilters,
            userId: automationRun.userId,
          },
          {
            delay,
            jobId: `automation-${automationRun.id}`, // Use automation ID as job ID for idempotency
          }
        );

        console.log(`[Scheduler] Scheduled automation ${automationRun.id} via queue for ${automationData.scheduledFor.toISOString()}`);
      } catch (queueError) {
        // Fallback to in-memory timer if queue fails
        console.error(`[Scheduler] Queue scheduling failed, falling back to in-memory timer:`, queueError);
        
        setTimeout(async () => {
          // Re-validate automation before execution
          const currentRun = await db.query.automationRuns.findFirst({
            where: (runs, { eq, and }) => and(
              eq(runs.id, automationRun.id),
              eq(runs.userId, automationRun.userId)
            )
          });

          if (!currentRun || currentRun.status === 'cancelled' || currentRun.isStopped) {
            console.log(`[Scheduler] Automation ${automationRun.id} was cancelled or not found, skipping`);
            return;
          }

          if (currentRun.status !== 'scheduled') {
            console.log(`[Scheduler] Automation ${automationRun.id} has unexpected status, skipping`);
            return;
          }

          await this.executeAutomationWithRetry(currentRun);
        }, delay);

        console.warn(`[Scheduler] Scheduled automation ${automationRun.id} via fallback timer (queue unavailable)`);
      }
    } else {
      // Fallback: In-memory timer (less reliable, no persistence across restarts)
      const delay = Math.max(0, automationData.scheduledFor.getTime() - Date.now());
      
      setTimeout(async () => {
        // Re-validate automation before execution (check for cancellation)
        const currentRun = await db.query.automationRuns.findFirst({
          where: (runs, { eq, and }) => and(
            eq(runs.id, automationRun.id),
            eq(runs.userId, automationRun.userId)
          )
        });

        if (!currentRun) {
          console.log(`[Scheduler] Automation ${automationRun.id} not found, skipping execution`);
          return;
        }

        if (currentRun.status === 'cancelled' || currentRun.isStopped) {
          console.log(`[Scheduler] Automation ${automationRun.id} was cancelled, skipping execution`);
          return;
        }

        if (currentRun.status !== 'scheduled') {
          console.log(`[Scheduler] Automation ${automationRun.id} has unexpected status ${currentRun.status}, skipping`);
          return;
        }

        console.log(`[Scheduler] Executing scheduled automation ${automationRun.id} (fallback mode)`);
        await this.executeAutomationWithRetry(currentRun);
      }, delay);

      console.warn(`[Scheduler] Scheduled automation ${automationRun.id} via in-memory timer (Redis unavailable) - will not survive server restarts`);
    }

    return automationRun;
  }

  /**
   * Start automation immediately (no scheduling)
   */
  async startAutomation(
    automationData: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'>
  ): Promise<AutomationRun> {
    // If Redis available, use queue for reliability
    // Otherwise, run directly (legacy mode)
    if (isRedisConfigured && automationQueue) {
      // Create automation run with 'scheduled' status (worker expects this)
      const [automationRun] = await db.insert(automationRuns)
        .values({
          ...automationData,
          status: 'scheduled', // CRITICAL: Worker expects 'scheduled' or 'failed'
          startedAt: new Date(),
        })
        .returning();

      try {
        // Add job to queue immediately (no delay)
        await automationQueue.add(
          'runAutomation',
          {
            automationRunId: automationRun.id,
            sequenceId: automationRun.sequenceId,
            prospectSource: (automationRun.prospectSource as 'apollo' | 'existing') || 'apollo',
            prospectCount: automationRun.prospectCount,
            aiPersonalizationEnabled: automationRun.aiPersonalizationEnabled ?? true,
            apolloFilters: automationRun.apolloFilters,
            userId: automationRun.userId,
          },
          {
            jobId: `automation-${automationRun.id}`, // Use automation ID as job ID for idempotency
          }
        );

        console.log(`[Scheduler] Started automation ${automationRun.id} via queue`);
        return automationRun;
      } catch (queueError) {
        // Fallback to async direct execution if queue fails (DO NOT await - keep API responsive)
        console.error(`[Scheduler] Queue add failed, falling back to async execution:`, queueError);
        
        // Execute asynchronously without blocking the HTTP response
        this.executeAutomationWithRetry(automationRun).catch(err => {
          console.error(`Automation ${automationRun.id} failed after async fallback:`, err);
        });
        
        return automationRun;
      }
    } else {
      // Fallback: Run directly without queue (for when Redis is not available)
      console.warn(`[Scheduler] Running automation directly with retry support (Redis unavailable)`);
      
      const [automationRun] = await db.insert(automationRuns)
        .values({
          ...automationData,
          status: 'running',
          startedAt: new Date(),
        })
        .returning();

      // Execute with retry logic (async, matches queue behavior)
      this.executeAutomationWithRetry(automationRun).catch(err => {
        console.error(`Automation ${automationRun.id} failed after retries:`, err);
      });

      return automationRun;
    }
  }

  /**
   * Execute automation with retry logic (used for fallback mode)
   * Mirrors BullMQ retry behavior with cancellation safety
   */
  private async executeAutomationWithRetry(automationRun: AutomationRun, maxAttempts: number = 3): Promise<void> {
    const automationRunId = automationRun.id;
    const userId = automationRun.userId;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Scheduler] Executing automation ${automationRunId} (attempt ${attempt}/${maxAttempts})`);

        // CRITICAL: Re-validate automation before each attempt (check for cancellation)
        const currentRun = await db.query.automationRuns.findFirst({
          where: (runs, { eq, and }) => and(
            eq(runs.id, automationRunId),
            eq(runs.userId, userId)
          )
        });

        if (!currentRun) {
          console.log(`[Scheduler] Automation ${automationRunId} not found, aborting retries`);
          return;
        }

        // Check if automation was cancelled or stopped
        if (currentRun.status === 'cancelled' || currentRun.isStopped) {
          console.log(`[Scheduler] Automation ${automationRunId} was cancelled/stopped, aborting retries`);
          // Ensure status is set to cancelled if not already
          await db.update(automationRuns)
            .set({ status: 'cancelled' })
            .where(and(
              eq(automationRuns.id, automationRunId),
              eq(automationRuns.userId, userId)
            ));
          return;
        }

        // Validate status is still schedulable
        const validStatuses = ['scheduled', 'failed', 'running'];
        if (!validStatuses.includes(currentRun.status || '')) {
          console.log(`[Scheduler] Automation ${automationRunId} has invalid status ${currentRun.status}, aborting`);
          return;
        }

        // Update attempt tracking with user scoping
        await db.update(automationRuns)
          .set({
            status: 'running',
            attemptCount: attempt,
            lastAttemptAt: new Date(),
            startedAt: currentRun.startedAt || new Date(),
          })
          .where(and(
            eq(automationRuns.id, automationRunId),
            eq(automationRuns.userId, userId)
          ));

        // Execute automation
        await automationService.processAutomation(
          automationRunId,
          currentRun.sequenceId,
          (currentRun.prospectSource as 'apollo' | 'existing') || 'apollo',
          currentRun.prospectCount,
          currentRun.aiPersonalizationEnabled ?? true,
          currentRun.apolloFilters,
          userId
        );

        // Success - clear any previous errors (with user scoping and cancellation check)
        const finalRun = await db.query.automationRuns.findFirst({
          where: (runs, { eq, and }) => and(
            eq(runs.id, automationRunId),
            eq(runs.userId, userId)
          )
        });

        // Don't overwrite if cancelled during execution
        if (finalRun && finalRun.status !== 'cancelled' && !finalRun.isStopped) {
          await db.update(automationRuns)
            .set({
              status: 'completed',
              errors: null,
              completedAt: new Date(),
            })
            .where(and(
              eq(automationRuns.id, automationRunId),
              eq(automationRuns.userId, userId)
            ));

          console.log(`[Scheduler] ✅ Automation ${automationRunId} completed successfully`);
        } else {
          console.log(`[Scheduler] Automation ${automationRunId} was cancelled during execution`);
        }
        
        return;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Scheduler] Automation ${automationRunId} attempt ${attempt} failed:`, errorMessage);

        if (attempt === maxAttempts) {
          // Final attempt failed - mark as failed (with user scoping)
          await db.update(automationRuns)
            .set({
              status: 'failed',
              errors: errorMessage,
            })
            .where(and(
              eq(automationRuns.id, automationRunId),
              eq(automationRuns.userId, userId)
            ));

          throw error; // Re-throw after final attempt
        } else {
          // Wait before retry (exponential backoff)
          const delay = Math.min(attempt * 5000, 15000); // 5s, 10s, 15s max
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Start automation immediately (legacy - kept for backwards compatibility)
   * @deprecated Use startAutomation instead
   */
  async startAutomationLegacy(
    automationData: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'>
  ): Promise<AutomationRun> {
    const [automationRun] = await db.insert(automationRuns)
      .values({
        ...automationData,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    // Run directly without queue
    automationService.processAutomation(
      automationRun.id,
      automationRun.sequenceId,
      (automationRun.prospectSource as 'apollo' | 'existing') || 'apollo',
      automationRun.prospectCount,
      automationRun.aiPersonalizationEnabled ?? true,
      automationRun.apolloFilters,
      automationRun.userId
    ).catch(err => {
      console.error(`Automation ${automationRun.id} failed:`, err);
    });

    return automationRun;
  }

  /**
   * Start automation via queue (requires Redis)
   * @deprecated Use startAutomation instead - it handles both cases
   */
  async startAutomationViaQueue(
    automationData: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'>
  ): Promise<AutomationRun> {
    if (!isRedisConfigured || !automationQueue) {
      throw new Error('Queue-based automation requires Redis/Upstash. Use startAutomation() for fallback support.');
    }

    const [automationRun] = await db.insert(automationRuns)
      .values({
        ...automationData,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

    await automationQueue.add(
      'runAutomation',
      {
        automationRunId: automationRun.id,
        sequenceId: automationRun.sequenceId,
        prospectSource: (automationRun.prospectSource as 'apollo' | 'existing') || 'apollo',
        prospectCount: automationRun.prospectCount,
        aiPersonalizationEnabled: automationRun.aiPersonalizationEnabled ?? true,
        apolloFilters: automationRun.apolloFilters,
        userId: automationRun.userId,
      },
      {
        jobId: `automation-${automationRun.id}`, // Use automation ID as job ID for idempotency
      }
    );

    console.log(`[Scheduler] Started automation ${automationRun.id} immediately`);

    return automationRun;
  }

  /**
   * Cancel a scheduled automation
   */
  async cancelScheduledAutomation(automationRunId: string): Promise<void> {
    // Update automation status
    await db.update(automationRuns)
      .set({ 
        status: 'cancelled',
        completedAt: new Date()
      })
      .where(eq(automationRuns.id, automationRunId));

    // Remove job from queue if Redis is configured
    if (isRedisConfigured && automationQueue) {
      const jobId = `automation-${automationRunId}`;
      const job = await automationQueue.getJob(jobId);
      if (job) {
        await job.remove();
        console.log(`[Scheduler] Cancelled automation ${automationRunId} and removed from queue`);
      }
    }
  }

  /**
   * Reschedule a failed automation
   */
  async rescheduleAutomation(automationRunId: string, newScheduledFor: Date): Promise<void> {
    if (!isRedisConfigured || !automationQueue) {
      throw new Error('Rescheduling requires Redis/Upstash to be configured');
    }

    const run = await db.query.automationRuns.findFirst({
      where: (runs, { eq }) => eq(runs.id, automationRunId)
    });

    if (!run) {
      throw new Error('Automation run not found');
    }

    // Update scheduled time
    await db.update(automationRuns)
      .set({
        scheduledFor: newScheduledFor,
        status: 'scheduled',
      })
      .where(eq(automationRuns.id, automationRunId));

    // Remove old job if exists
    const oldJobId = `automation-${automationRunId}`;
    const oldJob = await automationQueue.getJob(oldJobId);
    if (oldJob) {
      await oldJob.remove();
    }

    // Add new job with updated delay
    const delay = Math.max(0, newScheduledFor.getTime() - Date.now());
    await automationQueue.add(
      'runAutomation',
      {
        automationRunId: run.id,
        sequenceId: run.sequenceId,
        prospectSource: (run.prospectSource as 'apollo' | 'existing') || 'apollo',
        prospectCount: run.prospectCount,
        aiPersonalizationEnabled: run.aiPersonalizationEnabled ?? true,
        apolloFilters: run.apolloFilters,
        userId: run.userId,
      },
      {
        delay,
        jobId: `automation-${run.id}`,
      }
    );

    console.log(`[Scheduler] Rescheduled automation ${automationRunId} for ${newScheduledFor.toISOString()}`);
  }

  /**
   * Get job status from queue
   */
  async getJobStatus(automationRunId: string): Promise<any> {
    if (!isRedisConfigured || !automationQueue) {
      return { status: 'queue_unavailable', message: 'Redis not configured' };
    }

    const jobId = `automation-${automationRunId}`;
    const job = await automationQueue.getJob(jobId);
    
    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    return {
      id: job.id,
      status: state,
      attemptsMade: job.attemptsMade,
      progress: job.progress,
      data: job.data,
    };
  }
}

export default new AutomationSchedulerService();
