import { db } from "@db";
import { unsubscribes, emailQueue, automationExclusionLog, prospects } from "@shared/schema";
import { eq, and, or } from "drizzle-orm";
import type { RequestContext } from "../middleware/request-context";

export interface ExclusionCheckResult {
  excluded: boolean;
  reason?: "unsubscribed" | "previously_contacted" | "duplicate";
}

export class ExclusionService {
  /**
   * Checks if a prospect should be excluded based on global rules.
   * All checks are user-scoped for multi-tenant safety.
   * 
   * @param ctx - Request context with userId
   * @param email - The prospect's email to check
   * @returns Exclusion result with reason if excluded
   */
  static async checkGlobalExclusions(
    ctx: RequestContext,
    email: string
  ): Promise<ExclusionCheckResult> {
    const userId = ctx.userId;
    
    if (!email) {
      return { excluded: false };
    }

    // Check 1: GLOBAL UNSUBSCRIBED
    const isUnsubscribed = await db.query.unsubscribes.findFirst({
      where: and(
        eq(unsubscribes.userId, userId),
        eq(unsubscribes.email, email)
      )
    });
    
    if (isUnsubscribed) {
      return { excluded: true, reason: "unsubscribed" };
    }

    // Check 2: DUPLICATE (existing prospect)
    const existingProspect = await db.query.prospects.findFirst({
      where: and(
        eq(prospects.userId, userId),
        eq(prospects.primaryEmail, email)
      )
    });
    
    if (existingProspect) {
      // Check 3: PREVIOUSLY CONTACTED/SENT
      const hasBeenContacted = await db.query.emailQueue.findFirst({
        where: and(
          eq(emailQueue.userId, userId),
          eq(emailQueue.prospectId, existingProspect.id),
          or(
            eq(emailQueue.status, "sent"),
            eq(emailQueue.status, "sending")
          )
        )
      });
      
      if (hasBeenContacted) {
        return { excluded: true, reason: "previously_contacted" };
      }
      
      // Prospect exists but hasn't been contacted - still a duplicate
      return { excluded: true, reason: "duplicate" };
    }

    return { excluded: false };
  }

  /**
   * Logs an exclusion for dashboard visibility and debugging.
   * 
   * @param ctx - Request context with userId
   * @param automationRunId - The automation run ID
   * @param prospectEmail - The excluded prospect's email
   * @param reason - Why the prospect was excluded
   */
  static async logExclusion(
    ctx: RequestContext,
    automationRunId: string,
    prospectEmail: string,
    reason: string
  ): Promise<void> {
    await db.insert(automationExclusionLog).values({
      userId: ctx.userId,
      automationRunId,
      prospectEmail,
      reason
    });
  }
}
