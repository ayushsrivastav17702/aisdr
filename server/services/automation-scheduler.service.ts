import { db } from '../db';
import { automationRuns, type InsertAutomationRun, type AutomationRun } from '@shared/schema';
import { eq, and, lte } from 'drizzle-orm';
import automationQueue from '../queue/automation-queue';

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

    // Calculate delay from now
    const delay = Math.max(0, automationData.scheduledFor.getTime() - Date.now());

    // Add job to queue with delay
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

    console.log(`[Scheduler] Scheduled automation ${automationRun.id} for ${automationData.scheduledFor.toISOString()} (delay: ${delay}ms)`);

    return automationRun;
  }

  /**
   * Start automation immediately (no scheduling)
   */
  async startAutomation(
    automationData: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'>
  ): Promise<AutomationRun> {
    // Create automation run with 'running' status
    const [automationRun] = await db.insert(automationRuns)
      .values({
        ...automationData,
        status: 'running',
        startedAt: new Date(),
      })
      .returning();

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

    // Remove job from queue
    const jobId = `automation-${automationRunId}`;
    const job = await automationQueue.getJob(jobId);
    if (job) {
      await job.remove();
      console.log(`[Scheduler] Cancelled automation ${automationRunId} and removed from queue`);
    }
  }

  /**
   * Reschedule a failed automation
   */
  async rescheduleAutomation(automationRunId: string, newScheduledFor: Date): Promise<void> {
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
