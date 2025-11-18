import { db } from "../db";
import { 
  prospects, 
  sequenceSteps, 
  personalizationResults,
  type Prospect,
  type SequenceStep
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emailQueueService } from "./email-queue.service";
import { intelligentPersonalizationService } from "./intelligent-personalization.service";
import { generateEmail } from "./ai-email-generator.service";
import type { RequestContext } from "../storage";

interface ScheduleFirstEmailParams {
  sequenceProspectId: string;
  sequenceId: string;
  prospectId: string;
  automationRunId: string;
  aiPersonalizationEnabled: boolean;
  userId: string; // Required for multi-tenant security
}

class SequenceStepService {
  /**
   * Schedules the first email step for a newly enrolled prospect.
   * Includes optional AI personalization and initial delay calculation.
   * 
   * This is the critical orchestrator that connects prospect enrollment to email sending.
   */
  async scheduleFirstEmail(params: ScheduleFirstEmailParams): Promise<void> {
    const {
      sequenceProspectId,
      sequenceId,
      prospectId,
      automationRunId,
      aiPersonalizationEnabled,
      userId
    } = params;

    console.log(`[SequenceStep] Scheduling first email for prospect ${prospectId} in sequence ${sequenceId}, AI: ${aiPersonalizationEnabled}`);

    try {
      // =====================================
      // STEP 1: Fetch prospect data and first EMAIL step
      // =====================================
      // Note: We query for first email step (not just stepOrder=1) because
      // sequences might start with manual/task steps
      const [prospect, allSteps] = await Promise.all([
        db.query.prospects.findFirst({
          where: and(
            eq(prospects.id, prospectId),
            eq(prospects.userId, userId) // SECURITY: Multi-tenant check
          )
        }),
        db.query.sequenceSteps.findMany({
          where: and(
            eq(sequenceSteps.sequenceId, sequenceId),
            eq(sequenceSteps.stepType, 'email')
          ),
          orderBy: (steps, { asc }) => [asc(steps.stepOrder)]
        })
      ]);

      // Graceful fallback if prospect is missing (might have been deleted)
      if (!prospect) {
        console.warn(`[SequenceStep] Prospect ${prospectId} not found - marking sequence prospect as failed`);
        
        // Mark as failed so automation doesn't retry repeatedly
        const { sequenceProspects: sequenceProspectsTable } = await import("@shared/schema");
        await db.update(sequenceProspectsTable)
          .set({ 
            status: "failed",
            completedAt: new Date()
          })
          .where(eq(sequenceProspectsTable.id, sequenceProspectId));
        
        return; // Skip this prospect with terminal status
      }

      // Get first email step (lowest stepOrder among email steps)
      const firstStep = allSteps[0];
      
      if (!firstStep) {
        console.warn(`[SequenceStep] No email steps found for sequence ${sequenceId} - marking as completed`);
        
        // Mark as completed (no emails to send)
        const { sequenceProspects: sequenceProspectsTable } = await import("@shared/schema");
        await db.update(sequenceProspectsTable)
          .set({ 
            status: "completed",
            completedAt: new Date()
          })
          .where(eq(sequenceProspectsTable.id, sequenceProspectId));
        
        return; // No email steps in sequence
      }

      // Start with default content from sequence step
      let subject = firstStep.subject;
      let body = firstStep.body;

      // =====================================
      // STEP 2: Conditional AI Personalization
      // =====================================
      if (aiPersonalizationEnabled) {
        console.log(`[SequenceStep] AI personalization enabled - generating personalized email for prospect ${prospectId}`);
        
        try {
          // Create request context for multi-tenant operations
          const ctx: RequestContext = {
            userId,
            roles: [] // Empty roles array for automation context
          };

          // Analyze prospect to get insights
          const insights = await intelligentPersonalizationService.analyzeProspect(ctx, prospectId);
          
          console.log(`[SequenceStep] Analysis complete - recommended tone: ${insights.recommendations.tone}`);

          // Generate personalized email using insights
          const generatedEmail = await generateEmail({
            prospectId,
            emailType: 'cold_outreach',
            tone: insights.recommendations.tone as any,
            sequenceStep: 1,
            customContext: {
              prospectCompany: prospect.companyName || undefined,
              prospectTitle: prospect.jobTitle || undefined,
              prospectIndustry: prospect.companyIndustry || undefined
            }
          });

          // Use AI-generated content
          subject = generatedEmail.subject;
          body = generatedEmail.body;

          console.log(`[SequenceStep] AI email generated - subject: "${subject.substring(0, 50)}..."`);

          // Save personalization results for analytics (with userId for multi-tenant security)
          await db.insert(personalizationResults).values({
            prospectId,
            userId, // CRITICAL: Multi-tenant security - required field
            personalizationScore: generatedEmail.confidenceScore || 85,
            insights: insights as any,
            emailSuggestions: {
              subject: generatedEmail.subject,
              body: generatedEmail.body,
              reasoning: generatedEmail.reasoning,
              factors: generatedEmail.personalizationFactors
            }
          });

          console.log(`[SequenceStep] Personalization results saved for prospect ${prospectId}`);

        } catch (aiError) {
          // AI personalization failed - fall back to template
          console.error(`[SequenceStep] AI personalization failed, using template:`, aiError);
          console.log(`[SequenceStep] Falling back to default template for prospect ${prospectId}`);
          // subject and body remain as default from firstStep
        }
      } else {
        console.log(`[SequenceStep] AI personalization disabled - using default template`);
      }

      // =====================================
      // STEP 3: Calculate scheduled send time
      // =====================================
      // Convert delayDays to milliseconds and add to current time
      const delayMs = firstStep.delayDays * 24 * 60 * 60 * 1000;
      const scheduledFor = new Date(Date.now() + delayMs);

      console.log(`[SequenceStep] Email scheduled for ${scheduledFor.toISOString()} (delay: ${firstStep.delayDays} days)`);

      // =====================================
      // STEP 4: Add email to queue (BEFORE updating currentStepId)
      // =====================================
      // Important: Add to queue first, then update progress.
      // If enqueue fails, we don't want to show progress without an actual scheduled email.
      await emailQueueService.addToQueue({
        prospectId,
        sequenceId,
        subject,
        body,
        scheduledFor,
        stepOrder: firstStep.stepOrder, // CRITICAL: Track sequence progress
        userId, // CRITICAL: Multi-tenant security
        priority: 5, // Standard priority for first email
        fromName: undefined, // Will use mailbox default
      });

      console.log(`[SequenceStep] ✅ First email queued successfully for prospect ${prospectId}`);

      // =====================================
      // STEP 5: Update progress AFTER successful enqueue
      // =====================================
      const { sequenceProspects: sequenceProspectsTable } = await import("@shared/schema");
      await db.update(sequenceProspectsTable)
        .set({ currentStepId: firstStep.id })
        .where(eq(sequenceProspectsTable.id, sequenceProspectId));

      console.log(`[SequenceStep] Updated sequence prospect currentStepId to step ${firstStep.stepOrder}`);

    } catch (error) {
      console.error(`[SequenceStep] ❌ Failed to schedule first email for prospect ${prospectId}:`, error);
      throw error;
    }
  }

  /**
   * Cancels all future pending emails for a prospect in a sequence.
   * Called when a prospect replies or unsubscribes to stop the sequence.
   * 
   * @param sequenceId - The sequence ID
   * @param prospectId - The prospect ID
   * @param userId - User ID for multi-tenant security
   * @returns Number of cancelled emails
   */
  async cancelFutureSteps(sequenceId: string, prospectId: string, userId?: string): Promise<number> {
    try {
      console.log(`[SequenceStep] Cancelling future steps for prospect ${prospectId} in sequence ${sequenceId}`);
      
      const { emailQueue: emailQueueTable } = await import("@shared/schema");
      
      // Build where conditions with multi-tenant security
      const whereConditions = [
        eq(emailQueueTable.sequenceId, sequenceId),
        eq(emailQueueTable.prospectId, prospectId),
        eq(emailQueueTable.status, "pending") // Only cancel jobs that haven't been sent
      ];
      
      // CRITICAL: Scope by userId if provided for multi-tenant security
      if (userId) {
        whereConditions.push(eq(emailQueueTable.userId, userId));
      }
      
      // Find all pending email queue items for this prospect/sequence
      const futureSteps = await db.select()
        .from(emailQueueTable)
        .where(and(...whereConditions));
        
      if (futureSteps.length > 0) {
        // Update the status of all found jobs to 'cancelled' (terminal state)
        // CRITICAL: Use the same where conditions to ensure multi-tenant security
        await db.update(emailQueueTable)
          .set({ 
            status: "cancelled", // Use "cancelled" status - processors will skip this
            lastError: "Sequence cancelled: Prospect replied or unsubscribed"
          })
          .where(and(...whereConditions));
        
        console.log(`✅ Cancelled ${futureSteps.length} future emails for prospect ${prospectId}`);
        return futureSteps.length;
      }
      
      console.log(`[SequenceStep] No pending emails found to cancel for prospect ${prospectId}`);
      return 0;
    } catch (error) {
      console.error(`[SequenceStep] ❌ Error cancelling future steps:`, error);
      throw error;
    }
  }

  /**
   * Schedule a follow-up email (for future implementation)
   * Called after a prospect completes a step to schedule the next one
   */
  async scheduleNextEmail(params: {
    sequenceProspectId: string;
    currentStepOrder: number;
    prospectId: string;
    sequenceId: string;
    userId: string;
  }): Promise<void> {
    // TODO: Implement next step scheduling for follow-ups
    // This will be called by reply detection or time-based triggers
    console.log(`[SequenceStep] TODO: Schedule next email after step ${params.currentStepOrder}`);
  }
}

export default new SequenceStepService();
