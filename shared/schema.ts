import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums
export const enrichmentStatusEnum = pgEnum("enrichment_status", ["new", "partial", "enriched", "failed"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const jobTypeEnum = pgEnum("job_type", ["enrichment", "import", "search"]);

// Prospects table
export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name"),
  primaryEmail: text("primary_email"),
  secondaryEmail: text("secondary_email"),
  jobTitle: text("job_title"),
  seniority: text("seniority"),
  department: text("department"),
  companyName: text("company_name"),
  companyDomain: text("company_domain"),
  companySize: text("company_size"),
  companyIndustry: text("company_industry"),
  companyLocation: text("company_location"),
  contactLocation: text("contact_location"),
  phoneNumber: text("phone_number"),
  linkedinUrl: text("linkedin_url"),
  apolloId: text("apollo_id"),
  enrichmentStatus: enrichmentStatusEnum("enrichment_status").default("new"),
  enrichmentData: jsonb("enrichment_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Searches table
export const searches = pgTable("searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  query: text("query").notNull(),
  aiFilters: jsonb("ai_filters"),
  apolloFilters: jsonb("apollo_filters"),
  totalResults: integer("total_results").default(0),
  importedResults: integer("imported_results").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Jobs table
export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: jobTypeEnum("type").notNull(),
  status: jobStatusEnum("status").default("queued"),
  title: text("title").notNull(),
  description: text("description"),
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  partialCount: integer("partial_count").default(0),
  jobData: jsonb("job_data"),
  results: jsonb("results"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Import records table
export const importRecords = pgTable("import_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id").references(() => jobs.id),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").default(0),
  validRows: integer("valid_rows").default(0),
  duplicateRows: integer("duplicate_rows").default(0),
  errorRows: integer("error_rows").default(0),
  fieldMappings: jsonb("field_mappings"),
  validationResults: jsonb("validation_results"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  importRecords: many(importRecords),
}));

export const importRecordsRelations = relations(importRecords, ({ one }) => ({
  job: one(jobs, {
    fields: [importRecords.jobId],
    references: [jobs.id],
  }),
}));

// Schemas
export const insertProspectSchema = createInsertSchema(prospects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSearchSchema = createInsertSchema(searches).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export const insertImportRecordSchema = createInsertSchema(importRecords).omit({
  id: true,
  createdAt: true,
});

// Types
export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;
export type Search = typeof searches.$inferSelect;
export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type ImportRecord = typeof importRecords.$inferSelect;
export type InsertImportRecord = z.infer<typeof insertImportRecordSchema>;

// Additional validation schemas
export const aiSearchSchema = z.object({
  query: z.string().min(1, "Search query is required"),
});

export const enrichmentRequestSchema = z.object({
  prospectIds: z.array(z.string()).min(1, "At least one prospect ID required"),
});

export const csvImportSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fieldMappings: z.record(z.string()),
  skipDuplicates: z.boolean().default(true),
  autoEnrich: z.boolean().default(false),
});

export type AISearchRequest = z.infer<typeof aiSearchSchema>;
export type EnrichmentRequest = z.infer<typeof enrichmentRequestSchema>;
export type CSVImportRequest = z.infer<typeof csvImportSchema>;
