import { db } from "../db";
import { prospects } from "../../shared/schema";
import { or, eq, and, ilike } from "drizzle-orm";

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingProspectId?: string;
  matchedOn?: 'email' | 'apollo_id' | 'linkedin' | 'name_company';
}

class DuplicateDetectionService {
  async checkDuplicate(prospectData: {
    primaryEmail?: string;
    apolloId?: string;
    linkedinUrl?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
  }): Promise<DuplicateCheckResult> {
    // Check by email (highest priority)
    if (prospectData.primaryEmail) {
      const existing = await db.query.prospects.findFirst({
        where: eq(prospects.primaryEmail, prospectData.primaryEmail)
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingProspectId: existing.id,
          matchedOn: 'email'
        };
      }
    }

    // Check by Apollo ID
    if (prospectData.apolloId) {
      const existing = await db.query.prospects.findFirst({
        where: eq(prospects.apolloId, prospectData.apolloId)
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingProspectId: existing.id,
          matchedOn: 'apollo_id'
        };
      }
    }

    // Check by LinkedIn URL
    if (prospectData.linkedinUrl) {
      const normalizedUrl = this.normalizeLinkedInUrl(prospectData.linkedinUrl);
      const existing = await db.query.prospects.findFirst({
        where: eq(prospects.linkedinUrl, normalizedUrl)
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingProspectId: existing.id,
          matchedOn: 'linkedin'
        };
      }
    }

    // Check by name + company (fuzzy match)
    if (prospectData.firstName && prospectData.lastName && prospectData.companyName) {
      const existing = await db.query.prospects.findFirst({
        where: and(
          ilike(prospects.firstName, prospectData.firstName),
          ilike(prospects.lastName, prospectData.lastName),
          ilike(prospects.companyName, prospectData.companyName)
        )
      });

      if (existing) {
        return {
          isDuplicate: true,
          existingProspectId: existing.id,
          matchedOn: 'name_company'
        };
      }
    }

    return {
      isDuplicate: false
    };
  }

  async bulkCheckDuplicates(prospectsData: Array<{
    primaryEmail?: string;
    apolloId?: string;
    linkedinUrl?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
  }>): Promise<Map<number, DuplicateCheckResult>> {
    const results = new Map<number, DuplicateCheckResult>();

    for (let i = 0; i < prospectsData.length; i++) {
      const result = await this.checkDuplicate(prospectsData[i]);
      results.set(i, result);
    }

    return results;
  }

  async findSimilarProspects(prospectId: string): Promise<any[]> {
    const prospect = await db.query.prospects.findFirst({
      where: eq(prospects.id, prospectId)
    });

    if (!prospect) return [];

    const conditions = [];

    // Find by email domain
    if (prospect.primaryEmail) {
      const domain = prospect.primaryEmail.split('@')[1];
      if (domain) {
        conditions.push(ilike(prospects.primaryEmail, `%@${domain}`));
      }
    }

    // Find by company
    if (prospect.companyName) {
      conditions.push(ilike(prospects.companyName, prospect.companyName));
    }

    if (conditions.length === 0) return [];

    const similar = await db.select().from(prospects).where(
      or(...conditions)
    ).limit(20);

    return similar.filter(p => p.id !== prospectId);
  }

  private normalizeLinkedInUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash
      return `https://linkedin.com${pathname}`;
    } catch {
      return url.toLowerCase().replace(/\/$/, '');
    }
  }

  async mergeDuplicates(keepProspectId: string, mergeProspectIds: string[]): Promise<void> {
    // Get the prospect to keep
    const keepProspect = await db.query.prospects.findFirst({
      where: eq(prospects.id, keepProspectId)
    });

    if (!keepProspect) {
      throw new Error('Prospect to keep not found');
    }

    for (const mergeId of mergeProspectIds) {
      const mergeProspect = await db.query.prospects.findFirst({
        where: eq(prospects.id, mergeId)
      });

      if (!mergeProspect) continue;

      // Merge data (fill in missing fields from duplicate)
      const merged = {
        firstName: keepProspect.firstName || mergeProspect.firstName,
        lastName: keepProspect.lastName || mergeProspect.lastName,
        fullName: keepProspect.fullName || mergeProspect.fullName,
        primaryEmail: keepProspect.primaryEmail || mergeProspect.primaryEmail,
        secondaryEmail: keepProspect.secondaryEmail || mergeProspect.secondaryEmail,
        jobTitle: keepProspect.jobTitle || mergeProspect.jobTitle,
        seniority: keepProspect.seniority || mergeProspect.seniority,
        department: keepProspect.department || mergeProspect.department,
        companyName: keepProspect.companyName || mergeProspect.companyName,
        companyDomain: keepProspect.companyDomain || mergeProspect.companyDomain,
        companySize: keepProspect.companySize || mergeProspect.companySize,
        companyIndustry: keepProspect.companyIndustry || mergeProspect.companyIndustry,
        companyLocation: keepProspect.companyLocation || mergeProspect.companyLocation,
        contactLocation: keepProspect.contactLocation || mergeProspect.contactLocation,
        phoneNumber: keepProspect.phoneNumber || mergeProspect.phoneNumber,
        linkedinUrl: keepProspect.linkedinUrl || mergeProspect.linkedinUrl,
        apolloId: keepProspect.apolloId || mergeProspect.apolloId,
        enrichmentData: {
          ...(keepProspect.enrichmentData as any || {}),
          ...(mergeProspect.enrichmentData as any || {})
        },
        updatedAt: new Date()
      };

      // Update the keep prospect with merged data
      await db.update(prospects)
        .set(merged)
        .where(eq(prospects.id, keepProspectId));

      // Delete the duplicate
      await db.delete(prospects).where(eq(prospects.id, mergeId));
    }
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();