import { db } from "../db";
import { emailQueue, InsertEmailQueueItem, EmailQueueItem, prospects, emails, sequenceProspects, emailMailboxes, automationRuns } from "@shared/schema";
import { eq, and, lte, sql } from "drizzle-orm";
import { emailSendingService } from "./email-sending.service";
import { mailboxService } from "./mailbox.service";
import automationService from "./automation.service";
import { Sentry, isSentryEnabled } from "../sentry";
import { notificationService } from "./notification.service";
import { emailVerificationService } from "./email-verification.service";
import { hardeningService } from "./hardening.service";
import { observability } from "./observability.service";
import { schedulerMonitoringService } from "./scheduler-monitoring.service";

/**
 * Renders merge fields in email content, replacing {{fieldName}} with actual prospect data.
 * Supports fallback syntax: {{fieldName|fallback text}}
 * Returns both the rendered content and validation info about unresolved fields.
 */
export function renderMergeFields(content: string, prospect: any): { 
  rendered: string; 
  unresolvedFields: string[];
  usedFallbacks: string[];
} {
  if (!content || !prospect) return { rendered: content, unresolvedFields: [], usedFallbacks: [] };
  
  const unresolvedFields: string[] = [];
  const usedFallbacks: string[] = [];
  
  // Define available merge fields and their values (both camelCase and snake_case)
  const mergeData: Record<string, string> = {
    firstName: prospect.firstName || '',
    first_name: prospect.firstName || '',
    lastName: prospect.lastName || '',
    last_name: prospect.lastName || '',
    fullName: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '',
    full_name: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '',
    prospectName: prospect.firstName || '',
    prospect_name: prospect.firstName || '',
    email: prospect.primaryEmail || prospect.email || '',
    companyName: prospect.companyName || prospect.company || '',
    company_name: prospect.companyName || prospect.company || '',
    company: prospect.companyName || prospect.company || '',
    title: prospect.title || prospect.jobTitle || '',
    jobTitle: prospect.title || prospect.jobTitle || '',
    job_title: prospect.title || prospect.jobTitle || '',
    position: prospect.title || prospect.jobTitle || '',
    industry: prospect.industry || prospect.companyIndustry || '',
    city: prospect.city || '',
    state: prospect.state || '',
    country: prospect.country || '',
    location: [prospect.city, prospect.state].filter(Boolean).join(', ') || '',
    linkedinUrl: prospect.linkedinUrl || '',
    linkedin_url: prospect.linkedinUrl || '',
    website: prospect.websiteUrl || prospect.website || '',
    seniority: prospect.seniority || '',
  };
  
  // Default fallbacks for common fields (both camelCase and snake_case)
  const defaultFallbacks: Record<string, string> = {
    firstName: 'there',
    first_name: 'there',
    fullName: 'there',
    full_name: 'there',
    prospect_name: 'there',
    prospectName: 'there',
    companyName: 'your company',
    company_name: 'your company',
    company: 'your company',
    title: 'your role',
    jobTitle: 'your role',
    job_title: 'your role',
    industry: 'your industry',
    location: 'your area',
    seniority: 'leader',
  };
  
  // Helper to normalize field names (camelCase ↔ snake_case)
  const normalizeKey = (key: string): string[] => {
    const keys = [key];
    // camelCase to snake_case: firstName -> first_name
    keys.push(key.replace(/([A-Z])/g, '_$1').toLowerCase());
    // snake_case to camelCase: first_name -> firstName
    keys.push(key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
    return keys;
  };
  
  const getValue = (fieldName: string): string | undefined => {
    for (const key of normalizeKey(fieldName)) {
      if (mergeData[key] && mergeData[key].trim()) {
        return mergeData[key];
      }
    }
    return undefined;
  };
  
  const getFallback = (fieldName: string): string | undefined => {
    for (const key of normalizeKey(fieldName)) {
      if (defaultFallbacks[key]) {
        return defaultFallbacks[key];
      }
    }
    return undefined;
  };
  
  // Replace merge fields with fallback support: {{fieldName|fallback}}
  let rendered = content.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (match, fieldName, fallback) => {
    const value = getValue(fieldName);
    if (value) {
      return value;
    }
    // Use inline fallback if provided
    if (fallback !== undefined) {
      usedFallbacks.push(`${fieldName}→"${fallback}"`);
      return fallback;
    }
    // Use default fallback if available (check both camelCase and snake_case)
    const defaultFallback = getFallback(fieldName);
    if (defaultFallback) {
      usedFallbacks.push(`${fieldName}→"${defaultFallback}"`);
      return defaultFallback;
    }
    // No fallback available - track as unresolved but still replace with empty string
    unresolvedFields.push(fieldName);
    return ''; // Remove the placeholder rather than leaving it visible
  });
  
  // CRITICAL: Also replace bracket placeholders from legacy templates
  // These indicate incomplete templates that should have been customized
  const bracketReplacements: Record<string, string> = {
    '[Product Name]': 'our solution',
    '[key benefit]': 'save time and increase efficiency',
    '[common pain point]': 'manual processes',
    '[specific problem]': 'key challenges',
    '[specific result]': 'significant results',
    '[specific results]': 'great results',
    '[Company X]': 'similar companies',
    '[new features/results]': 'new features',
    '[solution]': 'our solution',
    '[specific challenge]': 'your goals',
    '[Attach relevant resources or links]': ''
  };
  
  Object.entries(bracketReplacements).forEach(([placeholder, replacement]) => {
    if (rendered.includes(placeholder)) {
      usedFallbacks.push(`${placeholder}→"${replacement}"`);
      rendered = rendered.split(placeholder).join(replacement);
    }
  });
  
  // Log warnings for unresolved fields
  if (unresolvedFields.length > 0) {
    console.warn(`⚠️ PRE-SEND VALIDATION: Unresolved merge fields detected: ${unresolvedFields.join(', ')}`);
  }
  
  return { rendered, unresolvedFields, usedFallbacks };
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

      // Generate idempotency key to prevent duplicate sends
      const idempotencyKey = queueData.sequenceId && queueData.stepOrder !== undefined && queueData.prospectId
        ? `${queueData.sequenceId}:${queueData.stepOrder}:${queueData.prospectId}`
        : null;

      const [queueItem] = await db
        .insert(emailQueue)
        .values({
          ...queueData,
          mailboxId: mailbox.id,
          status: "pending",
          priority: queueData.priority || 5,
          stepOrder: queueData.stepOrder || null,
          idempotencyKey,
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
    const startTime = Date.now();
    let processedCount = 0;
    let failedCount = 0;

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
      
      // Backpressure: Limit batch size for controlled processing
      const BATCH_LIMIT = 50;
      
      const pendingEmails = await db
        .select()
        .from(emailQueue)
        .where(and(...whereConditions))
        .orderBy(emailQueue.priority, emailQueue.scheduledFor)
        .limit(BATCH_LIMIT);

      console.log(`📨 Found ${pendingEmails.length} pending emails`);

      // Import hardening service for kill switch check
      const { hardeningService } = await import("./hardening.service");
      const { users } = await import("@shared/schema");
      
      // Cache paused org checks and user->org mappings to avoid repeated DB calls
      const pausedOrgs = new Set<string>();
      const activeOrgs = new Set<string>();
      const userOrgMap = new Map<string, string | null>();
      
      for (const email of pendingEmails) {
        // SECURITY: Verify email belongs to the user if userId is provided
        if (userId && email.userId !== userId) {
          console.error(`🚨 SECURITY: Skipping email ${email.id} - belongs to user ${email.userId}, not ${userId}`);
          continue;
        }
        
        // KILL SWITCH: Check if user's org automation is paused
        // Lookup user's organizationId (with caching)
        let orgId = userOrgMap.get(email.userId);
        if (orgId === undefined) {
          const [user] = await db.select({ organizationId: users.organizationId })
            .from(users)
            .where(eq(users.id, email.userId))
            .limit(1);
          orgId = user?.organizationId || null;
          userOrgMap.set(email.userId, orgId);
        }
        
        if (orgId) {
          if (pausedOrgs.has(orgId)) {
            console.log(`⏸️ Skipping email ${email.id} - org ${orgId} automation paused`);
            continue;
          }
          if (!activeOrgs.has(orgId)) {
            const isPaused = await hardeningService.isAutomationPaused(orgId);
            if (isPaused) {
              pausedOrgs.add(orgId);
              console.log(`⏸️ Skipping email ${email.id} - org ${orgId} automation paused`);
              continue;
            }
            activeOrgs.add(orgId);
          }
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
        const success = await this.processEmail(email);
        processedCount++;
        if (!success) {
          failedCount++;
        }
      }

      // Record heartbeat after processing batch
      const processingMs = Date.now() - startTime;
      await schedulerMonitoringService.recordHeartbeat("email_queue", {
        processedCount,
        failedCount,
        processingMs,
      });

      console.log(`📨 Batch complete: processed ${processedCount}, failed ${failedCount}, took ${processingMs}ms`);
    } catch (error) {
      console.error("Failed to process pending emails:", error);

      // Record heartbeat with error
      const processingMs = Date.now() - startTime;
      await schedulerMonitoringService.recordHeartbeat("email_queue", {
        processedCount,
        failedCount,
        processingMs,
        error: error instanceof Error ? error.message : "Unknown error",
      });

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
      // ========================================
      // DEFENSIVE SAFEGUARDS: Check pause/limits before processing
      // ========================================
      
      // Check if user is paused (cascade: user → manager → tenant)
      const { paused, reason, pauseLevel } = await hardeningService.isUserFullyPaused(email.userId);
      if (paused) {
        console.warn(`🚫 [Background Worker] Email ${email.id} blocked - user ${email.userId} paused at ${pauseLevel} level: ${reason}`);
        
        // Emit observability event for pause-based deferral
        const orgId = await hardeningService.getOrganizationIdForUser(email.userId);
        observability.emitThrottleViolation({
          organizationId: orgId || 'unknown',
          userId: email.userId,
          counterType: `pause_${pauseLevel || 'user'}`,
          currentCount: 0,
          limit: 0,
        });
        
        // Track deferrals separately from send attempts to prevent infinite loops
        const currentDeferrals = email.deferralAttempts || 0;
        const maxPauseDeferrals = 48; // 48 * 30 min = 24 hours max wait
        
        if (currentDeferrals >= maxPauseDeferrals) {
          await db.update(emailQueue)
            .set({ 
              status: 'failed',
              failedAt: new Date(),
              lastError: `Max pause deferrals exceeded (${maxPauseDeferrals}). User still paused at ${pauseLevel} level.`,
            })
            .where(eq(emailQueue.id, email.id));
          return false;
        }
        
        // Re-queue for later with delay and increment deferral count
        await db.update(emailQueue)
          .set({ 
            scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30 minutes
            lastError: `Paused at ${pauseLevel} level: ${reason}`,
            deferralAttempts: currentDeferrals + 1,
          })
          .where(eq(emailQueue.id, email.id));
        
        return false;
      }
      
      // Check daily email limit
      const { allowed, current, limit, reason: limitReason } = await hardeningService.canUserSendEmail(email.userId);
      if (!allowed) {
        console.warn(`🚫 [Background Worker] Email ${email.id} blocked - user ${email.userId} daily limit exceeded: ${current}/${limit}`);
        
        // Emit observability event
        const orgId = await hardeningService.getOrganizationIdForUser(email.userId);
        observability.emitThrottleViolation({
          organizationId: orgId || 'unknown',
          userId: email.userId,
          counterType: 'daily_emails',
          currentCount: current,
          limit,
        });
        
        // Track deferrals separately for daily limit
        const currentDeferrals = email.deferralAttempts || 0;
        const maxDailyLimitDeferrals = 7; // 7 days max wait
        
        if (currentDeferrals >= maxDailyLimitDeferrals) {
          await db.update(emailQueue)
            .set({ 
              status: 'failed',
              failedAt: new Date(),
              lastError: `Max daily limit deferrals exceeded (${maxDailyLimitDeferrals} days). User consistently at limit.`,
            })
            .where(eq(emailQueue.id, email.id));
          return false;
        }
        
        // Re-queue for next day with deferral tracking
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0); // 8 AM next day
        
        await db.update(emailQueue)
          .set({ 
            scheduledFor: tomorrow,
            lastError: limitReason || 'Daily email limit exceeded',
            deferralAttempts: currentDeferrals + 1,
          })
          .where(eq(emailQueue.id, email.id));
        
        return false;
      }
      
      // ========================================
      // DEMO MODE CHECK: Skip real email sends for demo tenants
      // ========================================
      const demoCheck = await this.checkDemoMode(email.userId);
      if (demoCheck.isDemoMode) {
        console.log(`🎭 [Demo Mode] Email ${email.id} simulated (not sent) - tenant is in demo mode`);
        
        await db.update(emailQueue)
          .set({ 
            status: 'sent',
            sentAt: new Date(),
            lastError: 'Demo mode: Email simulated (not actually sent)',
          })
          .where(eq(emailQueue.id, email.id));
        
        return true; // Simulate success without sending
      }
      
      // ========================================
      // END DEFENSIVE SAFEGUARDS
      // ========================================
      
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
      const subjectResult = renderMergeFields(email.subject, prospect);
      const bodyResult = renderMergeFields(email.body, prospect);
      const renderedSubject = subjectResult.rendered;
      const renderedBody = bodyResult.rendered;
      
      // Collect all unresolved fields and log validation results
      const allUnresolvedFields = Array.from(new Set([...subjectResult.unresolvedFields, ...bodyResult.unresolvedFields]));
      const allUsedFallbacks = Array.from(new Set([...subjectResult.usedFallbacks, ...bodyResult.usedFallbacks]));
      
      console.log(`📝 Rendered merge fields for ${prospect.primaryEmail}:`, {
        originalSubject: email.subject.substring(0, 50),
        renderedSubject: renderedSubject.substring(0, 50),
        hadMergeFields: email.subject !== renderedSubject || email.body !== renderedBody,
        usedFallbacks: allUsedFallbacks.length > 0 ? allUsedFallbacks : 'none',
        unresolvedFields: allUnresolvedFields.length > 0 ? allUnresolvedFields : 'none'
      });
      
      // PRE-SEND VALIDATION: Warn about unresolved fields but still send
      if (allUnresolvedFields.length > 0) {
        console.warn(`⚠️ PRE-SEND VALIDATION WARNING: Email ${email.id} has ${allUnresolvedFields.length} unresolved fields: ${allUnresolvedFields.join(', ')}`);
      }

      // EMAIL VERIFICATION: Validate recipient email before sending
      const emailValidation = await emailVerificationService.verifyEmail(prospect.primaryEmail);
      
      if (!emailValidation.isValid) {
        console.warn(`⚠️ EMAIL VERIFICATION FAILED for ${prospect.primaryEmail}:`, emailValidation.errors);
        
        // For disposable emails or invalid syntax, mark as failed
        if (!emailValidation.syntaxValid || emailValidation.isDisposable) {
          await db
            .update(emailQueue)
            .set({ 
              status: "failed", 
              lastError: `Email verification failed: ${emailValidation.errors.join(', ')}`,
              failedAt: new Date()
            })
            .where(eq(emailQueue.id, email.id));
          
          console.error(`❌ Email ${email.id} failed verification - skipping send to ${prospect.primaryEmail}`);
          return false;
        }
        
        // For MX record issues, log warning but attempt send (email might still work)
        console.warn(`⚠️ MX record issue for ${prospect.primaryEmail}, attempting send anyway...`);
      } else {
        console.log(`✅ Email verified: ${prospect.primaryEmail} (risk: ${emailValidation.riskScore})`);
      }
      
      // Skip high-risk emails (disposable, invalid domain)
      if (emailValidation.riskScore >= 80) {
        console.warn(`⚠️ High risk email (score: ${emailValidation.riskScore}), skipping: ${prospect.primaryEmail}`);
        await db
          .update(emailQueue)
          .set({ 
            status: "failed", 
            lastError: `High risk email (score: ${emailValidation.riskScore})`,
            failedAt: new Date()
          })
          .where(eq(emailQueue.id, email.id));
        return false;
      }

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
        
        // Update email queue status with rendered content and Message-ID (reset deferral counter on success)
        // CRITICAL: Store messageId in emailQueue - this is the authoritative source for threading
        await db
          .update(emailQueue)
          .set({
            status: "sent",
            sentAt,
            subject: renderedSubject, // Store rendered subject
            body: renderedBody, // Store rendered body
            messageId: result.messageId, // CRITICAL: Store Message-ID for RFC 5322 threading
            deferralAttempts: 0, // Reset deferral counter on successful send
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
          const seqIdForCounter = email.sequenceId;
          const prospIdForCounter = email.prospectId;
          
          // Find the automation run for this email
          const sequenceProspect = await db.query.sequenceProspects.findFirst({
            where: (sp, { eq, and }) => 
              and(
                eq(sp.sequenceId, seqIdForCounter),
                eq(sp.prospectId, prospIdForCounter)
              )
          });

          let automationRunId = sequenceProspect?.automationRunId;
          
          // Fallback: If no automationRunId on sequence_prospect, find a run that was active when email was sent
          // CRITICAL: Only attribute to runs that started before or at email send time
          if (!automationRunId) {
            const candidateRuns = await db.select()
              .from(automationRuns)
              .where(
                and(
                  eq(automationRuns.sequenceId, seqIdForCounter),
                  eq(automationRuns.userId, email.userId),
                  // Run must have started before or at email send time
                  sql`${automationRuns.startedAt} <= ${sentAt}`
                )
              )
              .orderBy(sql`${automationRuns.startedAt} DESC`)
              .limit(1);
            
            const activeRun = candidateRuns[0];
            
            // Only use if run was active (not completed before email was sent)
            if (activeRun && (!activeRun.completedAt || new Date(activeRun.completedAt) >= sentAt)) {
              automationRunId = activeRun.id;
              
              // Backfill the automationRunId on the sequence_prospect for future
              if (sequenceProspect) {
                await db.update(sequenceProspects)
                  .set({ automationRunId })
                  .where(eq(sequenceProspects.id, sequenceProspect.id));
                console.log(`🔗 Backfilled automationRunId on sequence_prospect ${sequenceProspect.id}`);
              }
            }
          }

          if (automationRunId) {
            await db.update(automationRuns)
              .set({ 
                emailsSent: sql`COALESCE(${automationRuns.emailsSent}, 0) + 1`
              })
              .where(eq(automationRuns.id, automationRunId));

            console.log(`📊 Incremented emailsSent for automation run ${automationRunId}`);
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
        // Classify failure reason for debugging
        const failureReason = this.classifyFailureReason(error.message);

        await db
          .update(emailQueue)
          .set({
            status: "failed",
            failedAt: new Date(),
            lastError: error.message,
            failureReason,
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
        // Exponential backoff: 2^attempts minutes (2min, 4min, 8min...)
        // Caps at 30 minutes to prevent excessive delays
        const backoffMinutes = Math.min(Math.pow(2, attempts), 30);
        const nextScheduledFor = new Date(Date.now() + backoffMinutes * 60 * 1000);
        
        await db
          .update(emailQueue)
          .set({
            status: "pending",
            lastError: error.message,
            attempts,
            scheduledFor: nextScheduledFor, // Delay retry with exponential backoff
          })
          .where(eq(emailQueue.id, email.id));

        console.log(`🔄 Email retry ${attempts}/${maxAttempts}: ${email.id} (next attempt in ${backoffMinutes}min)`);
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

  private classifyFailureReason(errorMessage: string): string {
    const message = errorMessage.toLowerCase();

    if (message.includes("smtp") || message.includes("connection")) {
      return "smtp_connection_error";
    }
    if (message.includes("authentication") || message.includes("auth")) {
      return "authentication_error";
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      return "rate_limit_exceeded";
    }
    if (message.includes("bounce") || message.includes("invalid email")) {
      return "invalid_recipient";
    }
    if (message.includes("mailbox") || message.includes("not found")) {
      return "mailbox_error";
    }
    if (message.includes("timeout")) {
      return "timeout_error";
    }
    if (message.includes("quota") || message.includes("limit exceeded")) {
      return "quota_exceeded";
    }
    if (message.includes("blocked") || message.includes("spam")) {
      return "blocked_by_provider";
    }

    return "unknown_error";
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

  /**
   * Check if a user's organization is in demo mode
   * Demo mode simulates email sends without actually sending them
   */
  private async checkDemoMode(userId: string): Promise<{ isDemoMode: boolean; reason?: string }> {
    try {
      // First get user's organizationId
      const user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.id, userId),
        columns: { organizationId: true }
      });

      if (!user?.organizationId) {
        return { isDemoMode: false };
      }

      const orgId = user.organizationId;
      
      // Check tenant configuration for demo mode
      const tenantConfig = await db.query.tenantConfiguration.findFirst({
        where: (tc, { eq }) => eq(tc.organizationId, orgId),
        columns: { demoModeEnabled: true, demoModeReason: true }
      });

      if (tenantConfig?.demoModeEnabled) {
        return { 
          isDemoMode: true, 
          reason: tenantConfig.demoModeReason || 'Demo mode enabled for this organization' 
        };
      }

      return { isDemoMode: false };
    } catch (error) {
      console.error('Failed to check demo mode:', error);
      return { isDemoMode: false }; // Fail open - allow sends if check fails
    }
  }
}

export const emailQueueService = new EmailQueueService();
