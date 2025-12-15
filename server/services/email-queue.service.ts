import { db } from "../db";
import { emailQueue, InsertEmailQueueItem, EmailQueueItem, prospects, emails, sequenceProspects, emailMailboxes, automationRuns } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { emailSendingService } from "./email-sending.service";
import { mailboxService } from "./mailbox.service";
import automationService from "./automation.service";
import { Sentry, isSentryEnabled } from "../sentry";
import { notificationService } from "./notification.service";

/**
 * Renders merge fields in email content, replacing {{fieldName}} with actual prospect data.
 * Supports fallback syntax: {{fieldName|fallback text}}
 */
function renderMergeFields(content: string, prospect: any): string {
  if (!content || !prospect) return content;
  
  // Define available merge fields and their values
  const mergeData: Record<string, string> = {
    firstName: prospect.firstName || '',
    lastName: prospect.lastName || '',
    fullName: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '',
    email: prospect.primaryEmail || prospect.email || '',
    companyName: prospect.companyName || prospect.company || '',
    company: prospect.companyName || prospect.company || '',
    title: prospect.title || prospect.jobTitle || '',
    jobTitle: prospect.title || prospect.jobTitle || '',
    industry: prospect.industry || '',
    city: prospect.city || '',
    state: prospect.state || '',
    country: prospect.country || '',
    linkedinUrl: prospect.linkedinUrl || '',
    website: prospect.websiteUrl || prospect.website || '',
  };
  
  // Replace merge fields with fallback support: {{fieldName|fallback}}
  let rendered = content.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (match, fieldName, fallback) => {
    const value = mergeData[fieldName];
    if (value && value.trim()) {
      return value;
    }
    // Use fallback if provided, otherwise use a sensible default
    if (fallback !== undefined) {
      return fallback;
    }
    // Default fallbacks for common fields
    const defaultFallbacks: Record<string, string> = {
      firstName: 'there',
      fullName: 'there',
      companyName: 'your company',
      company: 'your company',
      title: 'your role',
      jobTitle: 'your role',
      industry: 'your industry',
    };
    return defaultFallbacks[fieldName] || '';
  });
  
  // Also replace [Product Name], [key benefit], etc. placeholder text
  // These indicate incomplete templates that should have been customized
  rendered = rendered.replace(/\[Product Name\]/g, 'our solution');
  rendered = rendered.replace(/\[key benefit\]/g, 'save time and increase efficiency');
  rendered = rendered.replace(/\[common pain point\]/g, 'manual processes');
  
  return rendered;
}

export class EmailQueueService {
  async addToQueue(queueData: {
    emailId?: string;
    sequenceId?: string;
    prospectId: string;
    subject: string;
    body: string;
    fromName?: string;
    replyTo?: string;
    scheduledFor: Date;
    priority?: number;
    inReplyTo?: string;
    references?: string;
    stepOrder?: number; // NEW: Track which step in the sequence
    userId: string; // REQUIRED: User ID for multi-tenant mailbox selection
  }): Promise<EmailQueueItem> {
    try {
      // Validate userId is provided (critical for multi-tenant security)
      if (!queueData.userId) {
        throw new Error("userId is required for email queue - multi-tenant security violation");
      }

      // =====================================
      // VALIDATION: Prevent empty emails from being queued
      // =====================================
      const trimmedSubject = (queueData.subject || '').trim();
      const trimmedBody = (queueData.body || '').trim();
      
      if (!trimmedSubject) {
        throw new Error("Cannot queue email with empty subject - AI personalization may have failed");
      }
      
      if (!trimmedBody) {
        throw new Error("Cannot queue email with empty body - AI personalization may have failed");
      }

      // =====================================
      // DEDUPLICATION: Multi-layer protection against duplicate emails
      // Prevents spam while allowing legitimate retry after transient failures
      // =====================================
      
      // LAYER 1: Check for exact duplicate (same prospect, sequence, step)
      // Block if already sent OR currently pending/sending
      // For 'failed': only block if failed recently (within 1 hour) to prevent spam retries
      if (queueData.sequenceId && queueData.stepOrder !== undefined) {
        // First check for sent/pending/sending - always block these
        const existingActiveEmail = await db.query.emailQueue.findFirst({
          where: and(
            eq(emailQueue.prospectId, queueData.prospectId),
            eq(emailQueue.sequenceId, queueData.sequenceId),
            eq(emailQueue.stepOrder, queueData.stepOrder),
            eq(emailQueue.userId, queueData.userId),
            sql`${emailQueue.status} IN ('pending', 'sending', 'sent')`
          )
        });

        if (existingActiveEmail) {
          console.warn(`⚠️ Duplicate email detected: prospect ${queueData.prospectId}, sequence ${queueData.sequenceId}, step ${queueData.stepOrder}, status ${existingActiveEmail.status} - skipping queue`);
          return existingActiveEmail;
        }

        // Check for recently failed emails (within 1 hour) to prevent rapid retry spam
        const recentFailedEmail = await db.query.emailQueue.findFirst({
          where: and(
            eq(emailQueue.prospectId, queueData.prospectId),
            eq(emailQueue.sequenceId, queueData.sequenceId),
            eq(emailQueue.stepOrder, queueData.stepOrder),
            eq(emailQueue.userId, queueData.userId),
            sql`${emailQueue.status} = 'failed'`,
            sql`${emailQueue.createdAt} > NOW() - INTERVAL '1 hour'`
          )
        });

        if (recentFailedEmail) {
          console.warn(`⚠️ Email failed recently for prospect ${queueData.prospectId}, step ${queueData.stepOrder} - wait 1 hour before retrying`);
          return recentFailedEmail;
        }
      }

      // LAYER 2: For FIRST email (step 1), check across ALL sequences  
      // Prevents duplicate first emails when user starts multiple automations for same prospect
      // Only block sent/pending/sending emails within 24 hours
      if (queueData.stepOrder === 1) {
        const recentFirstEmail = await db.query.emailQueue.findFirst({
          where: and(
            eq(emailQueue.prospectId, queueData.prospectId),
            eq(emailQueue.stepOrder, 1),
            eq(emailQueue.userId, queueData.userId),
            sql`${emailQueue.status} IN ('pending', 'sending', 'sent')`,
            sql`${emailQueue.createdAt} > NOW() - INTERVAL '24 hours'`
          )
        });

        if (recentFirstEmail) {
          console.warn(`⚠️ First email already queued/sent for prospect ${queueData.prospectId} within 24 hours (from sequence ${recentFirstEmail.sequenceId}, status: ${recentFirstEmail.status}) - skipping duplicate`);
          return recentFirstEmail;
        }
      }

      // LAYER 3: Global rate limit - prevent ANY email to same prospect within 30 seconds
      const veryRecentEmail = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.prospectId, queueData.prospectId),
          eq(emailQueue.userId, queueData.userId),
          sql`${emailQueue.status} IN ('pending', 'sending', 'sent')`,
          sql`${emailQueue.createdAt} > NOW() - INTERVAL '30 seconds'`
        )
      });

      if (veryRecentEmail) {
        console.warn(`⚠️ Email already queued for prospect ${queueData.prospectId} within last 30 seconds - adding 30s delay`);
        queueData.scheduledFor = new Date(new Date(veryRecentEmail.createdAt).getTime() + 30000);
      }

      // Select mailbox scoped to the user
      const mailbox = await mailboxService.getNextMailbox(queueData.userId);

      const [queueItem] = await db
        .insert(emailQueue)
        .values({
          ...queueData,
          mailboxId: mailbox.id,
          status: "pending",
          priority: queueData.priority || 5,
          stepOrder: queueData.stepOrder || null, // Default to null if not provided
        })
        .returning();

      console.log(`📬 Added email to queue: ${queueItem.id} for user ${queueData.userId} using mailbox ${mailbox.email} (scheduled for ${queueData.scheduledFor})`);
      return queueItem;
    } catch (error) {
      console.error("Failed to add email to queue:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-queue', operation: 'addToQueue' },
          extra: { userId: queueData.userId, prospectId: queueData.prospectId }
        });
      }
      throw error;
    }
  }

  async processPendingEmails(userId?: string): Promise<void> {
    try {
      const now = new Date();
      
      // Build where conditions - CRITICAL: Filter by userId when provided for multi-tenancy
      const whereConditions = [
        eq(emailQueue.status, "pending"),
        lte(emailQueue.scheduledFor, now)
      ];
      
      if (userId) {
        whereConditions.push(eq(emailQueue.userId, userId));
        console.log(`📨 Processing pending emails for user ${userId}...`);
      } else {
        console.log(`📨 Processing pending emails for ALL users (background job)...`);
      }
      
      const pendingEmails = await db
        .select()
        .from(emailQueue)
        .where(and(...whereConditions))
        .orderBy(emailQueue.priority, emailQueue.scheduledFor)
        .limit(50);

      console.log(`📨 Found ${pendingEmails.length} pending emails`);

      for (const email of pendingEmails) {
        // SECURITY: Verify email belongs to the user if userId is provided
        if (userId && email.userId !== userId) {
          console.error(`🚨 SECURITY: Skipping email ${email.id} - belongs to user ${email.userId}, not ${userId}`);
          continue;
        }

        // =====================================
        // RATE LIMITING: Atomically reserve send slot
        // =====================================
        let automationRunId: string | null = null;
        let rateLimitApplied = false;

        // Try to find the automation run for this email (if part of automation)
        if (email.sequenceId && email.prospectId) {
          const seqId = email.sequenceId; // TypeScript narrowing
          const prospId = email.prospectId;
          const sequenceProspect = await db.query.sequenceProspects.findFirst({
            where: (sp, { eq, and }) => 
              and(
                eq(sp.sequenceId, seqId),
                eq(sp.prospectId, prospId)
              )
          });

          if (sequenceProspect?.automationRunId) {
            automationRunId = sequenceProspect.automationRunId;
            rateLimitApplied = true;

            // ATOMICALLY reserve send slot (checks limit, delay, and increments counter)
            const reservation = await automationService.reserveSendSlot(automationRunId);
            
            if (!reservation.success) {
              // Rate limit reached or delay not satisfied
              if (reservation.delayMs > 0 && reservation.nextSendAfter) {
                // Delay not satisfied - reschedule for when delay expires
                await db.update(emailQueue)
                  .set({ 
                    scheduledFor: reservation.nextSendAfter,
                    status: "pending" 
                  })
                  .where(eq(emailQueue.id, email.id));

                console.log(`⏱️ Delay not satisfied, rescheduled email ${email.id} for ${reservation.nextSendAfter.toISOString()} (${reservation.delayMs}ms from now)`);
              } else {
                // Daily limit reached - reschedule for tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(9, 0, 0, 0); // Reschedule for 9 AM tomorrow

                await db.update(emailQueue)
                  .set({ 
                    scheduledFor: tomorrow,
                    status: "pending" 
                  })
                  .where(eq(emailQueue.id, email.id));

                console.log(`⏱️ Daily limit reached, rescheduled email ${email.id} for ${tomorrow.toISOString()}`);
              }
              continue;
            }
            
            // Slot reserved successfully, proceed to send
            console.log(`✅ Send slot reserved for automation ${automationRunId}, sending email ${email.id}`);
          }
        }

        // FALLBACK RATE LIMITING: Check mailbox-level delay even without automation
        // Prevents rapid back-to-back sends for manual/non-automation emails
        if (!rateLimitApplied && email.mailboxId) {
          const [mailbox] = await db
            .select()
            .from(emailMailboxes)
            .where(eq(emailMailboxes.id, email.mailboxId))
            .limit(1);

          if (mailbox && mailbox.lastUsedAt) {
            const minDelayMs = 30000; // 30 second minimum delay between emails
            const lastSendTime = new Date(mailbox.lastUsedAt).getTime();
            const elapsedMs = now.getTime() - lastSendTime;
            
            if (elapsedMs < minDelayMs) {
              const nextSendAfter = new Date(lastSendTime + minDelayMs);
              await db.update(emailQueue)
                .set({ 
                  scheduledFor: nextSendAfter,
                  status: "pending" 
                })
                .where(eq(emailQueue.id, email.id));

              console.log(`⏱️ Mailbox delay not satisfied (${Math.round(elapsedMs/1000)}s < 30s), rescheduled email ${email.id} for ${nextSendAfter.toISOString()}`);
              continue;
            }
          }
        }

        // Process email - reservation already atomic, no need to track success for counter
        await this.processEmail(email);
      }
    } catch (error) {
      console.error("Failed to process pending emails:", error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-queue', operation: 'processPendingEmails' }
        });
      }
    }
  }

  private async processEmail(email: EmailQueueItem): Promise<boolean> {
    let prospect: typeof prospects.$inferSelect | undefined;
    
    try {
      // Fetch prospect to get actual email address
      const [fetchedProspect] = await db
        .select()
        .from(prospects)
        .where(eq(prospects.id, email.prospectId))
        .limit(1);
      
      prospect = fetchedProspect;

      if (!prospect || !prospect.primaryEmail) {
        throw new Error(`Prospect ${email.prospectId} not found or has no email`);
      }

      await db
        .update(emailQueue)
        .set({ status: "sending" })
        .where(eq(emailQueue.id, email.id));

      // CRITICAL: Render merge fields before sending
      // Replace {{firstName}}, {{companyName}}, etc. with actual prospect data
      const renderedSubject = renderMergeFields(email.subject, prospect);
      const renderedBody = renderMergeFields(email.body, prospect);
      
      console.log(`📝 Rendered merge fields for ${prospect.primaryEmail}:`, {
        originalSubject: email.subject.substring(0, 50),
        renderedSubject: renderedSubject.substring(0, 50),
        hadMergeFields: email.subject !== renderedSubject || email.body !== renderedBody
      });

      const result = await emailSendingService.sendEmail({
        mailboxId: email.mailboxId,
        to: prospect.primaryEmail,
        subject: renderedSubject,
        body: renderedBody,
        fromName: email.fromName || undefined,
        trackingId: email.id,
        inReplyTo: email.inReplyTo || undefined,
        references: email.references || undefined,
        userId: email.userId, // CRITICAL: Multi-tenant security for send log
      });

      if (result.success) {
        const sentAt = new Date();
        
        // Update email queue status with rendered content
        await db
          .update(emailQueue)
          .set({
            status: "sent",
            sentAt,
            subject: renderedSubject, // Store rendered subject
            body: renderedBody, // Store rendered body
          })
          .where(eq(emailQueue.id, email.id));

        // Create or update entry in emails table for analytics tracking
        if (email.emailId) {
          // Update existing email record with final body including signature and Message-ID
          await db
            .update(emails)
            .set({
              subject: renderedSubject, // Use rendered subject
              content: result.finalBody || renderedBody, // Use final body with signature
              sentAt,
              status: "sent",
              messageId: result.messageId, // Store Message-ID for threading
            })
            .where(eq(emails.id, email.emailId));
        } else {
          // Create new email record for analytics with final body including signature and Message-ID
          await db.insert(emails).values({
            prospectId: email.prospectId,
            sequenceId: email.sequenceId || null,
            subject: renderedSubject, // Use rendered subject
            content: result.finalBody || renderedBody, // Store final HTML with signature
            status: "sent",
            sentAt,
            trackingId: email.id, // Use queue ID as tracking ID
            messageId: result.messageId, // Store Message-ID for threading
            userId: email.userId, // CRITICAL: Include userId for multi-tenant data isolation
          });
        }

        // =====================================
        // INCREMENT AUTOMATION RUN emailsSent COUNTER
        // =====================================
        if (email.sequenceId && email.prospectId) {
          // Find the automation run for this email
          const seqIdForCounter = email.sequenceId; // TypeScript narrowing
          const prospIdForCounter = email.prospectId;
          const sequenceProspect = await db.query.sequenceProspects.findFirst({
            where: (sp, { eq, and }) => 
              and(
                eq(sp.sequenceId, seqIdForCounter),
                eq(sp.prospectId, prospIdForCounter)
              )
          });

          if (sequenceProspect?.automationRunId) {
            // Increment emailsSent counter on the automation run
            await db.update(automationRuns)
              .set({ 
                emailsSent: sql`COALESCE(${automationRuns.emailsSent}, 0) + 1`
              })
              .where(eq(automationRuns.id, sequenceProspect.automationRunId));

            console.log(`📊 Incremented emailsSent for automation run ${sequenceProspect.automationRunId}`);
          }
        }

        console.log(`✅ Email sent successfully: ${email.id} to ${prospect.primaryEmail}`);
        return true; // Success
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error: any) {
      const attempts = (email.attempts || 0) + 1;
      const maxAttempts = email.maxAttempts || 3;

      if (attempts >= maxAttempts) {
        await db
          .update(emailQueue)
          .set({
            status: "failed",
            failedAt: new Date(),
            lastError: error.message,
            attempts,
          })
          .where(eq(emailQueue.id, email.id));

        console.error(`❌ Email failed after ${attempts} attempts: ${email.id}`);
        
        // Send failed send alert notification
        if (email.userId && prospect) {
          notificationService.notify({
            userId: email.userId,
            type: "failed_send",
            data: {
              prospectName: `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim() || 'Unknown',
              prospectEmail: prospect.primaryEmail || 'Unknown',
              subject: email.subject,
              errorMessage: error.message,
              timestamp: new Date()
            }
          }).catch(err => {
            console.error('Failed to send notification:', err);
          });
        }
      } else {
        await db
          .update(emailQueue)
          .set({
            status: "pending",
            lastError: error.message,
            attempts,
          })
          .where(eq(emailQueue.id, email.id));

        console.log(`🔄 Email retry ${attempts}/${maxAttempts}: ${email.id}`);
      }
      
      return false; // Failed to send
    }
  }

  async getQueueStats(userId?: string): Promise<{
    pending: number;
    sent: number;
    failed: number;
    sending: number;
  }> {
    // CRITICAL: Filter by userId for multi-tenancy when provided
    const query = db
      .select({
        pending: sql<number>`count(*) filter (where ${emailQueue.status} = 'pending')`,
        sending: sql<number>`count(*) filter (where ${emailQueue.status} = 'sending')`,
        sent: sql<number>`count(*) filter (where ${emailQueue.status} = 'sent')`,
        failed: sql<number>`count(*) filter (where ${emailQueue.status} = 'failed')`,
      })
      .from(emailQueue);
    
    const [stats] = userId 
      ? await query.where(eq(emailQueue.userId, userId))
      : await query;

    return {
      pending: Number(stats.pending),
      sending: Number(stats.sending),
      sent: Number(stats.sent),
      failed: Number(stats.failed),
    };
  }

  async getPendingCount(): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailQueue)
      .where(eq(emailQueue.status, "pending"));

    return Number(result.count);
  }

  async cancelEmail(emailId: string): Promise<void> {
    await db
      .update(emailQueue)
      .set({ status: "failed", lastError: "Cancelled by user" })
      .where(eq(emailQueue.id, emailId));
  }

  /**
   * Reschedule pending emails for a prospect after OOO return date
   * Called when we detect an OOO auto-reply with a return date
   */
  async rescheduleForOOO(
    prospectId: string, 
    returnDate: Date, 
    userId: string
  ): Promise<number> {
    try {
      // Add 1 day buffer after return date
      const newScheduleDate = new Date(returnDate);
      newScheduleDate.setDate(newScheduleDate.getDate() + 1);
      newScheduleDate.setHours(9, 0, 0, 0); // Schedule for 9 AM

      // Find all pending emails for this prospect
      const pendingEmails = await db
        .select()
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.prospectId, prospectId),
            eq(emailQueue.userId, userId),
            eq(emailQueue.status, "pending")
          )
        );

      if (pendingEmails.length === 0) {
        console.log(`📭 No pending emails to reschedule for prospect ${prospectId}`);
        return 0;
      }

      // Reschedule each email with sequential timing
      let rescheduledCount = 0;
      for (let i = 0; i < pendingEmails.length; i++) {
        const email = pendingEmails[i];
        const emailScheduleDate = new Date(newScheduleDate);
        emailScheduleDate.setDate(emailScheduleDate.getDate() + i); // Space out by days

        await db
          .update(emailQueue)
          .set({ 
            scheduledFor: emailScheduleDate,
            lastError: `Rescheduled due to OOO - original: ${email.scheduledFor?.toISOString()}`,
          })
          .where(eq(emailQueue.id, email.id));

        rescheduledCount++;
      }

      console.log(`📅 Rescheduled ${rescheduledCount} emails for prospect ${prospectId} after OOO return date ${returnDate.toISOString()}`);
      return rescheduledCount;

    } catch (error) {
      console.error(`❌ Failed to reschedule emails for OOO:`, error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-queue', operation: 'rescheduleForOOO' },
          extra: { prospectId, returnDate, userId }
        });
      }
      return 0;
    }
  }

  /**
   * Mark a prospect's email as bounced and exclude from future sends
   */
  async handleBounce(prospectId: string, userId: string): Promise<void> {
    try {
      // Cancel all pending emails for this prospect
      const result = await db
        .update(emailQueue)
        .set({ 
          status: "cancelled",
          lastError: "Email bounced - address invalid"
        })
        .where(
          and(
            eq(emailQueue.prospectId, prospectId),
            eq(emailQueue.userId, userId),
            eq(emailQueue.status, "pending")
          )
        );

      // Update prospect record to mark as bounced
      await db
        .update(prospects)
        .set({ 
          enrichmentStatus: "failed",
          enrichmentData: sql`COALESCE(${prospects.enrichmentData}, '{}'::jsonb) || '{"emailBounced": true}'::jsonb`
        })
        .where(
          and(
            eq(prospects.id, prospectId),
            eq(prospects.userId, userId)
          )
        );

      console.log(`📭 Handled bounce for prospect ${prospectId} - cancelled pending emails`);

    } catch (error) {
      console.error(`❌ Failed to handle bounce:`, error);
      if (isSentryEnabled()) {
        Sentry.captureException(error, {
          tags: { service: 'email-queue', operation: 'handleBounce' },
          extra: { prospectId, userId }
        });
      }
    }
  }
}

export const emailQueueService = new EmailQueueService();
