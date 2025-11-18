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
import { eq, desc, inArray, and, or, ilike, count, SQL } from "drizzle-orm";

export type RequestContext = {
  userId: string;
  roles: string[];
  actingAs?: string;
};

function isAdmin(ctx: RequestContext): boolean {
  return ctx?.roles?.includes('admin') ?? false;
}

function getEffectiveUserId(ctx: RequestContext): string {
  if (ctx.actingAs && !isAdmin(ctx)) {
    throw new Error('Only administrators can use actingAs');
  }
  return ctx.actingAs ?? ctx.userId;
}

function scopedWhere<T extends { userId: any }>(
  table: T,
  ctx: RequestContext,
  extraConditions?: SQL[]
): SQL | undefined {
  const conditions: SQL[] = [];
  
  // CRITICAL: Always filter by userId for multi-tenancy, even for admins
  // Admins can impersonate using actingAs, but should still see scoped data
  if (!isAdmin(ctx)) {
    // Regular users always see only their own data
    conditions.push(eq(table.userId, ctx.userId));
  } else if (ctx.actingAs) {
    // Admins using impersonation see the impersonated user's data
    conditions.push(eq(table.userId, ctx.actingAs));
  } else {
    // Admins NOT impersonating still see only their own data (not ALL data)
    // This prevents accidental cross-tenant data exposure
    conditions.push(eq(table.userId, ctx.userId));
  }
  
  if (extraConditions) {
    conditions.push(...extraConditions);
  }
  
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export interface IStorage {
  // Prospects
  getProspects(ctx: RequestContext, filters?: {
    search?: string;
    status?: string;
    companyLocation?: string;
    jobTitle?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ prospects: Prospect[]; total: number }>;
  getProspect(ctx: RequestContext, id: string): Promise<Prospect | undefined>;
  createProspect(ctx: RequestContext, prospect: InsertProspect): Promise<Prospect>;
  bulkCreateProspects(ctx: RequestContext, prospects: InsertProspect[]): Promise<Prospect[]>;
  updateProspect(ctx: RequestContext, id: string, updates: Partial<InsertProspect>): Promise<Prospect>;
  deleteProspect(ctx: RequestContext, id: string): Promise<void>;
  bulkDeleteProspects(ctx: RequestContext, ids: string[]): Promise<{ deleted: number; failed: number }>;
  getProspectsByIds(ctx: RequestContext, ids: string[]): Promise<Prospect[]>;
  getAllProspectIds(ctx: RequestContext): Promise<string[]>;
  checkDuplicateProspects(ctx: RequestContext, emails: string[], domains?: string[]): Promise<Prospect[]>;
  findProspectByEmailOrApolloId(ctx: RequestContext, email: string | null, apolloId: string | null): Promise<Prospect | undefined>;
  searchLocalProspects(ctx: RequestContext, aiFilters: any): Promise<Prospect[]>;
  getUniqueFilterValues(ctx: RequestContext): Promise<{ locations: string[]; jobTitles: string[] }>;
  
  // Searches
  getSearches(ctx: RequestContext, limit?: number): Promise<Search[]>;
  getSearch(ctx: RequestContext, id: string): Promise<Search | undefined>;
  createSearch(ctx: RequestContext, search: InsertSearch): Promise<Search>;
  updateSearch(ctx: RequestContext, id: string, updates: Partial<InsertSearch>): Promise<Search>;
  
  // Jobs
  getJobs(ctx: RequestContext, status?: string, limit?: number): Promise<Job[]>;
  getJob(ctx: RequestContext, id: string): Promise<Job | undefined>;
  createJob(ctx: RequestContext, job: InsertJob): Promise<Job>;
  updateJob(ctx: RequestContext, id: string, updates: Partial<Job>): Promise<Job>;
  getActiveJobs(ctx: RequestContext): Promise<Job[]>;
  
  // Import Records
  getImportRecord(ctx: RequestContext, id: string): Promise<ImportRecord | undefined>;
  createImportRecord(ctx: RequestContext, record: InsertImportRecord): Promise<ImportRecord>;
  updateImportRecord(ctx: RequestContext, id: string, updates: Partial<InsertImportRecord>): Promise<ImportRecord>;
  
  // Sequences
  getSequences(ctx: RequestContext, limit?: number): Promise<Sequence[]>;
  getSequence(ctx: RequestContext, id: string): Promise<Sequence | undefined>;
  createSequence(ctx: RequestContext, sequence: InsertSequence): Promise<Sequence>;
  updateSequence(ctx: RequestContext, id: string, updates: Partial<Sequence>): Promise<Sequence>;
  deleteSequence(ctx: RequestContext, id: string): Promise<void>;
  
  // Sequence Steps
  getSequenceSteps(ctx: RequestContext, sequenceId: string): Promise<SequenceStep[]>;
  createSequenceStep(ctx: RequestContext, step: InsertSequenceStep): Promise<SequenceStep>;
  deleteSequenceStep(ctx: RequestContext, stepId: string): Promise<void>;
  
  // Sequence Prospects
  getSequenceProspects(ctx: RequestContext, sequenceId: string): Promise<Array<SequenceProspect & { prospect?: Prospect }>>;
  enrollProspects(ctx: RequestContext, sequenceId: string, prospectIds: string[]): Promise<SequenceProspect[]>;
  
  // Emails
  getSequenceEmails(ctx: RequestContext, sequenceId: string): Promise<Email[]>;
  
  // Email Replies
  getEmailReplies(ctx: RequestContext, sequenceId: string): Promise<Array<EmailReply & { prospect?: Prospect }>>;
  createEmailReply(ctx: RequestContext, reply: InsertEmailReply): Promise<EmailReply>;
  
  // Personalization
  createPersonalizationResult(ctx: RequestContext, result: InsertPersonalizationResult): Promise<PersonalizationResult>;
  getPersonalizationResult(ctx: RequestContext, prospectId: string): Promise<PersonalizationResult | undefined>;
  
  // Content Library
  getContentLibraryItems(ctx: RequestContext): Promise<ContentLibraryItem[]>;
  getContentLibraryItem(ctx: RequestContext, id: string): Promise<ContentLibraryItem | undefined>;
  createContentLibraryItem(ctx: RequestContext, item: InsertContentLibraryItem): Promise<ContentLibraryItem>;
  updateContentLibraryItem(ctx: RequestContext, id: string, updates: Partial<InsertContentLibraryItem>): Promise<ContentLibraryItem>;
  deleteContentLibraryItem(ctx: RequestContext, id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Prospects
  async getProspects(ctx: RequestContext, filters: {
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
    
    const conditions: SQL[] = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(prospects.fullName, `%${search}%`),
          ilike(prospects.firstName, `%${search}%`),
          ilike(prospects.lastName, `%${search}%`),
          ilike(prospects.primaryEmail, `%${search}%`),
          ilike(prospects.companyName, `%${search}%`),
          ilike(prospects.jobTitle, `%${search}%`)
        ) as SQL
      );
    }
    
    if (status) {
      conditions.push(eq(prospects.enrichmentStatus, status as any) as SQL);
    }

    if (companyLocation) {
      conditions.push(ilike(prospects.contactLocation, `%${companyLocation}%`) as SQL);
    }

    if (jobTitle) {
      conditions.push(ilike(prospects.jobTitle, `%${jobTitle}%`) as SQL);
    }
    
    const whereClause = scopedWhere(prospects, ctx, conditions.length > 0 ? conditions : undefined);
    if (whereClause) {
      query = query.where(whereClause) as any;
      countQuery = countQuery.where(whereClause) as any;
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

  async getProspect(ctx: RequestContext, id: string): Promise<Prospect | undefined> {
    const whereClause = scopedWhere(prospects, ctx, [eq(prospects.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [prospect] = await db.select().from(prospects).where(whereClause);
    return prospect || undefined;
  }

  async createProspect(ctx: RequestContext, prospect: InsertProspect): Promise<Prospect> {
    const [created] = await db
      .insert(prospects)
      .values({ ...prospect, userId: getEffectiveUserId(ctx), updatedAt: new Date() })
      .returning();
    return created;
  }

  async bulkCreateProspects(ctx: RequestContext, prospectsToCreate: InsertProspect[]): Promise<Prospect[]> {
    if (prospectsToCreate.length === 0) return [];
    
    const prospectsWithUpdatedAt = prospectsToCreate.map(p => ({ 
      ...p,
      userId: getEffectiveUserId(ctx),
      updatedAt: new Date() 
    }));
    
    const created = await db
      .insert(prospects)
      .values(prospectsWithUpdatedAt)
      .returning();
    return created;
  }

  async updateProspect(ctx: RequestContext, id: string, updates: Partial<InsertProspect>): Promise<Prospect> {
    const existing = await this.getProspect(ctx, id);
    if (!existing) {
      throw new Error('Prospect not found');
    }
    
    const [updated] = await db
      .update(prospects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(prospects.id, id))
      .returning();
    return updated;
  }

  async deleteProspect(ctx: RequestContext, id: string): Promise<void> {
    const existing = await this.getProspect(ctx, id);
    if (!existing) {
      throw new Error('Prospect not found');
    }
    
    await db.delete(prospects).where(eq(prospects.id, id));
  }

  async bulkDeleteProspects(ctx: RequestContext, ids: string[]): Promise<{ deleted: number; failed: number }> {
    if (ids.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    // Delete in batches of 1000 to avoid query size limits
    const BATCH_SIZE = 1000;
    let totalDeleted = 0;
    let totalFailed = 0;
    
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(ids.length / BATCH_SIZE);
      
      console.log(`🗑️ Deleting batch ${batchNum}/${totalBatches} (${batch.length} prospects)...`);
      
      try {
        const whereClause = scopedWhere(prospects, ctx, [inArray(prospects.id, batch)]);
        if (whereClause) {
          await db.delete(prospects).where(whereClause);
        }
        totalDeleted += batch.length;
        console.log(`✅ Batch ${batchNum} deleted: ${batch.length} prospects (${totalDeleted.toLocaleString()}/${ids.length.toLocaleString()} total)`);
      } catch (error) {
        console.error(`❌ Batch ${batchNum} failed:`, error);
        totalFailed += batch.length;
      }
    }

    return { deleted: totalDeleted, failed: totalFailed };
  }

  async getProspectsByIds(ctx: RequestContext, ids: string[]): Promise<Prospect[]> {
    if (ids.length === 0) return [];
    const whereClause = scopedWhere(prospects, ctx, [inArray(prospects.id, ids)]);
    if (!whereClause) {
      return [];
    }
    return await db.select().from(prospects).where(whereClause);
  }

  async getAllProspectIds(ctx: RequestContext): Promise<string[]> {
    let query = db.select({ id: prospects.id }).from(prospects);
    const whereClause = scopedWhere(prospects, ctx);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    const result = await query;
    return result.map(r => r.id);
  }

  async checkDuplicateProspects(ctx: RequestContext, emails: string[], domains?: string[]): Promise<Prospect[]> {
    const conditions: SQL[] = [];
    
    if (emails.length > 0) {
      conditions.push(
        or(
          inArray(prospects.primaryEmail, emails),
          inArray(prospects.secondaryEmail, emails)
        ) as SQL
      );
    }
    
    if (domains && domains.length > 0) {
      conditions.push(inArray(prospects.companyDomain, domains) as SQL);
    }
    
    if (conditions.length === 0) return [];
    
    const whereClause = scopedWhere(prospects, ctx, conditions);
    if (!whereClause) {
      return [];
    }
    return await db.select().from(prospects).where(whereClause);
  }

  async findProspectByEmailOrApolloId(ctx: RequestContext, email: string | null, apolloId: string | null): Promise<Prospect | undefined> {
    if (!email && !apolloId) return undefined;
    
    const conditions: SQL[] = [];
    if (email) {
      conditions.push(
        or(
          eq(prospects.primaryEmail, email),
          eq(prospects.secondaryEmail, email)
        ) as SQL
      );
    }
    if (apolloId) {
      conditions.push(eq(prospects.apolloId, apolloId) as SQL);
    }
    
    const whereClause = scopedWhere(prospects, ctx, conditions);
    if (!whereClause) {
      return undefined;
    }
    
    const [prospect] = await db
      .select()
      .from(prospects)
      .where(whereClause)
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
    
    const uniqueValues = Array.from(new Set(normalized));
    return uniqueValues.slice(0, 10);
  }

  async searchLocalProspects(ctx: RequestContext, aiFilters: any): Promise<Prospect[]> {
    const conditions: SQL[] = [];
    
    const jobTitles = this.normalizeFilterArray(aiFilters.jobTitles);
    if (jobTitles.length > 0) {
      const titleConditions = jobTitles.map((title: string) => 
        ilike(prospects.jobTitle, `%${title}%`)
      );
      conditions.push((titleConditions.length === 1 ? titleConditions[0] : or(...titleConditions)) as SQL);
    }
    
    const companyNames = this.normalizeFilterArray(aiFilters.companyNames);
    if (companyNames.length > 0) {
      const companyConditions = companyNames.map((company: string) => 
        ilike(prospects.companyName, `%${company}%`)
      );
      conditions.push((companyConditions.length === 1 ? companyConditions[0] : or(...companyConditions)) as SQL);
    }
    
    const locations = this.normalizeFilterArray(aiFilters.locations);
    if (locations.length > 0) {
      const locationConditions = locations.flatMap((location: string) => [
        ilike(prospects.contactLocation, `%${location}%`),
        ilike(prospects.companyLocation, `%${location}%`)
      ]);
      conditions.push((locationConditions.length === 1 ? locationConditions[0] : or(...locationConditions)) as SQL);
    }
    
    const industries = this.normalizeFilterArray(aiFilters.industries);
    if (industries.length > 0) {
      const industryConditions = industries.map((industry: string) => 
        ilike(prospects.companyIndustry, `%${industry}%`)
      );
      conditions.push((industryConditions.length === 1 ? industryConditions[0] : or(...industryConditions)) as SQL);
    }
    
    const keywords = this.normalizeFilterArray(aiFilters.keywords).slice(0, 5);
    if (keywords.length > 0) {
      const keywordConditions = keywords.flatMap((keyword: string) => [
        ilike(prospects.fullName, `%${keyword}%`),
        ilike(prospects.jobTitle, `%${keyword}%`),
        ilike(prospects.companyName, `%${keyword}%`)
      ]);
      conditions.push((keywordConditions.length === 1 ? keywordConditions[0] : or(...keywordConditions)) as SQL);
    }
    
    if (conditions.length === 0) {
      return [];
    }
    
    const whereClause = scopedWhere(prospects, ctx, conditions);
    if (!whereClause) {
      return [];
    }
    
    const results = await db
      .select()
      .from(prospects)
      .where(whereClause)
      .limit(200);
    
    return results;
  }

  async getUniqueFilterValues(ctx: RequestContext): Promise<{ locations: string[]; jobTitles: string[] }> {
    let query = db
      .select({
        contactLocation: prospects.contactLocation,
        jobTitle: prospects.jobTitle,
      })
      .from(prospects);
    
    const whereClause = scopedWhere(prospects, ctx);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    const allProspects = await query;

    const locations = Array.from(new Set(
      allProspects
        .map(p => p.contactLocation)
        .filter((loc): loc is string => !!loc && loc.trim().length > 0)
    )).sort();

    const jobTitles = Array.from(new Set(
      allProspects
        .map(p => p.jobTitle)
        .filter((title): title is string => !!title && title.trim().length > 0)
    )).sort();

    return { locations, jobTitles };
  }

  // Searches
  async getSearches(ctx: RequestContext, limit = 20): Promise<Search[]> {
    let query = db
      .select()
      .from(searches)
      .orderBy(desc(searches.createdAt))
      .limit(limit);
    
    const whereClause = scopedWhere(searches, ctx);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    return await query;
  }

  async getSearch(ctx: RequestContext, id: string): Promise<Search | undefined> {
    const whereClause = scopedWhere(searches, ctx, [eq(searches.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [search] = await db.select().from(searches).where(whereClause);
    return search || undefined;
  }

  async createSearch(ctx: RequestContext, search: InsertSearch): Promise<Search> {
    const [created] = await db.insert(searches).values({ ...search, userId: getEffectiveUserId(ctx) }).returning();
    return created;
  }

  async updateSearch(ctx: RequestContext, id: string, updates: Partial<InsertSearch>): Promise<Search> {
    const existing = await this.getSearch(ctx, id);
    if (!existing) {
      throw new Error('Search not found');
    }
    
    const [updated] = await db
      .update(searches)
      .set(updates)
      .where(eq(searches.id, id))
      .returning();
    return updated;
  }

  // Jobs
  async getJobs(ctx: RequestContext, status?: string, limit = 20): Promise<Job[]> {
    let query = db.select().from(jobs);
    
    const conditions = [];
    if (status) {
      conditions.push(eq(jobs.status, status as any));
    }
    
    const whereClause = scopedWhere(jobs, ctx, conditions.length > 0 ? conditions : undefined);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    return await query
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  async getJob(ctx: RequestContext, id: string): Promise<Job | undefined> {
    const whereClause = scopedWhere(jobs, ctx, [eq(jobs.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [job] = await db.select().from(jobs).where(whereClause);
    return job || undefined;
  }

  async createJob(ctx: RequestContext, job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values({ ...job, userId: getEffectiveUserId(ctx) }).returning();
    return created;
  }

  async updateJob(ctx: RequestContext, id: string, updates: Partial<Job>): Promise<Job> {
    const existing = await this.getJob(ctx, id);
    if (!existing) {
      throw new Error('Job not found');
    }
    
    const [updated] = await db
      .update(jobs)
      .set(updates)
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async getActiveJobs(ctx: RequestContext): Promise<Job[]> {
    let query = db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt));
    
    const whereClause = scopedWhere(jobs, ctx, [or(eq(jobs.status, "queued"), eq(jobs.status, "running")) as SQL]);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    return await query;
  }

  // Import Records
  async getImportRecord(ctx: RequestContext, id: string): Promise<ImportRecord | undefined> {
    const whereClause = scopedWhere(importRecords, ctx, [eq(importRecords.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [record] = await db.select().from(importRecords).where(whereClause);
    return record || undefined;
  }

  async createImportRecord(ctx: RequestContext, record: InsertImportRecord): Promise<ImportRecord> {
    const [created] = await db.insert(importRecords).values({ ...record, userId: getEffectiveUserId(ctx) }).returning();
    return created;
  }

  async updateImportRecord(ctx: RequestContext, id: string, updates: Partial<InsertImportRecord>): Promise<ImportRecord> {
    const existing = await this.getImportRecord(ctx, id);
    if (!existing) {
      throw new Error('Import record not found');
    }
    
    const [updated] = await db
      .update(importRecords)
      .set(updates)
      .where(eq(importRecords.id, id))
      .returning();
    return updated;
  }

  // Sequences
  async getSequences(ctx: RequestContext, limit = 20): Promise<Sequence[]> {
    let query = db
      .select()
      .from(sequences)
      .orderBy(desc(sequences.createdAt))
      .limit(limit);
    
    const whereClause = scopedWhere(sequences, ctx);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    return await query;
  }

  async getSequence(ctx: RequestContext, id: string): Promise<Sequence | undefined> {
    const whereClause = scopedWhere(sequences, ctx, [eq(sequences.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [sequence] = await db.select().from(sequences).where(whereClause);
    return sequence || undefined;
  }

  async createSequence(ctx: RequestContext, sequence: InsertSequence): Promise<Sequence> {
    const [created] = await db
      .insert(sequences)
      .values({ ...sequence, userId: getEffectiveUserId(ctx), updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateSequence(ctx: RequestContext, id: string, updates: Partial<Sequence>): Promise<Sequence> {
    const existing = await this.getSequence(ctx, id);
    if (!existing) {
      throw new Error('Sequence not found');
    }
    
    const [updated] = await db
      .update(sequences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sequences.id, id))
      .returning();
    return updated;
  }

  async deleteSequence(ctx: RequestContext, id: string): Promise<void> {
    const existing = await this.getSequence(ctx, id);
    if (!existing) {
      throw new Error('Sequence not found');
    }
    
    await db.delete(sequences).where(eq(sequences.id, id));
  }

  // Sequence Steps
  async getSequenceSteps(ctx: RequestContext, sequenceId: string): Promise<SequenceStep[]> {
    const sequence = await this.getSequence(ctx, sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    return await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);
  }

  async createSequenceStep(ctx: RequestContext, step: InsertSequenceStep): Promise<SequenceStep> {
    const sequence = await this.getSequence(ctx, step.sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    const [created] = await db
      .insert(sequenceSteps)
      .values({ ...step, updatedAt: new Date() })
      .returning();
    return created;
  }

  async deleteSequenceStep(ctx: RequestContext, stepId: string): Promise<void> {
    const [step] = await db.select().from(sequenceSteps).where(eq(sequenceSteps.id, stepId));
    if (!step) {
      throw new Error('Sequence step not found');
    }
    
    const sequence = await this.getSequence(ctx, step.sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    await db.delete(sequenceSteps).where(eq(sequenceSteps.id, stepId));
  }

  // Sequence Prospects
  async getSequenceProspects(ctx: RequestContext, sequenceId: string): Promise<Array<SequenceProspect & { prospect?: Prospect }>> {
    const sequence = await this.getSequence(ctx, sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    const results = await db
      .select({
        id: sequenceProspects.id,
        sequenceId: sequenceProspects.sequenceId,
        prospectId: sequenceProspects.prospectId,
        currentStepId: sequenceProspects.currentStepId,
        automationRunId: sequenceProspects.automationRunId,
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
    
    return results.map(r => ({
      ...r,
      prospect: r.prospect || undefined
    }));
  }

  async enrollProspects(ctx: RequestContext, sequenceId: string, prospectIds: string[]): Promise<SequenceProspect[]> {
    const sequence = await this.getSequence(ctx, sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    for (const prospectId of prospectIds) {
      const prospect = await this.getProspect(ctx, prospectId);
      if (!prospect) {
        throw new Error(`Prospect ${prospectId} not found`);
      }
    }
    
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
  async getSequenceEmails(ctx: RequestContext, sequenceId: string): Promise<Email[]> {
    const sequence = await this.getSequence(ctx, sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    return await db
      .select()
      .from(emails)
      .where(eq(emails.sequenceId, sequenceId));
  }

  // Email Replies
  async getEmailReplies(ctx: RequestContext, sequenceId: string): Promise<Array<EmailReply & { prospect?: Prospect | undefined }>> {
    const sequence = await this.getSequence(ctx, sequenceId);
    if (!sequence) {
      throw new Error('Sequence not found');
    }
    
    const results = await db
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
    
    return results.map(r => ({
      ...r,
      prospect: r.prospect || undefined
    }));
  }

  async createEmailReply(ctx: RequestContext, reply: InsertEmailReply): Promise<EmailReply> {
    if (reply.sequenceId) {
      const sequence = await this.getSequence(ctx, reply.sequenceId);
      if (!sequence) {
        throw new Error('Sequence not found');
      }
    }
    
    const [created] = await db.insert(emailReplies).values(reply).returning();
    return created;
  }

  // Personalization
  async createPersonalizationResult(ctx: RequestContext, result: InsertPersonalizationResult): Promise<PersonalizationResult> {
    const prospect = await this.getProspect(ctx, result.prospectId);
    if (!prospect) {
      throw new Error('Prospect not found');
    }
    
    // CRITICAL: Enforce userId from context for multi-tenant security
    // This prevents cross-tenant data injection via userId spoofing
    const effectiveUserId = getEffectiveUserId(ctx);
    
    // Security check: if caller provided userId, verify it matches context
    if (result.userId && result.userId !== effectiveUserId) {
      throw new Error(`Security violation: Attempted to create personalization result with mismatched userId. Context: ${effectiveUserId}, Provided: ${result.userId}`);
    }
    
    // Always use effectiveUserId from context (never trust caller-provided userId)
    const resultWithUserId = {
      ...result,
      userId: effectiveUserId
    };
    
    const [created] = await db.insert(personalizationResults).values(resultWithUserId).returning();
    return created;
  }

  async getPersonalizationResult(ctx: RequestContext, prospectId: string): Promise<PersonalizationResult | undefined> {
    const prospect = await this.getProspect(ctx, prospectId);
    if (!prospect) {
      return undefined;
    }
    
    const [result] = await db
      .select()
      .from(personalizationResults)
      .where(eq(personalizationResults.prospectId, prospectId))
      .orderBy(desc(personalizationResults.createdAt))
      .limit(1);
    return result || undefined;
  }

  // Content Library
  async getContentLibraryItems(ctx: RequestContext): Promise<ContentLibraryItem[]> {
    let query = db.select().from(contentLibrary).orderBy(desc(contentLibrary.createdAt));
    
    const whereClause = scopedWhere(contentLibrary, ctx);
    if (whereClause) {
      query = query.where(whereClause) as any;
    }
    
    return await query;
  }

  async getContentLibraryItem(ctx: RequestContext, id: string): Promise<ContentLibraryItem | undefined> {
    const whereClause = scopedWhere(contentLibrary, ctx, [eq(contentLibrary.id, id)]);
    if (!whereClause) {
      return undefined;
    }
    const [item] = await db.select().from(contentLibrary).where(whereClause);
    return item || undefined;
  }

  async createContentLibraryItem(ctx: RequestContext, item: InsertContentLibraryItem): Promise<ContentLibraryItem> {
    const [created] = await db.insert(contentLibrary).values({ ...item, userId: getEffectiveUserId(ctx) }).returning();
    return created;
  }

  async updateContentLibraryItem(ctx: RequestContext, id: string, updates: Partial<InsertContentLibraryItem>): Promise<ContentLibraryItem> {
    const existing = await this.getContentLibraryItem(ctx, id);
    if (!existing) {
      throw new Error('Content library item not found');
    }
    
    const [updated] = await db
      .update(contentLibrary)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(contentLibrary.id, id))
      .returning();
    return updated;
  }

  async deleteContentLibraryItem(ctx: RequestContext, id: string): Promise<void> {
    const existing = await this.getContentLibraryItem(ctx, id);
    if (!existing) {
      throw new Error('Content library item not found');
    }
    
    await db.delete(contentLibrary).where(eq(contentLibrary.id, id));
  }
}

export const storage = new DatabaseStorage();
