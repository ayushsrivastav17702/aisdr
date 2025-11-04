import { 
  prospects, 
  searches, 
  jobs, 
  importRecords,
  sequences,
  sequenceSteps,
  sequenceProspects,
  emails,
  emailReplies,
  personalizationResults,
  contentLibrary,
  automationRuns,
  unsubscribes,
  type Prospect, 
  type InsertProspect,
  type Search,
  type InsertSearch, 
  type Job,
  type InsertJob,
  type ImportRecord,
  type InsertImportRecord,
  type Sequence,
  type InsertSequence,
  type SequenceStep,
  type InsertSequenceStep,
  type SequenceProspect,
  type InsertSequenceProspect,
  type Email,
  type InsertEmail,
  type EmailReply,
  type InsertEmailReply,
  type PersonalizationResult,
  type InsertPersonalizationResult,
  type ContentLibraryItem,
  type InsertContentLibraryItem,
  type AutomationRun,
  type InsertAutomationRun,
  type Unsubscribe,
  type InsertUnsubscribe
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, and, or, ilike, count } from "drizzle-orm";

export interface IStorage {
  // Prospects
  getProspects(filters?: {
    search?: string;
    status?: string;
    companyLocation?: string;
    jobTitle?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ prospects: Prospect[]; total: number }>;
  getProspect(id: string): Promise<Prospect | undefined>;
  createProspect(prospect: InsertProspect): Promise<Prospect>;
  bulkCreateProspects(prospects: InsertProspect[]): Promise<Prospect[]>;
  updateProspect(id: string, updates: Partial<InsertProspect>): Promise<Prospect>;
  deleteProspect(id: string): Promise<void>;
  getProspectsByIds(ids: string[]): Promise<Prospect[]>;
  checkDuplicateProspects(emails: string[], domains?: string[]): Promise<Prospect[]>;
  findProspectByEmailOrApolloId(email: string | null, apolloId: string | null): Promise<Prospect | undefined>;
  searchLocalProspects(aiFilters: any): Promise<Prospect[]>;
  getUniqueFilterValues(): Promise<{ locations: string[]; jobTitles: string[] }>;
  
  // Searches
  getSearches(limit?: number): Promise<Search[]>;
  getSearch(id: string): Promise<Search | undefined>;
  createSearch(search: InsertSearch): Promise<Search>;
  updateSearch(id: string, updates: Partial<InsertSearch>): Promise<Search>;
  
  // Jobs
  getJobs(status?: string, limit?: number): Promise<Job[]>;
  getJob(id: string): Promise<Job | undefined>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, updates: Partial<Job>): Promise<Job>;
  getActiveJobs(): Promise<Job[]>;
  
  // Import Records
  getImportRecord(id: string): Promise<ImportRecord | undefined>;
  createImportRecord(record: InsertImportRecord): Promise<ImportRecord>;
  updateImportRecord(id: string, updates: Partial<InsertImportRecord>): Promise<ImportRecord>;
  
  // Sequences
  getSequences(limit?: number): Promise<Sequence[]>;
  getSequence(id: string): Promise<Sequence | undefined>;
  createSequence(sequence: InsertSequence): Promise<Sequence>;
  updateSequence(id: string, updates: Partial<Sequence>): Promise<Sequence>;
  deleteSequence(id: string): Promise<void>;
  
  // Sequence Steps
  getSequenceSteps(sequenceId: string): Promise<SequenceStep[]>;
  createSequenceStep(step: InsertSequenceStep): Promise<SequenceStep>;
  
  // Sequence Prospects
  getSequenceProspects(sequenceId: string): Promise<Array<SequenceProspect & { prospect?: Prospect }>>;
  enrollProspects(sequenceId: string, prospectIds: string[]): Promise<SequenceProspect[]>;
  
  // Emails
  getSequenceEmails(sequenceId: string): Promise<Email[]>;
  
  // Email Replies
  getEmailReplies(sequenceId: string): Promise<Array<EmailReply & { prospect?: Prospect }>>;
  createEmailReply(reply: InsertEmailReply): Promise<EmailReply>;
  
  // Personalization
  createPersonalizationResult(result: InsertPersonalizationResult): Promise<PersonalizationResult>;
  getPersonalizationResult(prospectId: string): Promise<PersonalizationResult | undefined>;
  
  // Content Library
  getContentLibraryItems(): Promise<ContentLibraryItem[]>;
  getContentLibraryItem(id: string): Promise<ContentLibraryItem | undefined>;
  createContentLibraryItem(item: InsertContentLibraryItem): Promise<ContentLibraryItem>;
  updateContentLibraryItem(id: string, updates: Partial<InsertContentLibraryItem>): Promise<ContentLibraryItem>;
  deleteContentLibraryItem(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Prospects
  async getProspects(filters: {
    search?: string;
    status?: string;
    companyLocation?: string;
    jobTitle?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ prospects: Prospect[]; total: number }> {
    const { search, status, companyLocation, jobTitle, limit = 50, offset = 0 } = filters;
    
    let query = db.select().from(prospects);
    let countQuery = db.select({ count: count() }).from(prospects);
    
    const conditions = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(prospects.fullName, `%${search}%`),
          ilike(prospects.firstName, `%${search}%`),
          ilike(prospects.lastName, `%${search}%`),
          ilike(prospects.primaryEmail, `%${search}%`),
          ilike(prospects.companyName, `%${search}%`),
          ilike(prospects.jobTitle, `%${search}%`)
        )
      );
    }
    
    if (status) {
      conditions.push(eq(prospects.enrichmentStatus, status as any));
    }

    if (companyLocation) {
      conditions.push(ilike(prospects.contactLocation, `%${companyLocation}%`));
    }

    if (jobTitle) {
      conditions.push(ilike(prospects.jobTitle, `%${jobTitle}%`));
    }
    
    if (conditions.length > 0) {
      const whereClause = and(...conditions);
      query = query.where(whereClause);
      countQuery = countQuery.where(whereClause);
    }
    
    const [prospectResults, countResult] = await Promise.all([
      query
        .orderBy(desc(prospects.createdAt))
        .limit(limit)
        .offset(offset),
      countQuery
    ]);
    
    return {
      prospects: prospectResults,
      total: countResult[0]?.count || 0
    };
  }

  async getProspect(id: string): Promise<Prospect | undefined> {
    const [prospect] = await db.select().from(prospects).where(eq(prospects.id, id));
    return prospect || undefined;
  }

  async createProspect(prospect: InsertProspect): Promise<Prospect> {
    const [created] = await db
      .insert(prospects)
      .values({ ...prospect, updatedAt: new Date() })
      .returning();
    return created;
  }

  async bulkCreateProspects(prospectsToCreate: InsertProspect[]): Promise<Prospect[]> {
    if (prospectsToCreate.length === 0) return [];
    
    const prospectsWithUpdatedAt = prospectsToCreate.map(p => ({ 
      ...p, 
      updatedAt: new Date() 
    }));
    
    const created = await db
      .insert(prospects)
      .values(prospectsWithUpdatedAt)
      .returning();
    return created;
  }

  async updateProspect(id: string, updates: Partial<InsertProspect>): Promise<Prospect> {
    const [updated] = await db
      .update(prospects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(prospects.id, id))
      .returning();
    return updated;
  }

  async deleteProspect(id: string): Promise<void> {
    await db.delete(prospects).where(eq(prospects.id, id));
  }

  async getProspectsByIds(ids: string[]): Promise<Prospect[]> {
    if (ids.length === 0) return [];
    return await db.select().from(prospects).where(inArray(prospects.id, ids));
  }

  async checkDuplicateProspects(emails: string[], domains?: string[]): Promise<Prospect[]> {
    const conditions = [];
    
    if (emails.length > 0) {
      conditions.push(
        or(
          inArray(prospects.primaryEmail, emails),
          inArray(prospects.secondaryEmail, emails)
        )
      );
    }
    
    if (domains && domains.length > 0) {
      conditions.push(inArray(prospects.companyDomain, domains));
    }
    
    if (conditions.length === 0) return [];
    
    return await db.select().from(prospects).where(or(...conditions));
  }

  async findProspectByEmailOrApolloId(email: string | null, apolloId: string | null): Promise<Prospect | undefined> {
    if (!email && !apolloId) return undefined;
    
    const conditions = [];
    if (email) {
      conditions.push(
        or(
          eq(prospects.primaryEmail, email),
          eq(prospects.secondaryEmail, email)
        )
      );
    }
    if (apolloId) {
      conditions.push(eq(prospects.apolloId, apolloId));
    }
    
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(or(...conditions))
      .limit(1);
    
    return prospect || undefined;
  }

  private normalizeFilterArray(values: any): string[] {
    if (!values) return [];
    if (!Array.isArray(values)) values = [values];
    
    const normalized = values
      .map((v: any) => {
        if (typeof v === 'string') return v.trim();
        if (v && typeof v === 'object' && 'value' in v) return String(v.value).trim();
        if (v && typeof v === 'object') return null;
        return String(v).trim();
      })
      .filter((v: string | null) => v && v.length > 0) as string[];
    
    const uniqueValues = [...new Set(normalized)];
    return uniqueValues.slice(0, 10);
  }

  async searchLocalProspects(aiFilters: any): Promise<Prospect[]> {
    const conditions = [];
    
    const jobTitles = this.normalizeFilterArray(aiFilters.jobTitles);
    if (jobTitles.length > 0) {
      const titleConditions = jobTitles.map((title: string) => 
        ilike(prospects.jobTitle, `%${title}%`)
      );
      conditions.push(titleConditions.length === 1 ? titleConditions[0] : or(...titleConditions));
    }
    
    const companyNames = this.normalizeFilterArray(aiFilters.companyNames);
    if (companyNames.length > 0) {
      const companyConditions = companyNames.map((company: string) => 
        ilike(prospects.companyName, `%${company}%`)
      );
      conditions.push(companyConditions.length === 1 ? companyConditions[0] : or(...companyConditions));
    }
    
    const locations = this.normalizeFilterArray(aiFilters.locations);
    if (locations.length > 0) {
      const locationConditions = locations.flatMap((location: string) => [
        ilike(prospects.contactLocation, `%${location}%`),
        ilike(prospects.companyLocation, `%${location}%`)
      ]);
      conditions.push(locationConditions.length === 1 ? locationConditions[0] : or(...locationConditions));
    }
    
    const industries = this.normalizeFilterArray(aiFilters.industries);
    if (industries.length > 0) {
      const industryConditions = industries.map((industry: string) => 
        ilike(prospects.companyIndustry, `%${industry}%`)
      );
      conditions.push(industryConditions.length === 1 ? industryConditions[0] : or(...industryConditions));
    }
    
    const keywords = this.normalizeFilterArray(aiFilters.keywords).slice(0, 5);
    if (keywords.length > 0) {
      const keywordConditions = keywords.flatMap((keyword: string) => [
        ilike(prospects.fullName, `%${keyword}%`),
        ilike(prospects.jobTitle, `%${keyword}%`),
        ilike(prospects.companyName, `%${keyword}%`)
      ]);
      conditions.push(keywordConditions.length === 1 ? keywordConditions[0] : or(...keywordConditions));
    }
    
    if (conditions.length === 0) {
      return [];
    }
    
    const results = await db
      .select()
      .from(prospects)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .limit(200);
    
    return results;
  }

  async getUniqueFilterValues(): Promise<{ locations: string[]; jobTitles: string[] }> {
    // Get all prospects with non-null locations and job titles
    const allProspects = await db
      .select({
        contactLocation: prospects.contactLocation,
        jobTitle: prospects.jobTitle,
      })
      .from(prospects);

    // Extract unique, non-null countries from contact location
    const locations = [...new Set(
      allProspects
        .map(p => p.contactLocation)
        .filter((loc): loc is string => !!loc && loc.trim().length > 0)
    )].sort();

    // Extract unique, non-null job titles
    const jobTitles = [...new Set(
      allProspects
        .map(p => p.jobTitle)
        .filter((title): title is string => !!title && title.trim().length > 0)
    )].sort();

    return { locations, jobTitles };
  }

  // Searches
  async getSearches(limit = 20): Promise<Search[]> {
    return await db
      .select()
      .from(searches)
      .orderBy(desc(searches.createdAt))
      .limit(limit);
  }

  async getSearch(id: string): Promise<Search | undefined> {
    const [search] = await db.select().from(searches).where(eq(searches.id, id));
    return search || undefined;
  }

  async createSearch(search: InsertSearch): Promise<Search> {
    const [created] = await db.insert(searches).values(search).returning();
    return created;
  }

  async updateSearch(id: string, updates: Partial<InsertSearch>): Promise<Search> {
    const [updated] = await db
      .update(searches)
      .set(updates)
      .where(eq(searches.id, id))
      .returning();
    return updated;
  }

  // Jobs
  async getJobs(status?: string, limit = 20): Promise<Job[]> {
    let query = db.select().from(jobs);
    
    if (status) {
      query = query.where(eq(jobs.status, status as any));
    }
    
    return await query
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async getJob(id: string): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const [updated] = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async getActiveJobs(): Promise<Job[]> {
    return await db
      .select()
      .from(jobs)
      .where(or(eq(jobs.status, "queued"), eq(jobs.status, "running")))
      .orderBy(desc(jobs.createdAt));
  }

  // Import Records
  async getImportRecord(id: string): Promise<ImportRecord | undefined> {
    const [record] = await db.select().from(importRecords).where(eq(importRecords.id, id));
    return record || undefined;
  }

  async createImportRecord(record: InsertImportRecord): Promise<ImportRecord> {
    const [created] = await db.insert(importRecords).values(record).returning();
    return created;
  }

  async updateImportRecord(id: string, updates: Partial<InsertImportRecord>): Promise<ImportRecord> {
    const [updated] = await db
      .update(importRecords)
      .set(updates)
      .where(eq(importRecords.id, id))
      .returning();
    return updated;
  }

  // Sequences
  async getSequences(limit = 20): Promise<Sequence[]> {
    return await db
      .select()
      .from(sequences)
      .orderBy(desc(sequences.createdAt))
      .limit(limit);
  }

  async getSequence(id: string): Promise<Sequence | undefined> {
    const [sequence] = await db.select().from(sequences).where(eq(sequences.id, id));
    return sequence || undefined;
  }

  async createSequence(sequence: InsertSequence): Promise<Sequence> {
    const [created] = await db
      .insert(sequences)
      .values({ ...sequence, updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateSequence(id: string, updates: Partial<Sequence>): Promise<Sequence> {
    const [updated] = await db
      .update(sequences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sequences.id, id))
      .returning();
    return updated;
  }

  async deleteSequence(id: string): Promise<void> {
    await db.delete(sequences).where(eq(sequences.id, id));
  }

  // Sequence Steps
  async getSequenceSteps(sequenceId: string): Promise<SequenceStep[]> {
    return await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);
  }

  async createSequenceStep(step: InsertSequenceStep): Promise<SequenceStep> {
    const [created] = await db
      .insert(sequenceSteps)
      .values({ ...step, updatedAt: new Date() })
      .returning();
    return created;
  }

  // Sequence Prospects
  async getSequenceProspects(sequenceId: string): Promise<Array<SequenceProspect & { prospect?: Prospect }>> {
    return await db
      .select({
        id: sequenceProspects.id,
        sequenceId: sequenceProspects.sequenceId,
        prospectId: sequenceProspects.prospectId,
        currentStepId: sequenceProspects.currentStepId,
        status: sequenceProspects.status,
        enrolledAt: sequenceProspects.enrolledAt,
        lastContactedAt: sequenceProspects.lastContactedAt,
        completedAt: sequenceProspects.completedAt,
        replies: sequenceProspects.replies,
        opens: sequenceProspects.opens,
        clicks: sequenceProspects.clicks,
        prospect: prospects
      })
      .from(sequenceProspects)
      .leftJoin(prospects, eq(sequenceProspects.prospectId, prospects.id))
      .where(eq(sequenceProspects.sequenceId, sequenceId));
  }

  async enrollProspects(sequenceId: string, prospectIds: string[]): Promise<SequenceProspect[]> {
    const enrolled: SequenceProspect[] = [];
    for (const prospectId of prospectIds) {
      const [result] = await db
        .insert(sequenceProspects)
        .values({
          sequenceId,
          prospectId,
          status: "active",
          enrolledAt: new Date()
        })
        .returning();
      enrolled.push(result);
    }
    return enrolled;
  }

  // Emails
  async getSequenceEmails(sequenceId: string): Promise<Email[]> {
    return await db
      .select()
      .from(emails)
      .where(eq(emails.sequenceId, sequenceId));
  }

  // Email Replies
  async getEmailReplies(sequenceId: string): Promise<Array<EmailReply & { prospect?: Prospect }>> {
    return await db
      .select({
        id: emailReplies.id,
        emailId: emailReplies.emailId,
        sequenceId: emailReplies.sequenceId,
        prospectId: emailReplies.prospectId,
        replyContent: emailReplies.replyContent,
        sentiment: emailReplies.sentiment,
        receivedAt: emailReplies.receivedAt,
        aiSummary: emailReplies.aiSummary,
        nextAction: emailReplies.nextAction,
        createdAt: emailReplies.createdAt,
        prospect: prospects
      })
      .from(emailReplies)
      .leftJoin(prospects, eq(emailReplies.prospectId, prospects.id))
      .where(eq(emailReplies.sequenceId, sequenceId))
      .orderBy(desc(emailReplies.receivedAt));
  }

  async createEmailReply(reply: InsertEmailReply): Promise<EmailReply> {
    const [created] = await db.insert(emailReplies).values(reply).returning();
    return created;
  }

  // Personalization
  async createPersonalizationResult(result: InsertPersonalizationResult): Promise<PersonalizationResult> {
    const [created] = await db.insert(personalizationResults).values(result).returning();
    return created;
  }

  async getPersonalizationResult(prospectId: string): Promise<PersonalizationResult | undefined> {
    const [result] = await db
      .select()
      .from(personalizationResults)
      .where(eq(personalizationResults.prospectId, prospectId))
      .orderBy(desc(personalizationResults.createdAt))
      .limit(1);
    return result || undefined;
  }

  // Content Library
  async getContentLibraryItems(): Promise<ContentLibraryItem[]> {
    return await db.select().from(contentLibrary).orderBy(desc(contentLibrary.createdAt));
  }

  async getContentLibraryItem(id: string): Promise<ContentLibraryItem | undefined> {
    const [item] = await db.select().from(contentLibrary).where(eq(contentLibrary.id, id));
    return item || undefined;
  }

  async createContentLibraryItem(item: InsertContentLibraryItem): Promise<ContentLibraryItem> {
    const [created] = await db.insert(contentLibrary).values(item).returning();
    return created;
  }

  async updateContentLibraryItem(id: string, updates: Partial<InsertContentLibraryItem>): Promise<ContentLibraryItem> {
    const [updated] = await db
      .update(contentLibrary)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contentLibrary.id, id))
      .returning();
    return updated;
  }

  async deleteContentLibraryItem(id: string): Promise<void> {
    await db.delete(contentLibrary).where(eq(contentLibrary.id, id));
  }
}

export const storage = new DatabaseStorage();
