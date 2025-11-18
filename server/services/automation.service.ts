import { db } from "../db";
import { 
  automationRuns, 
  sequenceProspects,
  type AutomationRun,
  type InsertAutomationRun 
} from "@shared/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";
import { apolloService } from "./apollo.service";
import exclusionFilterService, { type ExclusionRules } from "./exclusion-filter.service";

class AutomationService {
  /**
   * Main automation processing function
   * Runs in background after automation is started
   */
  async processAutomation(
    automationRunId: string,
    sequenceId: string,
    prospectSource: "apollo" | "existing",
    prospectCount: number,
    aiPersonalizationEnabled: boolean,
    apolloFilters: any | undefined,
    userId: string // Required for multi-tenant mailbox selection
  ): Promise<void> {
    console.log(`[Automation ${automationRunId}] Starting automation...`);
    console.log(`[Automation ${automationRunId}] Source: ${prospectSource}, Sequence: ${sequenceId}, Prospects: ${prospectCount}, AI: ${aiPersonalizationEnabled}`);

    try {
      // Get exclusion rules from automation run config
      const automationRun = await db.query.automationRuns.findFirst({
        where: (runs, { eq }) => eq(runs.id, automationRunId)
      });

      const exclusionRules: ExclusionRules = (automationRun?.exclusionRules as ExclusionRules) || {
        skipUnsubscribed: true,
        skipDuplicates: true,
        skipContacted: true,
        contactedWithinDays: 30
      };

      console.log(`[Automation ${automationRunId}] Exclusion rules:`, exclusionRules);

      let savedProspectIds: string[] = [];

      if (prospectSource === "existing") {
        // =====================================
        // STEP 1A: Use existing prospects from database (USER-SCOPED)
        // =====================================
        console.log(`[Automation ${automationRunId}] Using existing prospects for user ${userId}...`);
        
        const { prospects: prospectsTable } = await import("@shared/schema");
        const existingProspects = await db.select({ id: prospectsTable.id })
          .from(prospectsTable)
          .where(eq(prospectsTable.userId, userId)) // CRITICAL: Filter by userId for multi-tenancy
          .limit(prospectCount);
        
        if (existingProspects.length === 0) {
          throw new Error('No existing prospects found in database for this user');
        }

        savedProspectIds = existingProspects.map(p => p.id);
        console.log(`[Automation ${automationRunId}] Found ${savedProspectIds.length} existing prospects for user ${userId}`);

        // Update automation run with prospects added
        await db.update(automationRuns)
          .set({ prospectsAdded: savedProspectIds.length })
          .where(eq(automationRuns.id, automationRunId));

      } else {
        // =====================================
        // STEP 1B: Fetch prospects from Apollo with pagination
        // =====================================
        console.log(`[Automation ${automationRunId}] Fetching ${prospectCount} prospects from Apollo...`);
        
        const allContacts: any[] = [];
      
      // Try multiple search strategies from most specific to least specific
      const searchStrategies = [
        // Strategy 1: Full filters with exact matching
        {
          name: 'Full filters',
          params: apolloFilters
        },
        // Strategy 2: Keyword-only search (most flexible)
        {
          name: 'Keyword search',
          params: {
            q_keywords: [
              apolloFilters.person_titles?.[0],
              apolloFilters.q_organization_name,
              apolloFilters.person_locations?.[0]
            ].filter(Boolean).join(' ')
          }
        },
        // Strategy 3: Job title + keyword search
        {
          name: 'Title and keywords',
          params: {
            person_titles: apolloFilters.person_titles,
            q_keywords: [apolloFilters.q_organization_name, apolloFilters.person_locations?.[0]]
              .filter(Boolean).join(' ')
          }
        },
        // Strategy 4: Just job title (broadest)
        {
          name: 'Title only',
          params: apolloFilters.person_titles?.[0] ? {
            q_keywords: apolloFilters.person_titles[0]
          } : null
        }
      ].filter(s => s.params);

      let strategyUsed = '';
      
      for (const strategy of searchStrategies) {
        console.log(`[Automation ${automationRunId}] Trying strategy: ${strategy.name}`);
        
        let currentPage = 1;
        const perPage = 100; // Apollo max per page
        const tempContacts: any[] = [];
        
        while (tempContacts.length < prospectCount) {
          const apolloSearchParams = {
            ...strategy.params,
            page: currentPage,
            per_page: perPage,
          };

          try {
            const searchResponse = await apolloService.searchContacts(apolloSearchParams);
            const contacts = searchResponse.people || searchResponse.contacts || [];

            if (contacts.length === 0) {
              break;
            }

            tempContacts.push(...contacts);
            console.log(`[Automation ${automationRunId}] Fetched page ${currentPage}: ${contacts.length} prospects (total: ${tempContacts.length})`);

            if (tempContacts.length >= prospectCount || contacts.length < perPage) {
              break;
            }

            currentPage++;
          } catch (error) {
            console.error(`[Automation ${automationRunId}] Error with ${strategy.name}:`, error);
            break;
          }
        }

        if (tempContacts.length > 0) {
          allContacts.push(...tempContacts);
          strategyUsed = strategy.name;
          console.log(`[Automation ${automationRunId}] ✅ Success with ${strategy.name}: ${tempContacts.length} prospects`);
          break;
        }
      }

      if (allContacts.length === 0) {
        throw new Error('No prospects found from Apollo with any search strategy. Try broader search terms.');
      }
      
      console.log(`[Automation ${automationRunId}] Used strategy: ${strategyUsed}`);


        // Trim to requested count (we'll filter more after exclusion)
        const candidateContacts = allContacts.slice(0, prospectCount * 2); // Get extra to account for filtering
        console.log(`[Automation ${automationRunId}] Found ${candidateContacts.length} candidate prospects from Apollo`);

        // =====================================
        // STEP 1.5: Apply exclusion filtering BEFORE saving
        // =====================================
        // Convert Apollo contacts to prospect format for filtering (parallel)
        const candidateProspects = await Promise.all(
          candidateContacts.map(contact => 
            apolloService.convertApolloContactToProspect(contact)
          )
        );

        const { filtered: filteredProspects, stats: exclusionStats } = 
          await exclusionFilterService.filterProspects(
            candidateProspects,
            userId,
            exclusionRules
          );

        console.log(`[Automation ${automationRunId}] Exclusion filter results:`, {
          totalCandidates: exclusionStats.totalCandidates,
          removedByUnsubscribe: exclusionStats.removedByUnsubscribe,
          removedByDuplicate: exclusionStats.removedByDuplicate,
          removedByContacted: exclusionStats.removedByContacted,
          remaining: exclusionStats.remaining
        });

        // Trim to exact count after filtering
        const prospectsToSave = filteredProspects.slice(0, prospectCount);
        console.log(`[Automation ${automationRunId}] Saving ${prospectsToSave.length} filtered prospects`);

        // =====================================
        // STEP 2: Save filtered prospects to database (USER-SCOPED)
        // =====================================
        // Note: Prospects are already filtered, so duplicates should be minimal
        // But we still check to avoid unique constraint errors
        for (const prospectData of prospectsToSave) {
        try {
          // Check if prospect exists (extra safety check, filter should have caught most)
          const { prospects: prospectsTable } = await import("@shared/schema");
          const existingProspect = await db.query.prospects.findFirst({
            where: (prospects, { eq, and }) => 
              and(
                eq(prospects.userId, userId), // CRITICAL: Filter by userId for multi-tenancy
                eq(prospects.primaryEmail, prospectData.primaryEmail)
              )
          });

          let prospectId: string;
          
          if (existingProspect) {
            // Should be rare since we filtered, but use existing ID
            prospectId = existingProspect.id;
            console.log(`[Automation ${automationRunId}] Using existing prospect: ${prospectData.primaryEmail}`);
          } else {
            // Save new prospect with userId
            const [newProspect] = await db.insert(prospectsTable)
              .values({
                ...prospectData,
                userId // CRITICAL: Set userId for multi-tenancy
              })
              .returning();
            prospectId = newProspect.id;
            console.log(`[Automation ${automationRunId}] Saved new prospect: ${prospectData.primaryEmail}`);
          }

          savedProspectIds.push(prospectId);

        } catch (error) {
          console.error(`[Automation ${automationRunId}] Error saving prospect:`, error);
          // Continue with other prospects
        }
      }

        // Update automation run with prospects added
        await db.update(automationRuns)
          .set({ prospectsAdded: savedProspectIds.length })
          .where(eq(automationRuns.id, automationRunId));

        console.log(`[Automation ${automationRunId}] Saved ${savedProspectIds.length} prospects from Apollo`);
      }

      // =====================================
      // STEP 2/3: Enroll prospects in sequence (shared for both sources)
      // =====================================
      console.log(`[Automation ${automationRunId}] Enrolling ${savedProspectIds.length} prospects in sequence...`);

      for (const prospectId of savedProspectIds) {
        try {
          // Check if already enrolled
          const existingEnrollment = await db.query.sequenceProspects.findFirst({
            where: (sp, { eq, and }) => 
              and(
                eq(sp.sequenceId, sequenceId),
                eq(sp.prospectId, prospectId)
              )
          });

          if (existingEnrollment) {
            console.log(`[Automation ${automationRunId}] Prospect ${prospectId} already enrolled`);
            continue;
          }

          // Enroll prospect
          await db.insert(sequenceProspects).values({
            sequenceId,
            prospectId,
            automationRunId,
            status: "active",
          });

          console.log(`[Automation ${automationRunId}] Enrolled prospect ${prospectId}`);

          // TODO: Schedule first email if AI personalization is enabled
          // This will be handled by the email queue service

        } catch (error) {
          console.error(`[Automation ${automationRunId}] Error enrolling prospect ${prospectId}:`, error);
        }
      }

      // =====================================
      // STEP 4: Mark automation as completed
      // =====================================
      await db.update(automationRuns)
        .set({ 
          status: "completed",
          completedAt: new Date()
        })
        .where(eq(automationRuns.id, automationRunId));

      console.log(`[Automation ${automationRunId}] ✅ Completed successfully!`);

    } catch (error) {
      console.error(`[Automation ${automationRunId}] ❌ Failed:`, error);

      // Mark as failed
      await db.update(automationRuns)
        .set({ 
          status: "failed",
          errors: error instanceof Error ? error.message : "Unknown error"
        })
        .where(eq(automationRuns.id, automationRunId));
    }
  }

  /**
   * Create a new automation run
   */
  async createAutomationRun(data: Omit<InsertAutomationRun, 'createdAt' | 'startedAt'>): Promise<AutomationRun> {
    const [automationRun] = await db.insert(automationRuns)
      .values(data)
      .returning();
    
    return automationRun;
  }

  /**
   * Get all automation runs
   */
  async getAutomationRuns(userId?: string, limit = 50): Promise<Array<AutomationRun & { sequenceName?: string }>> {
    const runs = await db.query.automationRuns.findMany({
      where: userId ? (runs, { eq }) => eq(runs.userId, userId) : undefined,
      limit,
      orderBy: (runs, { desc }) => [desc(runs.startedAt)],
      with: {
        sequence: {
          columns: {
            name: true,
          }
        }
      }
    });

    return runs.map(run => ({
      ...run,
      sequenceName: run.sequence?.name
    }));
  }

  /**
   * Get a specific automation run
   */
  async getAutomationRun(id: string): Promise<(AutomationRun & { sequenceName?: string }) | undefined> {
    const run = await db.query.automationRuns.findFirst({
      where: (runs, { eq }) => eq(runs.id, id),
      with: {
        sequence: {
          columns: {
            name: true,
          }
        }
      }
    });

    if (!run) return undefined;

    return {
      ...run,
      sequenceName: run.sequence?.name
    };
  }

  /**
   * Pause a running automation
   */
  async pauseAutomation(id: string): Promise<void> {
    await db.update(automationRuns)
      .set({ status: "paused" })
      .where(eq(automationRuns.id, id));
  }

  /**
   * Resume a paused automation
   */
  async resumeAutomation(id: string): Promise<void> {
    await db.update(automationRuns)
      .set({ status: "running", isStopped: false })
      .where(eq(automationRuns.id, id));
  }

  /**
   * Stop an automation (cannot be resumed)
   */
  async stopAutomation(id: string): Promise<void> {
    await db.update(automationRuns)
      .set({ 
        status: "paused", 
        isStopped: true,
        completedAt: new Date()
      })
      .where(eq(automationRuns.id, id));
  }

  /**
   * Log error for automation run
   */
  async logAutomationError(
    automationRunId: string,
    prospectId: string | null,
    error: string
  ): Promise<void> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return;

    const errorLog = (run.errorLog as any[]) || [];
    errorLog.push({
      prospectId,
      error,
      timestamp: new Date().toISOString()
    });

    await db.update(automationRuns)
      .set({ errorLog: errorLog as any })
      .where(eq(automationRuns.id, automationRunId));
  }

  /**
   * Get error logs for automation
   */
  async getAutomationErrors(id: string): Promise<any[]> {
    const run = await this.getAutomationRun(id);
    return (run?.errorLog as any[]) || [];
  }

  /**
   * Retry failed prospects in automation
   */
  async retryFailedProspects(automationRunId: string): Promise<void> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) throw new Error("Automation run not found");

    const errorLog = (run.errorLog as any[]) || [];
    const failedProspectIds = errorLog
      .filter(e => e.prospectId)
      .map(e => e.prospectId);

    // Re-enroll failed prospects
    for (const prospectId of failedProspectIds) {
      try {
        const { sequenceProspects } = await import("@shared/schema");
        await db.insert(sequenceProspects).values({
          sequenceId: run.sequenceId,
          prospectId,
          status: "active",
          automationRunId: automationRunId,
        }).onConflictDoNothing();
      } catch (error) {
        console.error(`Failed to retry prospect ${prospectId}:`, error);
      }
    }

    // Clear error log
    await db.update(automationRuns)
      .set({ errorLog: [] as any })
      .where(eq(automationRuns.id, automationRunId));
  }

  /**
   * Get enrolled prospects for automation
   */
  async getEnrolledProspects(automationRunId: string): Promise<string[]> {
    const run = await this.getAutomationRun(automationRunId);
    return (run?.prospectsEnrolled as string[]) || [];
  }

  /**
   * Add prospect to enrolled list
   */
  async addEnrolledProspect(automationRunId: string, prospectId: string): Promise<void> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return;

    const enrolled = (run.prospectsEnrolled as string[]) || [];
    if (!enrolled.includes(prospectId)) {
      enrolled.push(prospectId);
      await db.update(automationRuns)
        .set({ prospectsEnrolled: enrolled as any })
        .where(eq(automationRuns.id, automationRunId));
    }
  }

  /**
   * Check if automation should continue (not paused/stopped)
   */
  async shouldContinue(automationRunId: string): Promise<boolean> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return false;
    
    return run.status === "running" && !run.isStopped;
  }

  /**
   * Check if rate limit allows sending (WITHOUT incrementing counter)
   * Use incrementRateLimitCounter() after successful send
   */
  async checkRateLimit(automationRunId: string): Promise<boolean> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return false;

    const rateLimitConfig = (run.rateLimitConfig as any) || {
      dailyLimit: 500,
      currentDailyCount: 0,
      delayBetweenEmails: 30000,
      lastResetDate: new Date().toISOString().split('T')[0],
      lastEmailSentAt: null
    };

    // Reset counter if new day
    const today = new Date().toISOString().split('T')[0];
    if (rateLimitConfig.lastResetDate !== today) {
      rateLimitConfig.currentDailyCount = 0;
      rateLimitConfig.lastResetDate = today;
      
      // Save the reset
      await db.update(automationRuns)
        .set({ rateLimitConfig: rateLimitConfig as any })
        .where(eq(automationRuns.id, automationRunId));
    }

    // Check if limit reached (but don't increment yet)
    return rateLimitConfig.currentDailyCount < rateLimitConfig.dailyLimit;
  }

  /**
   * Atomically reserve a send slot (check + increment in single transaction)
   * Uses raw SQL with WHERE clause to prevent race conditions
   * Returns true if slot reserved, false if rate limit reached or delay not satisfied
   */
  async reserveSendSlot(automationRunId: string): Promise<{
    success: boolean;
    delayMs: number;
    nextSendAfter: Date | null;
  }> {
    const now = new Date();
    const nowISO = now.toISOString();
    const today = now.toISOString().split('T')[0];

    // ATOMIC UPDATE with WHERE clause that checks:
    // 1. Daily limit not reached  
    // 2. Delay from last send has elapsed (or no last send)
    // 3. Reset counter if new day
    // 4. Handle NULL config for fresh automation runs
    // Only ONE worker will succeed if limit is at boundary
    const result = await db.execute(sql`
      UPDATE automation_runs
      SET rate_limit_config = CASE
        -- Handle NULL config (fresh automation) - initialize with defaults
        WHEN rate_limit_config IS NULL THEN
          jsonb_build_object(
            'dailyLimit', 500,
            'currentDailyCount', 1,
            'delayBetweenEmails', 30000,
            'lastResetDate', ${today}::text,
            'lastEmailSentAt', ${nowISO}::text
          )
        -- New day - reset counters but PRESERVE all existing fields
        WHEN COALESCE(rate_limit_config->>'lastResetDate', ${today}) != ${today} THEN
          rate_limit_config 
          || jsonb_build_object(
            'currentDailyCount', 1,
            'lastResetDate', ${today}::text,
            'lastEmailSentAt', ${nowISO}::text
          )
        -- Same day - increment counter and update timestamp
        ELSE
          rate_limit_config 
          || jsonb_build_object(
            'currentDailyCount', COALESCE((rate_limit_config->>'currentDailyCount')::int, 0) + 1,
            'lastEmailSentAt', ${nowISO}::text
          )
        END
      WHERE id = ${automationRunId}
      AND (
        -- Check if config is NULL (fresh) OR resetting (new day) OR within limit on same day
        rate_limit_config IS NULL
        OR COALESCE(rate_limit_config->>'lastResetDate', ${today}) != ${today}
        OR COALESCE((rate_limit_config->>'currentDailyCount')::int, 0) < COALESCE((rate_limit_config->>'dailyLimit')::int, 500)
      )
      AND (
        -- Check delay: config NULL OR no last send OR enough time has elapsed
        rate_limit_config IS NULL
        OR rate_limit_config->>'lastEmailSentAt' IS NULL
        OR (
          EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - (rate_limit_config->>'lastEmailSentAt')::timestamp)) * 1000
          >= COALESCE((rate_limit_config->>'delayBetweenEmails')::int, 0)
        )
      )
      RETURNING id, rate_limit_config, 'success' AS status
    `);

    if (result.rows.length === 0) {
      // No row updated means either limit reached or delay not satisfied
      // Fetch current config to determine why
      const run = await this.getAutomationRun(automationRunId);
      if (!run) return { success: false, delayMs: 0, nextSendAfter: null };

      const config = (run.rateLimitConfig as any) || {
        dailyLimit: 500,
        currentDailyCount: 0,
        delayBetweenEmails: 30000,
        lastEmailSentAt: null
      };

      // Check if delay not satisfied
      if (config.lastEmailSentAt && config.delayBetweenEmails) {
        const lastSentAt = new Date(config.lastEmailSentAt);
        const nextSendAfter = new Date(lastSentAt.getTime() + config.delayBetweenEmails);
        if (now < nextSendAfter) {
          return {
            success: false,
            delayMs: nextSendAfter.getTime() - now.getTime(),
            nextSendAfter
          };
        }
      }

      // Otherwise, limit reached
      return { success: false, delayMs: 0, nextSendAfter: null };
    }

    return { success: true, delayMs: 0, nextSendAfter: null };
  }

  /**
   * DEPRECATED - Use reserveSendSlot() instead
   * Increment rate limit counter AFTER successful send
   * Call this only after email is sent successfully
   */
  async incrementRateLimitCounter(automationRunId: string): Promise<void> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return;

    const rateLimitConfig = (run.rateLimitConfig as any) || {
      dailyLimit: 500,
      currentDailyCount: 0,
      delayBetweenEmails: 30000,
      lastResetDate: new Date().toISOString().split('T')[0],
      lastEmailSentAt: null
    };

    // Increment counter and update last send time
    rateLimitConfig.currentDailyCount++;
    rateLimitConfig.lastEmailSentAt = new Date().toISOString();

    await db.update(automationRuns)
      .set({ rateLimitConfig: rateLimitConfig as any })
      .where(eq(automationRuns.id, automationRunId));
  }

  /**
   * Get rate limit status
   */
  async getRateLimitStatus(automationRunId: string): Promise<any> {
    const run = await this.getAutomationRun(automationRunId);
    if (!run) return null;

    const rateLimitConfig = (run.rateLimitConfig as any) || {
      dailyLimit: 500,
      currentDailyCount: 0,
      delayBetweenEmails: 30000,
      lastEmailSentAt: null
    };

    return {
      dailyLimit: rateLimitConfig.dailyLimit,
      currentDailyCount: rateLimitConfig.currentDailyCount,
      remaining: rateLimitConfig.dailyLimit - rateLimitConfig.currentDailyCount,
      delayBetweenEmails: rateLimitConfig.delayBetweenEmails,
      lastEmailSentAt: rateLimitConfig.lastEmailSentAt
    };
  }

  /**
   * Update automation stats
   */
  async updateAutomationStats(
    automationRunId: string,
    updates: {
      emailsSent?: number;
      repliesReceived?: number;
    }
  ): Promise<void> {
    await db.update(automationRuns)
      .set(updates)
      .where(eq(automationRuns.id, automationRunId));
  }
}

export default new AutomationService();
