import { 
  prospects, 
  searches, 
  jobs, 
  importRecords,
  type Prospect, 
  type InsertProspect,
  type Search,
  type InsertSearch, 
  type Job,
  type InsertJob,
  type ImportRecord,
  type InsertImportRecord
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, inArray, and, or, ilike, count } from "drizzle-orm";

export interface IStorage {
  // Prospects
  getProspects(filters?: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ prospects: Prospect[]; total: number }>;
  getProspect(id: string): Promise<Prospect | undefined>;
  createProspect(prospect: InsertProspect): Promise<Prospect>;
  updateProspect(id: string, updates: Partial<InsertProspect>): Promise<Prospect>;
  deleteProspect(id: string): Promise<void>;
  getProspectsByIds(ids: string[]): Promise<Prospect[]>;
  checkDuplicateProspects(emails: string[], domains?: string[]): Promise<Prospect[]>;
  
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
}

export class DatabaseStorage implements IStorage {
  // Prospects
  async getProspects(filters: {
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ prospects: Prospect[]; total: number }> {
    const { search, status, limit = 50, offset = 0 } = filters;
    
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
}

export const storage = new DatabaseStorage();
