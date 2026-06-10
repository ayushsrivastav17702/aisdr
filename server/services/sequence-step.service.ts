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
import { resolveTokens, type TokenContext } from "./token-resolution.service";
import type { RequestContext } from "../storage";

interface ScheduleFirstEmailParams {
  sequenceProspectId: string;
  sequenceId: string;
  prospectId: string;
  automationRunId: string;
  aiPersonalizationEnabled: boolean;
  contentItemIds?: string[]; // Content library items for AI personalization
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
      contentItemIds,
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
        console.log(`[SequenceStep] AI personalization enabled - checking for pre-generated email for prospect ${prospectId}`);
        
        try {
          // Create request context for multi-tenant operations
          const ctx: RequestContext = {
            userId,
            roles: [] // Empty roles array for automation context
          };

          // FIRST: Check for pre-generated personalized email from PersonalizationWizard
          // Query all recent personalization results for this prospect/user
          const allPersonalizations = await db.query.personalizationResults.findMany({
            where: and(
              eq(personalizationResults.prospectId, prospectId),
              eq(personalizationResults.userId, userId)
            ),
            orderBy: (pr, { desc }) => [desc(pr.createdAt)],
            limit: 10 // Check recent ones
          });

          // Find one that matches this sequence (or fall back to most recent if none match)
          let matchingPersonalization = allPersonalizations.find(p => {
            const emailSuggestions = p.emailSuggestions as { sequenceId?: string } | null;
            return emailSuggestions?.sequenceId === sequenceId;
          });
          
          // If no sequence-specific match, check if most recent has subject/body (for backward compat)
          if (!matchingPersonalization && allPersonalizations.length > 0) {
            const recent = allPersonalizations[0];
            const emailSuggestions = recent.emailSuggestions as { subject?: string; body?: string; sequenceId?: string } | null;
            // Only use if it has no sequenceId (legacy) or matches current sequence
            if (emailSuggestions?.subject && emailSuggestions?.body && !emailSuggestions?.sequenceId) {
              matchingPersonalization = recent;
              console.log(`[SequenceStep] Using legacy personalization (no sequenceId) for prospect ${prospectId}`);
            }
          }

          if (matchingPersonalization?.emailSuggestions) {
            const savedEmail = matchingPersonalization.emailSuggestions as { subject?: string; body?: string; generatedAt?: string; sequenceId?: string };
            
            if (savedEmail.subject && savedEmail.body) {
              // Use pre-generated email instead of generating new one
              subject = savedEmail.subject;
              body = savedEmail.body;
              
              console.log(`[SequenceStep] ✅ Using pre-generated personalized email for prospect ${prospectId} (sequence: ${savedEmail.sequenceId || 'any'}, generated: ${savedEmail.generatedAt || 'unknown'})`);
              
              // Skip AI generation, go directly to queue email
            } else {
              // Pre-generated email incomplete, fall through to generate new one
              console.log(`[SequenceStep] Pre-generated email incomplete, generating new one for prospect ${prospectId}`);
            }
          }
          
          // Only generate new email if we didn't use a pre-generated one
          if (subject === firstStep.subject && body === firstStep.body) {
            console.log(`[SequenceStep] No pre-generated email found - generating new personalized email for prospect ${prospectId}`);
            
            // Analyze prospect to get insights
            const insights = await intelligentPersonalizationService.analyzeProspect(ctx, prospectId);
          
            console.log(`[SequenceStep] Analysis complete - recommended tone: ${insights.recommendations.tone}`);

            // Generate personalized email using insights
            // CRITICAL: Pass the already-fetched prospect to avoid "Prospect not found" errors
            const generatedEmail = await generateEmail({
              prospectId,
              emailType: 'cold_outreach',
              tone: insights.recommendations.tone as any,
              sequenceStep: 1,
              contentItemIds, // Pass selected content library items
              customContext: {
                prospectCompany: prospect.companyName || undefined,
                prospectTitle: prospect.jobTitle || undefined,
                prospectIndustry: prospect.companyIndustry || undefined
              }
            }, prospect);

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
          }

        } catch (aiError) {
          // AI personalization failed - generate fallback content with prospect data
          console.error(`[SequenceStep] AI personalization failed:`, aiError);
          
          // CRITICAL: Generate fallback content using available prospect data
          // Don't rely on template which may contain placeholders like [Product Name]
          const prospectName = prospect.firstName || 'there';
          const companyName = prospect.companyName || 'your company';
          const industry = prospect.companyIndustry || 'your industry';
          const jobTitle = prospect.jobTitle || 'professional';
          
          // Check if template has unresolved placeholders like [Product Name]
          const hasUnresolvedPlaceholders = (text: string) => /\[.*?\]/.test(text);
          
          // Use template ONLY if it exists AND doesn't have unresolved placeholders
          const templateSubjectUsable = firstStep.subject && 
            firstStep.subject.trim() && 
            !hasUnresolvedPlaceholders(firstStep.subject);
            
          const templateBodyUsable = firstStep.body && 
            firstStep.body.trim() && 
            !hasUnresolvedPlaceholders(firstStep.body);
          
          if (templateSubjectUsable) {
            subject = firstStep.subject;
          } else {
            subject = `Quick question about ${companyName}`;
          }
          
          if (templateBodyUsable) {
            body = firstStep.body;
          } else {
            // Generate a clean fallback email without any placeholders
            body = `<p>Hi ${prospectName},</p>

<p>I work with ${industry} companies like ${companyName} to help optimize their operations and drive better results.</p>

<p>Given your role as ${jobTitle}, I thought you might be interested in learning how we've helped similar organizations improve efficiency and reduce costs.</p>

<p>Would you be open to a quick 15-minute call to discuss how we could help ${companyName}?</p>

<p>Best regards</p>`;
          }
          
          console.log(`[SequenceStep] Using fallback content (template had placeholders: ${hasUnresolvedPlaceholders(firstStep.body || '')}) - subject: "${subject.substring(0, 50)}..."`);
        }
      } else {
        console.log(`[SequenceStep] AI personalization disabled - using default template`);
        
        // CRITICAL: If template is empty, generate fallback content
        if (!subject || !subject.trim() || !body || !body.trim()) {
          const prospectName = prospect.firstName || 'there';
          const companyName = prospect.companyName || 'your company';
          
          if (!subject || !subject.trim()) {
            subject = `Quick question about ${companyName}`;
          }
          
          if (!body || !body.trim()) {
            body = `Hi ${prospectName},

I noticed ${companyName} and thought you might be interested in how we help companies streamline their operations.

Would you be open to a quick 15-minute call to discuss how we could help?

Best regards`;
          }
          
          console.log(`[SequenceStep] Template was empty, using generated fallback content`);
        }
      }

      // =====================================
      // STEP 3: Calculate scheduled send time
      // =====================================
      // Convert delayDays to milliseconds and add to current time
      const delayMs = firstStep.delayDays * 24 * 60 * 60 * 1000;
      const scheduledFor = new Date(Date.now() + delayMs);

      console.log(`[SequenceStep] Email scheduled for ${scheduledFor.toISOString()} (delay: ${firstStep.delayDays} days)`);

      // =====================================
      // STEP 3.5: Resolve custom tokens (including {{custom_ai_line}})
      // =====================================
      // Check if content contains {{custom_ai_line}} or other advanced tokens
      // that need async resolution before queuing
      const hasCustomAiLine = subject.includes('{{custom_ai_line}}') || body.includes('{{custom_ai_line}}');
      
      if (hasCustomAiLine) {
        console.log(`[SequenceStep] Resolving custom AI tokens for prospect ${prospectId}`);
        
        const tokenContext: TokenContext = {
          prospect,
          sequenceStep: firstStep.stepOrder,
        };
        
        try {
          // Resolve tokens in subject
          if (subject.includes('{{custom_ai_line}}')) {
            const subjectResult = await resolveTokens(subject, tokenContext);
            subject = subjectResult.resolvedContent;
            if (subjectResult.warnings.length > 0) {
              console.warn(`[SequenceStep] Token warnings in subject:`, subjectResult.warnings);
            }
          }
          
          // Resolve tokens in body
          if (body.includes('{{custom_ai_line}}')) {
            const bodyResult = await resolveTokens(body, tokenContext);
            body = bodyResult.resolvedContent;
            if (bodyResult.warnings.length > 0) {
              console.warn(`[SequenceStep] Token warnings in body:`, bodyResult.warnings);
            }
            if (bodyResult.customAiLineGenerated) {
              console.log(`[SequenceStep] ✅ Custom AI line generated and stored for prospect ${prospectId}`);
            }
          }
        } catch (tokenError) {
          console.error(`[SequenceStep] Token resolution failed, continuing with original content:`, tokenError);
          // Continue with unresolved tokens - they'll be handled/warned in email queue
        }
      }

      // =====================================
      // STEP 4: Add email to queue (BEFORE updating currentStepId)
      // =====================================
      // Important: Add to queue first, then update progress.
      // If enqueue fails, we don't want to show progress without an actual scheduled email.
      // Skip SafeToSend during scheduling - it will be checked when email is processed/sent
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
        skipSafeToSendCheck: true, // Check happens during send, not scheduling
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
}

export default new SequenceStepService();
