import { db } from "../db";
import { sequenceProspects, emailQueue, sequenceSteps, prospects, emails, sequences } from "@shared/schema";
import { eq, and, isNotNull, desc, sql } from "drizzle-orm";
import { emailQueueService } from "./email-queue.service";
import { Sentry, isSentryEnabled } from "../sentry";
import { schedulerMonitoringService } from "./scheduler-monitoring.service";

// Health monitoring types
export interface ExecutorHealthStatus {
  isRunning: boolean;
  lastHeartbeat: Date | null;
  lastRunDuration: number | null;
  consecutiveFailures: number;
  totalRuns: number;
  totalEmailsScheduled: number;
  alertThresholdMinutes: number;
  isHealthy: boolean;
  lastAlert: Date | null;
}

export interface ExecutorAlert {
  type: 'missed_heartbeat' | 'consecutive_failures' | 'executor_stopped';
  severity: 'warning' | 'critical';
  message: string;
  lastHeartbeat: Date | null;
  minutesSinceLastRun: number;
  timestamp: Date;
}

export class SequenceExecutorService {
  private executorInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  
  // Health monitoring state
  private healthMonitorInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat: Date | null = null;
  private lastRunDuration: number | null = null;
  private consecutiveFailures: number = 0;
  private totalRuns: number = 0;
  private totalEmailsScheduled: number = 0;
  private lastAlert: Date | null = null;
  private lastFailureAlert: Date | null = null;
  private alertThresholdMinutes: number = 15;
  private configuredIntervalMinutes: number = 5;
  private alertCallbacks: Array<(alert: ExecutorAlert) => void> = [];

  /**
   * Initializes the background worker for executing sequence steps.
   * Checks every 5 minutes for prospects ready for their next email.
   */
  startExecutor(intervalMinutes: number = 5): void {
    if (this.executorInterval) {
      console.log("⚠️ Sequence executor already running");
      return;
    }

    console.log(`⏳ Starting Sequence Executor (checks every ${intervalMinutes} minutes)`);
    
    // Track configured interval for health monitoring
    this.configuredIntervalMinutes = intervalMinutes;
    
    // Initial check
    this.processNextSteps();
    
    // Set up interval
    this.executorInterval = setInterval(async () => {
      await this.processNextSteps();
    }, intervalMinutes * 60 * 1000);

    // Start health monitoring (check every minute)
    this.startHealthMonitor();
  }

  stopExecutor(): void {
    if (this.executorInterval) {
      clearInterval(this.executorInterval);
      this.executorInterval = null;
      console.log("🛑 Sequence executor stopped");
    }
    this.stopHealthMonitor();
  }

  /**
   * Register a callback to receive alerts when health issues are detected.
   */
  onAlert(callback: (alert: ExecutorAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Start health monitoring - checks every minute if executor is healthy.
   */
  private startHealthMonitor(): void {
    if (this.healthMonitorInterval) return;

    console.log(`🏥 Starting health monitor (alert threshold: ${this.alertThresholdMinutes} minutes)`);
    
    this.healthMonitorInterval = setInterval(() => {
      this.checkHealth();
    }, 60 * 1000); // Check every minute
  }

  /**
   * Stop health monitoring.
   */
  private stopHealthMonitor(): void {
    if (this.healthMonitorInterval) {
      clearInterval(this.healthMonitorInterval);
      this.healthMonitorInterval = null;
      console.log("🏥 Health monitor stopped");
    }
  }

  /**
   * Check executor health and trigger alerts if needed.
   */
  private checkHealth(): void {
    const now = new Date();
    
    if (!this.lastHeartbeat) {
      // Executor hasn't run yet since startup
      return;
    }

    const minutesSinceLastRun = (now.getTime() - this.lastHeartbeat.getTime()) / (1000 * 60);
    
    // Check if we've exceeded the alert threshold
    if (minutesSinceLastRun >= this.alertThresholdMinutes) {
      // Don't spam alerts - only alert once per threshold period
      if (!this.lastAlert || (now.getTime() - this.lastAlert.getTime()) >= this.alertThresholdMinutes * 60 * 1000) {
        const alert: ExecutorAlert = {
          type: 'missed_heartbeat',
          severity: minutesSinceLastRun >= this.alertThresholdMinutes * 2 ? 'critical' : 'warning',
          message: `Sequence executor has not run for ${Math.round(minutesSinceLastRun)} minutes. Expected interval: ${this.configuredIntervalMinutes} minutes, threshold: ${this.alertThresholdMinutes} minutes.`,
          lastHeartbeat: this.lastHeartbeat,
          minutesSinceLastRun: Math.round(minutesSinceLastRun),
          timestamp: now,
        };

        this.triggerAlert(alert);
        this.lastAlert = now;
      }
    }

    // Check for consecutive failures (with throttling to prevent alert spam)
    if (this.consecutiveFailures >= 3) {
      // Only alert for consecutive failures every 5 minutes
      if (!this.lastFailureAlert || (now.getTime() - this.lastFailureAlert.getTime()) >= 5 * 60 * 1000) {
        const alert: ExecutorAlert = {
          type: 'consecutive_failures',
          severity: 'critical',
          message: `Sequence executor has failed ${this.consecutiveFailures} consecutive times. Investigation required.`,
          lastHeartbeat: this.lastHeartbeat,
          minutesSinceLastRun: Math.round(minutesSinceLastRun),
          timestamp: now,
        };

        this.triggerAlert(alert);
        this.lastFailureAlert = now;
      }
    }
  }

  /**
   * Trigger alert to all registered callbacks.
   */
  private triggerAlert(alert: ExecutorAlert): void {
    console.error(`🚨 EXECUTOR ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
    console.error(`   Last heartbeat: ${alert.lastHeartbeat?.toISOString() || 'Never'}`);
    console.error(`   Minutes since last run: ${alert.minutesSinceLastRun}`);

    // Report to Sentry if available
    if (isSentryEnabled()) {
      Sentry.captureMessage(alert.message, {
        level: alert.severity === 'critical' ? 'error' : 'warning',
        tags: { 
          service: 'sequence-executor', 
          alert_type: alert.type,
          severity: alert.severity 
        },
        extra: {
          lastHeartbeat: alert.lastHeartbeat?.toISOString(),
          minutesSinceLastRun: alert.minutesSinceLastRun,
          consecutiveFailures: this.consecutiveFailures,
          totalRuns: this.totalRuns,
        }
      });
    }

    // Call registered callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (err) {
        console.error("Alert callback error:", err);
      }
    }
  }

  /**
   * Record a heartbeat - called after each successful run.
   */
  private async recordHeartbeat(duration: number, emailsScheduled: number): Promise<void> {
    this.lastHeartbeat = new Date();
    this.lastRunDuration = duration;
    this.totalRuns++;
    this.totalEmailsScheduled += emailsScheduled;
    this.consecutiveFailures = 0; // Reset on success

    console.log(`💓 HEARTBEAT [${this.lastHeartbeat.toISOString()}] Run #${this.totalRuns} - Duration: ${duration}ms, Emails scheduled: ${emailsScheduled}`);
    
    await schedulerMonitoringService.recordHeartbeat("sequence_executor", emailsScheduled, 0, duration);
  }

  /**
   * Record a failure - called after each failed run.
   */
  private recordFailure(error: Error): void {
    this.consecutiveFailures++;
    console.error(`❌ EXECUTOR FAILURE #${this.consecutiveFailures}: ${error.message}`);
  }

  /**
   * Get current health status.
   */
  getHealthStatus(): ExecutorHealthStatus {
    const now = new Date();
    const minutesSinceLastRun = this.lastHeartbeat 
      ? (now.getTime() - this.lastHeartbeat.getTime()) / (1000 * 60)
      : null;

    const isHealthy = 
      this.executorInterval !== null && 
      this.consecutiveFailures < 3 &&
      (minutesSinceLastRun === null || minutesSinceLastRun < this.alertThresholdMinutes);

    return {
      isRunning: this.executorInterval !== null,
      lastHeartbeat: this.lastHeartbeat,
      lastRunDuration: this.lastRunDuration,
      consecutiveFailures: this.consecutiveFailures,
      totalRuns: this.totalRuns,
      totalEmailsScheduled: this.totalEmailsScheduled,
      alertThresholdMinutes: this.alertThresholdMinutes,
      isHealthy,
      lastAlert: this.lastAlert,
    };
  }

  /**
   * Main function to find and schedule the next step for active prospects.
   * Processes all active sequence enrollments in batches.
   */
  private async processNextSteps(): Promise<void> {
    if (this.isProcessing) {
      console.log("[SequenceExecutor] Already processing, skipping this interval");
      return;
    }

    const startTime = Date.now();
    let scheduledCount = 0;

    try {
      this.isProcessing = true;
      console.log("[SequenceExecutor] 🔍 Checking for prospects ready for next email...");
      
      // 1. Find all prospects actively enrolled in any sequence
      const activeEnrollments = await db.query.sequenceProspects.findMany({
        where: and(
          eq(sequenceProspects.status, "active"), // Only prospects that are running
          isNotNull(sequenceProspects.sequenceId)
        ),
        limit: 1000 // Process in batches
      });

      if (activeEnrollments.length === 0) {
        console.log("[SequenceExecutor] No active enrollments found");
        // Still record heartbeat for empty runs
        const duration = Date.now() - startTime;
        await this.recordHeartbeat(duration, 0);
        return;
      }

      console.log(`[SequenceExecutor] Found ${activeEnrollments.length} active enrollments to check`);
      let processedCount = 0;
      let completedCount = 0;

      for (const enrollment of activeEnrollments) {
        try {
          // CRITICAL: Skip enrollments with null sequenceId (data integrity issue)
          if (!enrollment.sequenceId) {
            console.warn(`[SequenceExecutor] Enrollment ${enrollment.id} has null sequenceId, skipping`);
            continue;
          }
          
          // Get prospect with userId for multi-tenant security
          const prospect = await db.query.prospects.findFirst({
            where: eq(prospects.id, enrollment.prospectId)
          });
          
          if (!prospect) {
            console.warn(`[SequenceExecutor] Prospect ${enrollment.prospectId} not found, skipping`);
            continue;
          }
          
          // 2. Determine the prospect's last completed step
          // Use the emailQueue table which has stepOrder for tracking sequence progress
          const lastSentQueueItem = await db.query.emailQueue.findFirst({
            where: and(
              eq(emailQueue.prospectId, enrollment.prospectId),
              eq(emailQueue.sequenceId, enrollment.sequenceId),
              eq(emailQueue.status, 'sent')
            ),
            orderBy: desc(emailQueue.sentAt)
          });
          
          // Determine the next step order from the last sent email's stepOrder
          // CRITICAL: Handle null stepOrder gracefully - if last email has null stepOrder,
          // we can't reliably determine what comes next, so default to 0
          const lastStepOrder = (lastSentQueueItem?.stepOrder != null) ? lastSentQueueItem.stepOrder : 0;
          const nextStepOrder = lastStepOrder + 1;

          // 3. Look up the configuration for the next step
          const nextStepConfig = await db.query.sequenceSteps.findFirst({
            where: and(
              eq(sequenceSteps.sequenceId, enrollment.sequenceId),
              eq(sequenceSteps.stepOrder, nextStepOrder),
              eq(sequenceSteps.stepType, "email") // Only email steps
            )
          });

          if (!nextStepConfig) {
            // Sequence completed. Update status and skip.
            await db.update(sequenceProspects)
              .set({ 
                status: "completed",
                completedAt: new Date()
              })
              .where(eq(sequenceProspects.id, enrollment.id));
            
            completedCount++;
            continue;
          }
          
          // CRITICAL: Validate stepOrder is not null before scheduling
          if (nextStepConfig.stepOrder == null) {
            console.error(`[SequenceExecutor] Step config ${nextStepConfig.id} has null stepOrder, marking enrollment as failed`);
            
            // Mark enrollment as failed to prevent infinite loops
            await db.update(sequenceProspects)
              .set({ 
                status: "failed",
                completedAt: new Date()
              })
              .where(eq(sequenceProspects.id, enrollment.id));
            
            continue;
          }

          // 4. Check if the delay has passed
          // Delay starts from the last sent time (or enrollment time for Step 1)
          const lastEventTime = lastSentQueueItem?.sentAt || enrollment.enrolledAt;
          
          if (!lastEventTime) {
            console.warn(`[SequenceExecutor] No event time for enrollment ${enrollment.id}, skipping`);
            continue;
          }

          const requiredDelayMs = (nextStepConfig.delayDays || 0) * 24 * 60 * 60 * 1000; // Convert days to milliseconds
          const readyToSendAt = new Date(lastEventTime.getTime() + requiredDelayMs);

          if (readyToSendAt <= new Date()) {
            // 🔥 The delay has passed. Schedule the email.
            await this.scheduleStep({
              prospectId: enrollment.prospectId,
              sequenceId: enrollment.sequenceId,
              automationRunId: enrollment.automationRunId || "",
              sequenceProspectId: enrollment.id,
              stepConfig: nextStepConfig,
              userId: prospect.userId, // CRITICAL: Pass userId for multi-tenant security
              prospect // Pass prospect for fallback content generation
            });
            
            scheduledCount++;
            console.log(`[SequenceExecutor] ✅ Scheduled step ${nextStepOrder} for prospect ${enrollment.prospectId}`);
          }
          // If delay hasn't passed, do nothing and check again in the next interval
          
          processedCount++;
        } catch (error) {
          console.error(`[SequenceExecutor] Error processing enrollment ${enrollment.id}:`, error);
          if (isSentryEnabled()) {
            Sentry.captureException(error, {
              tags: { service: 'sequence-executor', operation: 'processEnrollment' },
              extra: { enrollmentId: enrollment.id, prospectId: enrollment.prospectId }
            });
          }
          // Continue with other prospects
        }
      }

      console.log(`[SequenceExecutor] 📊 Processed ${processedCount}/${activeEnrollments.length} enrollments`);
      console.log(`[SequenceExecutor] 📧 Scheduled ${scheduledCount} new emails`);
      console.log(`[SequenceExecutor] ✅ Completed ${completedCount} sequences`);

      // Record successful heartbeat
      const duration = Date.now() - startTime;
      await this.recordHeartbeat(duration, scheduledCount);
      
    } catch (error) {
      console.error("[SequenceExecutor] ❌ Error in processNextSteps:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'sequence-executor', operation: 'processNextSteps' }
        });
      }
      // Record failure
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Schedules a follow-up step into the email queue.
   * Uses the step's default content (no AI personalization for follow-ups).
   */
  private async scheduleStep(params: {
    prospectId: string;
    sequenceId: string;
    automationRunId: string;
    sequenceProspectId: string;
    stepConfig: any;
    userId: string; // CRITICAL: Multi-tenant security
    prospect?: any; // Optional: Prospect data for fallback content
  }): Promise<void> {
    try {
      const { prospectId, sequenceId, automationRunId, sequenceProspectId, stepConfig, userId } = params;

      // Check if this step is already queued, sent (avoid duplicates)
      // For failed: only block if failed recently (within 1 hour) to allow retry after transient failures
      const existingActiveEmail = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.prospectId, prospectId),
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, stepConfig.stepOrder),
          eq(emailQueue.userId, userId),
          sql`${emailQueue.status} IN ('pending', 'sending', 'sent')`
        )
      });

      if (existingActiveEmail) {
        console.log(`[SequenceExecutor] Step ${stepConfig.stepOrder} already queued/sent for prospect ${prospectId}, skipping (status: ${existingActiveEmail.status})`);
        return;
      }

      // Check for recently failed emails (within 1 hour) to prevent rapid retry spam
      const recentFailedEmail = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.prospectId, prospectId),
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, stepConfig.stepOrder),
          eq(emailQueue.userId, userId),
          sql`${emailQueue.status} = 'failed'`,
          sql`${emailQueue.createdAt} > NOW() - INTERVAL '1 hour'`
        )
      });

      if (recentFailedEmail) {
        console.log(`[SequenceExecutor] Step ${stepConfig.stepOrder} failed recently for prospect ${prospectId} - wait 1 hour before retrying`);
        return;
      }
      
      // Get prospect data for fallback content if not provided
      let prospect = params.prospect;
      if (!prospect) {
        prospect = await db.query.prospects.findFirst({
          where: eq(prospects.id, prospectId)
        });
      }
      
      // THREADING: Get the most recent sent email from emailQueue (the authoritative source for messageId)
      // This allows follow-up emails to appear in the same thread as the original
      let inReplyTo: string | undefined;
      let references: string | undefined;
      let originalSubject: string | undefined;
      let previousEmailContext: string | undefined;
      
      // CRITICAL: Use emailQueue table - this is where messageId is populated after send
      const previousQueuedEmail = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.prospectId, prospectId),
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.status, 'sent'),
          eq(emailQueue.userId, userId),
          sql`${emailQueue.messageId} IS NOT NULL`
        ),
        orderBy: desc(emailQueue.sentAt)
      });
      
      if (previousQueuedEmail?.messageId) {
        inReplyTo = previousQueuedEmail.messageId;
        // Build references chain - include all previous messageIds for full thread
        references = previousQueuedEmail.references 
          ? `${previousQueuedEmail.references} ${previousQueuedEmail.messageId}`
          : previousQueuedEmail.messageId;
        originalSubject = previousQueuedEmail.subject;
        // Build context for thread-aware AI generation (truncate to 2KB)
        previousEmailContext = `Subject: ${previousQueuedEmail.subject}\n\n${(previousQueuedEmail.body || '').substring(0, 2000)}`;
        console.log(`[SequenceExecutor] 🔗 Threading follow-up to Message-ID: ${inReplyTo}`);
      }
      
      // Get email content - use step template or generate fallback
      let emailSubject = stepConfig.subject || '';
      let emailBody = stepConfig.body || '';
      
      // CRITICAL: Generate fallback content if template is empty
      if (!emailSubject.trim() || !emailBody.trim()) {
        const prospectName = prospect?.firstName || 'there';
        const companyName = prospect?.companyName || 'your company';
        
        if (!emailSubject.trim()) {
          emailSubject = `Follow-up: Quick question about ${companyName}`;
        }
        
        if (!emailBody.trim()) {
          emailBody = `Hi ${prospectName},

I wanted to follow up on my previous message. I believe there could be a great opportunity for ${companyName} to improve operations and efficiency.

Would you have 15 minutes this week for a quick call to discuss?

Best regards`;
        }
        
        console.log(`[SequenceExecutor] Generated fallback content for step ${stepConfig.stepOrder}`);
      }
      
      // THREADING: Prefix subject with "Re: " if this is a follow-up and subject doesn't already have it
      // Use original subject from the thread if available for proper threading
      if (inReplyTo && originalSubject) {
        // Use the original subject with "Re: " prefix for proper threading
        const baseSubject = originalSubject.replace(/^Re:\s*/i, '');
        emailSubject = `Re: ${baseSubject}`;
      }
      
      // Add follow-up email to queue with threading headers
      // Skip SafeToSend during scheduling - it will be checked when email is processed/sent
      await emailQueueService.addToQueue({
        prospectId,
        sequenceId,
        subject: emailSubject,
        body: emailBody,
        scheduledFor: new Date(), // Schedule immediately as delay has passed
        stepOrder: stepConfig.stepOrder, // CRITICAL: Track sequence progress
        userId, // CRITICAL: Multi-tenant security (validated above)
        priority: 5,
        fromName: undefined, // Will use mailbox default
        inReplyTo, // Threading: reference the previous email
        references, // Threading: full thread history
        skipSafeToSendCheck: true, // Check happens during send, not scheduling
        preferredMailboxId: stepConfig.mailboxId || undefined, // Use step-specific mailbox if configured
      });

      // Update enrollment progress to track the new step
      await db.update(sequenceProspects)
        .set({ currentStepId: stepConfig.id })
        .where(eq(sequenceProspects.id, sequenceProspectId));
        
      console.log(`[SequenceExecutor] Queued step ${stepConfig.stepOrder} for prospect ${prospectId}`);
      
    } catch (error) {
      console.error(`[SequenceExecutor] Error scheduling step:`, error);
      throw error;
    }
  }

  /**
   * DRY RUN: Simulate sequence execution without sending emails.
   * Generates all emails for enrolled prospects and stores with status="preview".
   * Returns preview list for UI display.
   */
  async dryRunSequence(params: {
    sequenceId: string;
    userId: string;
    prospectIds?: string[]; // Optional: limit to specific prospects
  }): Promise<{
    success: boolean;
    previews: Array<{
      id: string;
      prospectId: string;
      prospectName: string;
      prospectEmail: string;
      stepOrder: number;
      subject: string;
      body: string;
      status: 'preview';
      scheduledFor: Date;
    }>;
    totalGenerated: number;
    errors: string[];
  }> {
    const previews: Array<{
      id: string;
      prospectId: string;
      prospectName: string;
      prospectEmail: string;
      stepOrder: number;
      subject: string;
      body: string;
      status: 'preview';
      scheduledFor: Date;
    }> = [];
    const errors: string[] = [];

    try {
      console.log(`[SequenceExecutor] 🔍 DRY RUN for sequence ${params.sequenceId}`);

      // SECURITY: Verify sequence ownership before proceeding
      const sequence = await db.query.sequences.findFirst({
        where: and(
          eq(sequences.id, params.sequenceId),
          eq(sequences.userId, params.userId)
        )
      });

      if (!sequence) {
        console.warn(`[SequenceExecutor] ⚠️ Sequence ${params.sequenceId} not found or access denied for user ${params.userId}`);
        return {
          success: false,
          previews: [],
          totalGenerated: 0,
          errors: ["Sequence not found or access denied"]
        };
      }

      // DEDUPLICATION: Clear existing previews before generating new ones
      const existingPreviews = await db.delete(emailQueue)
        .where(and(
          eq(emailQueue.sequenceId, params.sequenceId),
          eq(emailQueue.userId, params.userId),
          eq(emailQueue.status, 'preview')
        ))
        .returning();
      
      if (existingPreviews.length > 0) {
        console.log(`[SequenceExecutor] Cleared ${existingPreviews.length} existing previews`);
      }

      // Get sequence steps
      const steps = await db.query.sequenceSteps.findMany({
        where: and(
          eq(sequenceSteps.sequenceId, params.sequenceId),
          eq(sequenceSteps.stepType, "email")
        ),
        orderBy: (steps, { asc }) => [asc(steps.stepOrder)]
      });

      if (steps.length === 0) {
        return {
          success: false,
          previews: [],
          totalGenerated: 0,
          errors: ["No email steps found in sequence"]
        };
      }

      // Get enrolled prospects
      let enrolledQuery = db.query.sequenceProspects.findMany({
        where: and(
          eq(sequenceProspects.sequenceId, params.sequenceId),
          sql`${sequenceProspects.status} IN ('active', 'paused')`
        ),
        limit: 100 // Limit for performance
      });

      const enrollments = await enrolledQuery;

      if (enrollments.length === 0) {
        return {
          success: false,
          previews: [],
          totalGenerated: 0,
          errors: ["No enrolled prospects found in sequence"]
        };
      }

      console.log(`[SequenceExecutor] Found ${enrollments.length} enrollments and ${steps.length} steps`);

      // Generate preview emails for each prospect's next pending step
      for (const enrollment of enrollments) {
        try {
          // Skip if prospectIds filter is provided and this prospect is not in the list
          if (params.prospectIds && !params.prospectIds.includes(enrollment.prospectId)) {
            continue;
          }

          // Get prospect data
          const prospect = await db.query.prospects.findFirst({
            where: and(
              eq(prospects.id, enrollment.prospectId),
              eq(prospects.userId, params.userId) // Multi-tenant security
            )
          });

          if (!prospect) {
            errors.push(`Prospect ${enrollment.prospectId} not found or access denied`);
            continue;
          }

          // Determine last sent step
          const lastSentQueueItem = await db.query.emailQueue.findFirst({
            where: and(
              eq(emailQueue.prospectId, enrollment.prospectId),
              eq(emailQueue.sequenceId, params.sequenceId),
              sql`${emailQueue.status} IN ('sent', 'pending', 'sending', 'scheduled')`
            ),
            orderBy: desc(emailQueue.stepOrder)
          });

          const lastStepOrder = lastSentQueueItem?.stepOrder ?? 0;

          // Generate previews for remaining steps
          for (const step of steps) {
            if ((step.stepOrder ?? 0) <= lastStepOrder) continue;

            // Generate email content using template + merge fields
            let emailSubject = step.subject || '';
            let emailBody = step.body || '';

            // Apply merge fields
            const prospectName = prospect.firstName || 'there';
            const companyName = prospect.companyName || 'your company';

            // Generate fallback content if template is empty
            if (!emailSubject.trim()) {
              emailSubject = step.stepOrder === 1
                ? `Quick question about ${companyName}`
                : `Follow-up: Quick question about ${companyName}`;
            }

            if (!emailBody.trim()) {
              emailBody = `Hi ${prospectName},\n\nI wanted to reach out about opportunities at ${companyName}.\n\nWould you have 15 minutes this week for a quick call?\n\nBest regards`;
            }

            // Apply merge field replacements
            const mergeData: Record<string, string> = {
              '{{firstName}}': prospect.firstName || 'there',
              '{{first_name}}': prospect.firstName || 'there',
              '{{lastName}}': prospect.lastName || '',
              '{{companyName}}': companyName,
              '{{company_name}}': companyName,
              '{{company}}': companyName,
              '{{title}}': prospect.jobTitle || '',
              '{{jobTitle}}': prospect.jobTitle || '',
              '{{email}}': prospect.primaryEmail || '',
            };

            Object.entries(mergeData).forEach(([key, value]) => {
              emailSubject = emailSubject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
              emailBody = emailBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
            });

            // Calculate scheduled time based on delays
            let scheduledFor = new Date();
            if (step.stepOrder && step.stepOrder > 1) {
              const delayDays = step.delayDays || 0;
              scheduledFor = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
            }

            // Store preview in database
            const [previewEntry] = await db.insert(emailQueue).values({
              userId: params.userId,
              prospectId: enrollment.prospectId,
              sequenceId: params.sequenceId,
              subject: emailSubject,
              body: emailBody,
              status: 'preview' as const,
              stepOrder: step.stepOrder ?? 0,
              scheduledFor,
              priority: 5,
            }).returning();

            previews.push({
              id: previewEntry.id,
              prospectId: enrollment.prospectId,
              prospectName: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || 'Unknown',
              prospectEmail: prospect.primaryEmail || '',
              stepOrder: step.stepOrder ?? 0,
              subject: emailSubject,
              body: emailBody,
              status: 'preview',
              scheduledFor,
            });
          }
        } catch (prospectError) {
          const errorMsg = prospectError instanceof Error ? prospectError.message : String(prospectError);
          errors.push(`Error processing prospect ${enrollment.prospectId}: ${errorMsg}`);
        }
      }

      console.log(`[SequenceExecutor] ✅ DRY RUN complete: ${previews.length} previews generated`);

      return {
        success: true,
        previews,
        totalGenerated: previews.length,
        errors,
      };

    } catch (error) {
      console.error("[SequenceExecutor] ❌ DRY RUN failed:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        previews: [],
        totalGenerated: 0,
        errors: [errorMsg],
      };
    }
  }

  /**
   * Get existing preview emails for a sequence.
   */
  async getSequencePreviews(params: {
    sequenceId: string;
    userId: string;
  }): Promise<Array<{
    id: string;
    prospectId: string;
    stepOrder: number;
    subject: string;
    body: string;
    status: string;
    createdAt: Date;
  }>> {
    const results = await db.query.emailQueue.findMany({
      where: and(
        eq(emailQueue.sequenceId, params.sequenceId),
        eq(emailQueue.userId, params.userId),
        eq(emailQueue.status, 'preview')
      ),
      orderBy: (queue, { asc }) => [asc(queue.stepOrder), asc(queue.createdAt)]
    });

    return results.map(r => ({
      id: r.id,
      prospectId: r.prospectId || '',
      stepOrder: r.stepOrder ?? 0,
      subject: r.subject || '',
      body: r.body || '',
      status: r.status || 'preview',
      createdAt: r.createdAt,
    }));
  }

  /**
   * Clear all preview emails for a sequence.
   */
  async clearSequencePreviews(params: {
    sequenceId: string;
    userId: string;
  }): Promise<{ deleted: number }> {
    const result = await db.delete(emailQueue)
      .where(and(
        eq(emailQueue.sequenceId, params.sequenceId),
        eq(emailQueue.userId, params.userId),
        eq(emailQueue.status, 'preview')
      ))
      .returning();

    return { deleted: result.length };
  }
}

export const sequenceExecutorService = new SequenceExecutorService();
