import { db } from "../db";
import { prospects, unsubscribes, emails, type Prospect } from "@shared/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";

export interface ExclusionRules {
  skipUnsubscribed?: boolean;
  skipDuplicates?: boolean;
  skipContacted?: boolean;
  contactedWithinDays?: number; // Only skip if contacted within N days (default: 30)
}

export interface ExclusionStats {
  totalCandidates: number;
  removedByUnsubscribe: number;
  removedByDuplicate: number;
  removedByContacted: number;
  remaining: number;
  removedEmails: string[]; // For logging/debugging
}

class ExclusionFilterService {
  /**
   * Filter prospect candidates based on exclusion rules
   * Returns filtered list and statistics about what was excluded
   */
  async filterProspects(
    candidateProspects: Array<{ primaryEmail: string; [key: string]: any }>,
    userId: string,
    exclusionRules: ExclusionRules = {}
  ): Promise<{ filtered: typeof candidateProspects; stats: ExclusionStats }> {
    const {
      skipUnsubscribed = true,
      skipDuplicates = true,
      skipContacted = true,
      contactedWithinDays = 30,
    } = exclusionRules;

    const stats: ExclusionStats = {
      totalCandidates: candidateProspects.length,
      removedByUnsubscribe: 0,
      removedByDuplicate: 0,
      removedByContacted: 0,
      remaining: 0,
      removedEmails: [],
    };

    if (candidateProspects.length === 0) {
      return { filtered: [], stats };
    }

    // Extract all emails for batch queries
    const emails = candidateProspects
      .map(p => p.primaryEmail)
      .filter(Boolean);

    if (emails.length === 0) {
      return { filtered: [], stats };
    }

    // Batch query 1: Check for unsubscribed emails
    let unsubscribedEmails = new Set<string>();
    if (skipUnsubscribed) {
      const unsubscribeRecords = await db.query.unsubscribes.findMany({
        where: (unsub, { inArray }) => inArray(unsub.email, emails),
        columns: {
          email: true,
        },
      });
      unsubscribedEmails = new Set(unsubscribeRecords.map(u => u.email));
      console.log(`[Exclusion Filter] Found ${unsubscribedEmails.size} unsubscribed emails`);
    }

    // Batch query 2: Check for duplicate prospects (already in user's database)
    let existingEmails = new Set<string>();
    if (skipDuplicates) {
      const existingProspects = await db.query.prospects.findMany({
        where: (prospects, { inArray, eq, and }) =>
          and(
            eq(prospects.userId, userId),
            inArray(prospects.primaryEmail, emails)
          ),
        columns: {
          primaryEmail: true,
        },
      });
      existingEmails = new Set(existingProspects.map(p => p.primaryEmail).filter(Boolean) as string[]);
      console.log(`[Exclusion Filter] Found ${existingEmails.size} duplicate emails`);
    }

    // Batch query 3: Check for recently contacted prospects
    let contactedEmails = new Set<string>();
    if (skipContacted && contactedWithinDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - contactedWithinDays);

      // Query email_queue for sent emails (more reliable than emails table)
      const recentlySentEmails = await db.query.emailQueue.findMany({
        where: (emailQueue, { inArray, eq, gte, and }) =>
          and(
            eq(emailQueue.userId, userId),
            eq(emailQueue.status, "sent"),
            gte(emailQueue.sentAt, cutoffDate)
          ),
        columns: {
          prospectId: true,
        },
      });

      // Get prospect emails for the contacted prospect IDs
      if (recentlySentEmails.length > 0) {
        const contactedProspectIds = recentlySentEmails.map(e => e.prospectId);
        const contactedProspects = await db.query.prospects.findMany({
          where: (prospects, { inArray }) => inArray(prospects.id, contactedProspectIds),
          columns: {
            primaryEmail: true,
          },
        });
        contactedEmails = new Set(contactedProspects.map(p => p.primaryEmail).filter(Boolean) as string[]);
      }
      
      console.log(`[Exclusion Filter] Found ${contactedEmails.size} recently contacted emails (within ${contactedWithinDays} days)`);
    }

    // Filter prospects based on all exclusion rules
    const filtered = candidateProspects.filter(candidate => {
      const email = candidate.primaryEmail;
      if (!email) return false;

      if (skipUnsubscribed && unsubscribedEmails.has(email)) {
        stats.removedByUnsubscribe++;
        stats.removedEmails.push(email);
        return false;
      }

      if (skipDuplicates && existingEmails.has(email)) {
        stats.removedByDuplicate++;
        stats.removedEmails.push(email);
        return false;
      }

      if (skipContacted && contactedEmails.has(email)) {
        stats.removedByContacted++;
        stats.removedEmails.push(email);
        return false;
      }

      return true;
    });

    stats.remaining = filtered.length;

    console.log(`[Exclusion Filter] Filtered ${candidateProspects.length} candidates -> ${filtered.length} remaining`);
    console.log(`[Exclusion Filter] Removed: ${stats.removedByUnsubscribe} unsubscribed, ${stats.removedByDuplicate} duplicates, ${stats.removedByContacted} contacted`);

    return { filtered, stats };
  }

  /**
   * Get exclusion preview (dry-run) without actually filtering
   * Useful for showing users how many prospects will be excluded before running
   */
  async getExclusionPreview(
    emailList: string[],
    userId: string,
    exclusionRules: ExclusionRules = {}
  ): Promise<ExclusionStats> {
    const dummyProspects = emailList.map(email => ({ primaryEmail: email }));
    const { stats } = await this.filterProspects(dummyProspects, userId, exclusionRules);
    return stats;
  }
}

export default new ExclusionFilterService();
