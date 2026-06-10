import { storage, type RequestContext } from "../storage";
import { emailQueueService } from "./email-queue.service";
import { db } from "../db";
import { sequenceProspects, prospects, personalizationResults } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * FIX-2: Schedule within 9am-5pm local business hours, skipping weekends.
 * Uses Intl (no external deps) to work in prospect's IANA timezone.
 */
export function getNextBusinessHour(delayDays: number, tz: string = 'UTC'): Date {
  const safeTz = (() => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return tz; }
    catch { return 'UTC'; }
  })();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MS_PER_HOUR = 60 * 60 * 1000;
  const getLocalParts = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone: safeTz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(d);
  const getHour = (d: Date): number =>
    parseInt(getLocalParts(d).find(p => p.type === 'hour')?.value ?? '12', 10);
  const getDow = (d: Date): string =>
    getLocalParts(d).find(p => p.type === 'weekday')?.value ?? 'Mon';
  const skipWeekend = (d: Date): Date => {
    let cur = d;
    while (getDow(cur) === 'Sat' || getDow(cur) === 'Sun')
      cur = new Date(cur.getTime() + MS_PER_DAY);
    return cur;
  };
  let target = skipWeekend(new Date(Date.now() + delayDays * MS_PER_DAY));
  const h = getHour(target);
  if (h < 9) target = new Date(target.getTime() + (9 - h) * MS_PER_HOUR);
  else if (h >= 17) {
    target = skipWeekend(new Date(target.getTime() + (24 - h + 9) * MS_PER_HOUR));
  }
  return target;
}

/**
 * Initialize a sequence when activated/launched: enrolls all currently-enrolled
 * prospects into the queue for the first sequence step, scheduling delivery
 * within their local business hours, and using any pre-generated personalized
 * email content from the PersonalizationWizard if available.
 *
 * Shared by both server/sequences-routes.ts (PUT/PATCH /api/sequences/:id)
 * and server/routes/campaigns.routes.ts (POST /api/campaigns/:id/launch).
 */
export async function initializeSequence(userContext: RequestContext, sequenceId: string): Promise<void> {
  try {
    console.log(`🚀 Initializing sequence ${sequenceId}...`);

    // Get sequence details to check aiPersonalizationEnabled flag
    const sequence = await storage.getSequence(userContext, sequenceId);
    if (!sequence) {
      console.log(`  ❌ Sequence ${sequenceId} not found`);
      return;
    }
    const usePersonalization = sequence.aiPersonalizationEnabled === true;
    console.log(`  AI Personalization: ${usePersonalization ? 'enabled' : 'disabled'}`);

    // Get all enrolled prospects
    const enrolledProspects = await storage.getSequenceProspects(userContext, sequenceId);
    console.log(`  Found ${enrolledProspects.length} enrolled prospects`);

    if (enrolledProspects.length === 0) {
      console.log(`  ⚠️ No prospects enrolled, skipping initialization`);
      return;
    }

    // Get sequence steps
    const steps = await storage.getSequenceSteps(userContext, sequenceId);
    console.log(`  Found ${steps.length} sequence steps`);

    if (steps.length === 0) {
      console.log(`  ⚠️ No steps found, skipping initialization`);
      return;
    }

    // Sort steps by order and get first step
    const sortedSteps = steps.sort((a, b) => a.stepOrder - b.stepOrder);
    const firstStep = sortedSteps[0];
    console.log(`  First step: ${firstStep.subject} (ID: ${firstStep.id})`);

    // Initialize each prospect
    for (const enrolledProspect of enrolledProspects) {
      // Set current step if not already set
      if (!enrolledProspect.currentStepId) {
        await db
          .update(sequenceProspects)
          .set({ currentStepId: firstStep.id })
          .where(eq(sequenceProspects.id, enrolledProspect.id));
        console.log(`  📌 Set current step for prospect ${enrolledProspect.prospectId}`);
      }

      // FIX-2: Calculate scheduled time using business-hours window in prospect's timezone
      const prospectRecord = await db.query.prospects.findFirst({
        where: eq(prospects.id, enrolledProspect.prospectId)
      });
      const prospectTimezone = (prospectRecord as any)?.timezone || 'UTC';
      const scheduledFor = getNextBusinessHour(firstStep.delayDays || 0, prospectTimezone);
      console.log(`  🕘 Scheduled first email at ${scheduledFor.toISOString()} (tz: ${prospectTimezone})`);

      // Start with template content
      let emailSubject = firstStep.subject;
      let emailBody = firstStep.body;

      // ALWAYS check for pre-generated personalized emails (from PersonalizationWizard)
      // These are explicitly created by the user, so we should always use them
      const allPersonalizations = await db.query.personalizationResults.findMany({
        where: and(
          eq(personalizationResults.prospectId, enrolledProspect.prospectId),
          eq(personalizationResults.userId, userContext.userId)
        ),
        orderBy: (pr, { desc }) => [desc(pr.createdAt)],
        limit: 10
      });

      // STRICT: Only use personalization that matches THIS specific sequence
      const matchingPersonalization = allPersonalizations.find(p => {
        const emailSuggestions = p.emailSuggestions as { sequenceId?: string } | null;
        return emailSuggestions?.sequenceId === sequenceId;
      });

      if (matchingPersonalization?.emailSuggestions) {
        const savedEmail = matchingPersonalization.emailSuggestions as { subject?: string; body?: string; generatedAt?: string; sequenceId?: string };

        if (savedEmail.subject && savedEmail.body) {
          emailSubject = savedEmail.subject;
          emailBody = savedEmail.body;
          console.log(`  ✨ Using pre-generated personalized email for prospect ${enrolledProspect.prospectId} (generated: ${savedEmail.generatedAt || 'unknown'})`);
        }
      } else if (usePersonalization) {
        // No pre-generated email found, and AI personalization is enabled
        // The aiPersonalizationEnabled flag controls ON-THE-FLY generation (done elsewhere)
        console.log(`  ℹ️ No pre-generated email found for prospect ${enrolledProspect.prospectId}, using template`);
      }

      // Add email to queue with personalized content (or template fallback)
      // CRITICAL: Include stepOrder for deduplication to prevent duplicate emails
      // Skip SafeToSend during initialization - it will be checked when email is processed/sent
      await emailQueueService.addToQueue({
        sequenceId,
        prospectId: enrolledProspect.prospectId,
        subject: emailSubject,
        body: emailBody,
        scheduledFor,
        priority: 5,
        userId: userContext.userId,
        stepOrder: firstStep.stepOrder, // Required for deduplication check
        skipSafeToSendCheck: true, // Check happens during send, not scheduling
      });

      console.log(`  ✅ Added email to queue for prospect ${enrolledProspect.prospectId}`);
    }

    console.log(`🎉 Sequence ${sequenceId} initialized successfully!`);
  } catch (error) {
    console.error(`❌ Failed to initialize sequence ${sequenceId}:`, error);
    throw error;
  }
}
