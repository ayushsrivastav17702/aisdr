import { db } from "../db";
import { 
  automationRuns, 
  sequenceProspects,
  type AutomationRun,
  type InsertAutomationRun 
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { apolloService } from "./apollo.service";

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


        // Trim to exact count requested
        const contacts = allContacts.slice(0, prospectCount);
        console.log(`[Automation ${automationRunId}] Found ${contacts.length} prospects from Apollo`);

        // =====================================
        // STEP 2: Save prospects to database (USER-SCOPED)
        // =====================================
        for (const contact of contacts) {
        try {
          const prospect = await apolloService.convertApolloContactToProspect(contact);
          
          // Check if prospect already exists FOR THIS USER - build condition array to avoid undefined in or()
          const existingProspects = await db.query.prospects.findFirst({
            where: (prospects, { eq, or, and }) => {
              const conditions = [
                eq(prospects.userId, userId), // CRITICAL: Filter by userId for multi-tenancy
                eq(prospects.primaryEmail, prospect.primaryEmail)
              ];
              if (prospect.apolloId) {
                conditions.push(eq(prospects.apolloId, prospect.apolloId));
              }
              return and(...conditions.slice(0, 2), conditions.length > 2 ? or(conditions[1], conditions[2]) : conditions[1]);
            }
          });

          let prospectId: string;
          
          if (existingProspects) {
            console.log(`[Automation ${automationRunId}] Prospect already exists for user ${userId}: ${prospect.primaryEmail}`);
            prospectId = existingProspects.id;
          } else {
            // Save new prospect with userId
            const { prospects: prospectsTable } = await import("@shared/schema");
            const [newProspect] = await db.insert(prospectsTable)
              .values({
                ...prospect,
                userId // CRITICAL: Set userId for multi-tenancy
              })
              .returning();
            prospectId = newProspect.id;
            console.log(`[Automation ${automationRunId}] Saved new prospect for user ${userId}: ${prospect.primaryEmail}`);
          }

          savedProspectIds.push(prospectId);

          // Stop if we've reached the requested count
          if (savedProspectIds.length >= prospectCount) {
            console.log(`[Automation ${automationRunId}] Reached target prospect count: ${prospectCount}`);
            break;
          }

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
  async getAutomationRuns(limit = 50): Promise<Array<AutomationRun & { sequenceName?: string }>> {
    const runs = await db.query.automationRuns.findMany({
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
