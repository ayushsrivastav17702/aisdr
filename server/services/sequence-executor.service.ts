import { db } from "../db";
import { sequenceProspects, emailQueue, sequenceSteps, prospects, emails } from "@shared/schema";
import { eq, and, isNotNull, desc, sql } from "drizzle-orm";
import { emailQueueService } from "./email-queue.service";
import { Sentry, isSentryEnabled } from "../sentry";

export class SequenceExecutorService {
  private executorInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;

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
    
    // Initial check
    this.processNextSteps();
    
    // Set up interval
    this.executorInterval = setInterval(async () => {
      await this.processNextSteps();
    }, intervalMinutes * 60 * 1000);
  }

  stopExecutor(): void {
    if (this.executorInterval) {
      clearInterval(this.executorInterval);
      this.executorInterval = null;
      console.log("🛑 Sequence executor stopped");
    }
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
        return;
      }

      console.log(`[SequenceExecutor] Found ${activeEnrollments.length} active enrollments to check`);
      let processedCount = 0;
      let scheduledCount = 0;
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
          // Use the emails table (canonical sent log) instead of email_queue
          const lastSentEmail = await db.query.emails.findFirst({
            where: and(
              eq(emails.prospectId, enrollment.prospectId),
              eq(emails.sequenceId, enrollment.sequenceId),
              eq(emails.status, 'sent')
            ),
            orderBy: desc(emails.sentAt)
          });
          
          // Determine the next step order from the last sent email's stepOrder
          // CRITICAL: Handle null stepOrder gracefully - if last email has null stepOrder,
          // we can't reliably determine what comes next, so default to 0
          const lastStepOrder = (lastSentEmail?.stepOrder != null) ? lastSentEmail.stepOrder : 0;
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
          const lastEventTime = lastSentEmail?.sentAt || enrollment.enrolledAt;
          
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
      
    } catch (error) {
      console.error("[SequenceExecutor] ❌ Error in processNextSteps:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'sequence-executor', operation: 'processNextSteps' }
        });
      }
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

      // Check if this step is already queued, sent, OR failed (avoid duplicates and retry spam)
      // CRITICAL: Include 'failed' to prevent creating duplicate entries on retry
      const existingQueueItem = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.prospectId, prospectId),
          eq(emailQueue.sequenceId, sequenceId),
          eq(emailQueue.stepOrder, stepConfig.stepOrder), // CRITICAL: Check by step order
          eq(emailQueue.userId, userId), // Multi-tenant scoping
          sql`${emailQueue.status} IN ('pending', 'sending', 'sent', 'failed')` // Include failed to prevent spam
        )
      });

      if (existingQueueItem) {
        console.log(`[SequenceExecutor] Step ${stepConfig.stepOrder} already queued/sent/failed for prospect ${prospectId}, skipping (status: ${existingQueueItem.status})`);
        return;
      }
      
      // Get prospect data for fallback content if not provided
      let prospect = params.prospect;
      if (!prospect) {
        prospect = await db.query.prospects.findFirst({
          where: eq(prospects.id, prospectId)
        });
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
      
      // Add follow-up email to queue
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
}

export const sequenceExecutorService = new SequenceExecutorService();
