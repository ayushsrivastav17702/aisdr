import { db } from '../db';
import { 
  sequences, sequenceSteps, sequenceProspects, emails, prospects, 
  emailQueue, emailMailboxes, metricsDaily,
  type Sequence, type SequenceStep, type SequenceProspect 
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { generateEmail } from './ai-email-generator.service';
import { emailTrackingService } from './email-tracking.service';

export interface ExecutionResult {
  success: boolean;
  emailsSent: number;
  errors: string[];
  skipped: number;
}

export interface ProspectExecutionStatus {
  prospectId: string;
  currentStepId: string | null;
  nextStepDue: Date | null;
  status: string;
}

class CampaignExecutionService {
  async executeSequence(sequenceId: string, userId: string): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      success: true,
      emailsSent: 0,
      errors: [],
      skipped: 0,
    };

    const [sequence] = await db.select()
      .from(sequences)
      .where(and(
        eq(sequences.id, sequenceId),
        eq(sequences.userId, userId)
      ))
      .limit(1);

    if (!sequence || sequence.status !== 'active') {
      result.success = false;
      result.errors.push('Sequence not found or not active');
      return result;
    }

    const steps = await db.select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);

    if (steps.length === 0) {
      result.success = false;
      result.errors.push('Sequence has no steps');
      return result;
    }

    const enrolledProspects = await db.select()
      .from(sequenceProspects)
      .where(and(
        eq(sequenceProspects.sequenceId, sequenceId),
        eq(sequenceProspects.status, 'active')
      ));

    for (const enrollment of enrolledProspects) {
      try {
        const sent = await this.processProspectStep(enrollment, steps, sequence, userId);
        if (sent) {
          result.emailsSent++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.errors.push(`Error processing prospect ${enrollment.prospectId}: ${error}`);
      }
    }

    return result;
  }

  private async processProspectStep(
    enrollment: SequenceProspect,
    steps: SequenceStep[],
    sequence: Sequence,
    userId: string
  ): Promise<boolean> {
    const currentStepIndex = steps.findIndex(s => s.id === enrollment.currentStepId);
    const actualIndex = currentStepIndex === -1 ? 0 : currentStepIndex;
    const currentStep = steps[actualIndex];
    
    if (!currentStep) return false;

    const now = new Date();
    const lastActivity = enrollment.lastContactedAt || enrollment.enrolledAt;
    
    if (!lastActivity) return false;
    
    const daysSinceLastActivity = Math.floor(
      (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastActivity < currentStep.delayDays) {
      return false;
    }

    const [prospect] = await db.select()
      .from(prospects)
      .where(eq(prospects.id, enrollment.prospectId))
      .limit(1);

    if (!prospect || !prospect.primaryEmail) return false;

    const isFollowUp = actualIndex > 0;
    let parentEmailId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string | undefined;
    let previousEmailContent: string | undefined;
    let previousEmailSubject: string | undefined;
    
    // CRITICAL: Fetch previous email from emailQueue - the authoritative source for messageId
    // The messageId is populated in emailQueue after send, not in emails table
    if (isFollowUp) {
      // Get the most recent SENT email from emailQueue (where messageId is stored)
      const [previousQueuedEmail] = await db.select()
        .from(emailQueue)
        .where(and(
          eq(emailQueue.prospectId, enrollment.prospectId),
          eq(emailQueue.sequenceId, sequence.id),
          eq(emailQueue.status, 'sent'),
          eq(emailQueue.userId, userId),
          sql`${emailQueue.messageId} IS NOT NULL`
        ))
        .orderBy(desc(emailQueue.sentAt))
        .limit(1);
      
      // RFC 5322 Email Threading: Set In-Reply-To and References headers from emailQueue
      if (previousQueuedEmail?.messageId) {
        inReplyTo = previousQueuedEmail.messageId;
        // Build full references chain for proper threading
        references = previousQueuedEmail.references 
          ? `${previousQueuedEmail.references} ${previousQueuedEmail.messageId}`
          : previousQueuedEmail.messageId;
        previousEmailContent = previousQueuedEmail.body;
        previousEmailSubject = previousQueuedEmail.subject;
        console.log(`📧 Threading follow-up email: In-Reply-To=${inReplyTo}`);
      }
      
      // Also get parent from emails table for backward compatibility
      const [previousEmail] = await db.select()
        .from(emails)
        .where(and(
          eq(emails.prospectId, enrollment.prospectId),
          eq(emails.sequenceId, sequence.id)
        ))
        .orderBy(desc(emails.createdAt))
        .limit(1);
      
      parentEmailId = previousEmail?.id;
      
      // Use emails table content if emailQueue didn't have it
      if (!previousEmailContent && previousEmail?.content) {
        previousEmailContent = previousEmail.content;
      }
    }

    let subject = currentStep.subject || '';
    let content = currentStep.body || '';

    if (sequence.aiPersonalizationEnabled) {
      try {
        // CRITICAL: Pass previous email content for thread-aware follow-ups
        const previousEmails = previousEmailContent 
          ? [previousEmailContent.substring(0, 2000)] // Truncate to 2KB for prompt efficiency
          : undefined;
        
        const generated = await generateEmail({
          prospectId: prospect.id,
          emailType: actualIndex === 0 ? 'cold_outreach' : 'follow_up',
          sequenceStep: actualIndex + 1,
          previousEmails,
          tone: 'professional',
        }, prospect);
        subject = generated.subject;
        content = generated.body;
      } catch (error) {
        console.error('Error generating personalized email:', error);
      }
    }

    const mailbox = await this.selectMailbox(userId);
    if (!mailbox) return false;

    const trackingResult = emailTrackingService.generateTrackingPixel(enrollment.prospectId);

    const [email] = await db.insert(emails)
      .values({
        userId,
        prospectId: enrollment.prospectId,
        sequenceId: sequence.id,
        subject,
        content,
        status: 'scheduled',
        aiGenerated: sequence.aiPersonalizationEnabled,
        isFollowUp,
        parentEmailId,
        trackingId: trackingResult.trackingId,
        scheduledFor: new Date(),
      })
      .returning();

    await db.insert(emailQueue)
      .values({
        userId,
        emailId: email.id,
        mailboxId: mailbox.id,
        prospectId: enrollment.prospectId,
        sequenceId: sequence.id,
        subject,
        body: this.wrapWithTracking(content, trackingResult.trackingId),
        status: 'pending',
        priority: 5,
        scheduledFor: new Date(),
        stepOrder: actualIndex + 1,
        // CRITICAL: Email threading headers for RFC 5322 compliance
        inReplyTo,
        references,
      });

    const nextStepIndex = actualIndex + 1;
    const hasMoreSteps = nextStepIndex < steps.length;
    const nextStepId = hasMoreSteps ? steps[nextStepIndex].id : null;

    await db.update(sequenceProspects)
      .set({
        currentStepId: nextStepId,
        lastContactedAt: new Date(),
        status: hasMoreSteps ? 'active' : 'completed',
      })
      .where(eq(sequenceProspects.id, enrollment.id));

    await this.updateDailyMetrics(userId, 1);

    return true;
  }

  private async selectMailbox(userId: string) {
    const [mailbox] = await db.select()
      .from(emailMailboxes)
      .where(and(
        eq(emailMailboxes.userId, userId),
        eq(emailMailboxes.status, 'active')
      ))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return mailbox;
  }

  async enrollProspects(
    sequenceId: string, 
    prospectIds: string[], 
    userId: string
  ): Promise<{ enrolled: number; skipped: number }> {
    let enrolled = 0;
    let skipped = 0;

    const steps = await db.select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder)
      .limit(1);

    const firstStepId = steps[0]?.id || null;

    for (const prospectId of prospectIds) {
      const existing = await db.select()
        .from(sequenceProspects)
        .where(and(
          eq(sequenceProspects.sequenceId, sequenceId),
          eq(sequenceProspects.prospectId, prospectId)
        ))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      await db.insert(sequenceProspects)
        .values({
          sequenceId,
          prospectId,
          status: 'active',
          currentStepId: firstStepId,
        });
      enrolled++;
    }

    await db.update(sequences)
      .set({
        totalProspects: sql`${sequences.totalProspects} + ${enrolled}`,
        updatedAt: new Date(),
      })
      .where(eq(sequences.id, sequenceId));

    return { enrolled, skipped };
  }

  async pauseProspect(sequenceId: string, prospectId: string): Promise<boolean> {
    const result = await db.update(sequenceProspects)
      .set({ status: 'paused' })
      .where(and(
        eq(sequenceProspects.sequenceId, sequenceId),
        eq(sequenceProspects.prospectId, prospectId)
      ))
      .returning();
    return result.length > 0;
  }

  async resumeProspect(sequenceId: string, prospectId: string): Promise<boolean> {
    const result = await db.update(sequenceProspects)
      .set({ status: 'active' })
      .where(and(
        eq(sequenceProspects.sequenceId, sequenceId),
        eq(sequenceProspects.prospectId, prospectId)
      ))
      .returning();
    return result.length > 0;
  }

  async getSequenceStats(sequenceId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
  }> {
    const enrollments = await db.select()
      .from(sequenceProspects)
      .where(eq(sequenceProspects.sequenceId, sequenceId));

    return {
      total: enrollments.length,
      active: enrollments.filter(e => e.status === 'active').length,
      completed: enrollments.filter(e => e.status === 'completed').length,
      replied: enrollments.filter(e => e.status === 'replied').length,
      bounced: enrollments.filter(e => e.status === 'bounced').length,
    };
  }

  async getDueProspects(sequenceId: string): Promise<ProspectExecutionStatus[]> {
    const enrollments = await db.select()
      .from(sequenceProspects)
      .where(and(
        eq(sequenceProspects.sequenceId, sequenceId),
        eq(sequenceProspects.status, 'active')
      ));

    const steps = await db.select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);

    return enrollments.map(e => {
      const currentStepIndex = steps.findIndex(s => s.id === e.currentStepId);
      const currentStep = currentStepIndex !== -1 ? steps[currentStepIndex] : steps[0];
      const lastActivity = e.lastContactedAt || e.enrolledAt;
      let nextStepDue: Date | null = null;
      
      if (currentStep && lastActivity) {
        nextStepDue = new Date(lastActivity);
        nextStepDue.setDate(nextStepDue.getDate() + currentStep.delayDays);
      }

      return {
        prospectId: e.prospectId,
        currentStepId: e.currentStepId,
        nextStepDue,
        status: e.status,
      };
    });
  }

  private wrapWithTracking(content: string, trackingId: string): string {
    const trackingPixel = `<img src="${process.env.BASE_URL || ''}/api/track/open/${trackingId}" width="1" height="1" style="display:none" alt="" />`;
    return `${content}${trackingPixel}`;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private async updateDailyMetrics(userId: string, emailsSent: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const [existing] = await db.select()
      .from(metricsDaily)
      .where(and(
        eq(metricsDaily.userId, userId),
        eq(metricsDaily.date, today)
      ))
      .limit(1);

    if (existing) {
      await db.update(metricsDaily)
        .set({
          emailsSent: sql`${metricsDaily.emailsSent} + ${emailsSent}`,
          updatedAt: new Date(),
        })
        .where(eq(metricsDaily.id, existing.id));
    } else {
      await db.insert(metricsDaily)
        .values({
          userId,
          date: today,
          emailsSent,
        });
    }
  }
}

export const campaignExecutionService = new CampaignExecutionService();
