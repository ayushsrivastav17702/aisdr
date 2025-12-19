import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums
export const enrichmentStatusEnum = pgEnum("enrichment_status", ["new", "partial", "enriched", "failed"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const jobTypeEnum = pgEnum("job_type", ["enrichment", "import", "search"]);
export const mailboxStatusEnum = pgEnum("mailbox_status", ["active", "paused", "error", "warming"]);
export const mailboxProviderEnum = pgEnum("mailbox_provider", ["gmail", "outlook", "smtp", "sendgrid"]);
export const emailQueueStatusEnum = pgEnum("email_queue_status", ["pending", "sending", "sent", "failed", "scheduled", "cancelled"]);
export const emailSendStatusEnum = pgEnum("email_send_status", ["success", "failed", "bounced"]);

// Prospects table
export const prospects = pgTable("prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
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
  tags: text("tags").array(),
  enrichmentStatus: enrichmentStatusEnum("enrichment_status").default("new"),
  enrichmentData: jsonb("enrichment_data"),
  leadScore: integer("lead_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("prospects_user_id_idx").on(table.userId),
  emailIdx: index("prospects_email_idx").on(table.primaryEmail),
  apolloIdIdx: index("prospects_apollo_id_idx").on(table.apolloId),
  createdAtIdx: index("prospects_created_at_idx").on(table.createdAt),
}));

// Searches table
export const searches = pgTable("searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  extractionName: text("extraction_name"),
  tag: text("tag"),
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
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
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
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
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

// ICP Templates table
export const icpTemplates = pgTable("icp_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // Multi-tenant owner - nullable for system default templates
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const insertIcpTemplateSchema = createInsertSchema(icpTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type IcpTemplate = typeof icpTemplates.$inferSelect;
export type InsertIcpTemplate = z.infer<typeof insertIcpTemplateSchema>;

// ICP Configuration Types
export interface ICPConfig {
  jobTitles?: string[];
  seniority?: string[];
  departments?: string[];
  industries?: string[];
  companySize?: {
    min?: number;
    max?: number;
    ranges?: string[];
  };
  locations?: string[];
  companyNames?: string[];
  revenueRange?: {
    min?: number;
    max?: number;
  };
  technologies?: string[];
  fundingStages?: string[];
  keywords?: string[];
}

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

// ============================================
// SEQUENCE BUILDER MODULE - NEW TABLES
// ============================================

// Sequences table
export const sequences = pgTable("sequences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull().default("outbound"),
  status: text("status").notNull().default("draft"),
  aiPersonalizationEnabled: boolean("ai_personalization_enabled").default(false),
  totalProspects: integer("total_prospects").default(0),
  activeProspects: integer("active_prospects").default(0),
  completedProspects: integer("completed_prospects").default(0),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sequence steps table
export const sequenceSteps = pgTable("sequence_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  stepOrder: integer("step_order").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  stepType: text("step_type").notNull().default("email"),
  aiGenerated: boolean("ai_generated").default(false),
  variables: jsonb("variables"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sequence prospects (bridge table)
export const sequenceProspects = pgTable("sequence_prospects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  currentStepId: varchar("current_step_id").references(() => sequenceSteps.id),
  automationRunId: varchar("automation_run_id"),
  status: text("status").notNull().default("active"),
  enrolledAt: timestamp("enrolled_at").notNull().defaultNow(),
  lastContactedAt: timestamp("last_contacted_at"),
  completedAt: timestamp("completed_at"),
  replies: integer("replies").default(0),
  opens: integer("opens").default(0),
  clicks: integer("clicks").default(0),
});

// Emails table
export const emails = pgTable("emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  sequenceId: varchar("sequence_id").references(() => sequences.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("draft"),
  personalizationScore: integer("personalization_score"),
  aiGenerated: boolean("ai_generated").default(false),
  isFollowUp: boolean("is_follow_up").default(false),
  parentEmailId: varchar("parent_email_id"),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  repliedAt: timestamp("replied_at"),
  deliveredAt: timestamp("delivered_at"),
  bouncedAt: timestamp("bounced_at"),
  trackingId: text("tracking_id"),
  messageId: text("message_id"), // RFC 5322 Message-ID for email threading
  createdAt: timestamp("created_at").defaultNow(),
});

// Email replies table
export const emailReplies = pgTable("email_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailId: varchar("email_id").references(() => emails.id, { onDelete: "cascade" }),
  sequenceId: varchar("sequence_id").references(() => sequences.id, { onDelete: "cascade" }),
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  replyContent: text("reply_content").notNull(),
  sentiment: text("sentiment").default("neutral"), // positive, negative, neutral, unsubscribe
  replyType: text("reply_type").default("human_reply"), // human_reply, ooo, bounce, auto_reply
  intent: text("intent"), // interested, meeting_request, not_now, question, objection, unsubscribe
  extractedInfo: jsonb("extracted_info"), // { preferredTime, questions, objections, returnDate }
  oooReturnDate: timestamp("ooo_return_date"), // For OOO auto-reschedule
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  aiSummary: text("ai_summary"),
  nextAction: text("next_action"),
  processed: boolean("processed").default(false), // Whether AI has processed this reply
  createdAt: timestamp("created_at").defaultNow(),
});

// AI follow-up jobs table
export const aiFollowupJobs = pgTable("ai_followup_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sequenceId: varchar("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  daysBetween: integer("days_between").notNull().default(3),
  maxFollowups: integer("max_followups").notNull().default(3),
  followupType: text("followup_type").notNull().default("gentle"),
  triggerCondition: text("trigger_condition").notNull().default("no_response"),
  totalSent: integer("total_sent").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Personalization results table
export const personalizationResults = pgTable("personalization_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required for security
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  personalizationScore: integer("personalization_score").notNull(),
  variables: jsonb("variables"),
  insights: jsonb("insights"),
  emailSuggestions: jsonb("email_suggestions"),
  contentRecommendations: jsonb("content_recommendations"),
  linkedinData: jsonb("linkedin_data"),
  status: text("status").default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

// Content library table
export const contentLibrary = pgTable("content_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  title: text("title").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  tags: jsonb("tags"),
  industry: text("industry"),
  useCase: text("use_case"),
  variables: jsonb("variables"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Sequence module relations
export const sequencesRelations = relations(sequences, ({ many }) => ({
  steps: many(sequenceSteps),
  sequenceProspects: many(sequenceProspects),
  aiFollowupJobs: many(aiFollowupJobs),
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one }) => ({
  sequence: one(sequences, {
    fields: [sequenceSteps.sequenceId],
    references: [sequences.id],
  }),
}));

export const sequenceProspectsRelations = relations(sequenceProspects, ({ one }) => ({
  sequence: one(sequences, {
    fields: [sequenceProspects.sequenceId],
    references: [sequences.id],
  }),
  prospect: one(prospects, {
    fields: [sequenceProspects.prospectId],
    references: [prospects.id],
  }),
}));

export const emailsRelations = relations(emails, ({ one, many }) => ({
  prospect: one(prospects, {
    fields: [emails.prospectId],
    references: [prospects.id],
  }),
  sequence: one(sequences, {
    fields: [emails.sequenceId],
    references: [sequences.id],
  }),
  replies: many(emailReplies),
}));

export const emailRepliesRelations = relations(emailReplies, ({ one }) => ({
  email: one(emails, {
    fields: [emailReplies.emailId],
    references: [emails.id],
  }),
  prospect: one(prospects, {
    fields: [emailReplies.prospectId],
    references: [prospects.id],
  }),
}));

export const personalizationResultsRelations = relations(personalizationResults, ({ one }) => ({
  prospect: one(prospects, {
    fields: [personalizationResults.prospectId],
    references: [prospects.id],
  }),
}));

// Sequence module types
export type Sequence = typeof sequences.$inferSelect;
export type InsertSequence = typeof sequences.$inferInsert;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type InsertSequenceStep = typeof sequenceSteps.$inferInsert;
export type SequenceProspect = typeof sequenceProspects.$inferSelect;
export type InsertSequenceProspect = typeof sequenceProspects.$inferInsert;
export type Email = typeof emails.$inferSelect;
export type InsertEmail = typeof emails.$inferInsert;
export type EmailReply = typeof emailReplies.$inferSelect;
export type InsertEmailReply = typeof emailReplies.$inferInsert;
export type AIFollowupJob = typeof aiFollowupJobs.$inferSelect;
export type InsertAIFollowupJob = typeof aiFollowupJobs.$inferInsert;
export type PersonalizationResult = typeof personalizationResults.$inferSelect;
export type InsertPersonalizationResult = typeof personalizationResults.$inferInsert;
export type ContentLibraryItem = typeof contentLibrary.$inferSelect;
export type InsertContentLibraryItem = typeof contentLibrary.$inferInsert;

// Sequence module schemas
export const insertSequenceSchema = createInsertSchema(sequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceStepSchema = createInsertSchema(sequenceSteps).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSequenceProspectSchema = createInsertSchema(sequenceProspects).omit({
  id: true,
  enrolledAt: true,
});

export const insertPersonalizationResultSchema = createInsertSchema(personalizationResults).omit({
  id: true,
  createdAt: true,
});

// ============================================
// AUTOMATION MODULE
// ============================================

// Automation status enum
export const automationStatusEnum = pgEnum("automation_status", [
  "draft",
  "scheduled", 
  "running", 
  "completed", 
  "paused", 
  "failed",
  "cancelled"
]);

// Automation runs table
export const automationRuns = pgTable("automation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  sequenceId: varchar("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  prospectCount: integer("prospect_count").notNull(),
  prospectSource: text("prospect_source").default("apollo"), // "apollo" or "existing"
  aiPersonalizationEnabled: boolean("ai_personalization_enabled").default(true),
  apolloFilters: jsonb("apollo_filters"),
  status: automationStatusEnum("status").default("running"),
  isStopped: boolean("is_stopped").default(false), // User-initiated stop vs pause
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  scheduledFor: timestamp("scheduled_for"), // Scheduling support
  timezone: text("timezone").default("UTC"), // Timezone for scheduling
  attemptCount: integer("attempt_count").default(0), // Retry tracking
  lastAttemptAt: timestamp("last_attempt_at"), // Last execution attempt
  prospectsAdded: integer("prospects_added").default(0),
  emailsSent: integer("emails_sent").default(0),
  repliesReceived: integer("replies_received").default(0),
  errors: text("errors"),
  errorLog: jsonb("error_log"), // Detailed error tracking [{prospectId, error, timestamp}]
  exclusionRules: jsonb("exclusion_rules"), // Filter rules {skipContacted, skipUnsubscribed, skipDuplicates}
  rateLimitConfig: jsonb("rate_limit_config"), // {dailyLimit, delayBetweenEmails, currentDailyCount}
  prospectsEnrolled: jsonb("prospects_enrolled").default(sql`'[]'::jsonb`), // Array of prospect IDs enrolled
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Unsubscribes table
export const unsubscribes = pgTable("unsubscribes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  reason: text("reason"),
  unsubscribedAt: timestamp("unsubscribed_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Automation Exclusion Log table
export const automationExclusionLog = pgTable("automation_exclusion_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  automationRunId: varchar("automation_run_id").notNull().references(() => automationRuns.id, { onDelete: "cascade" }),
  prospectEmail: text("prospect_email").notNull(),
  reason: text("reason").notNull(), // "unsubscribed", "previously_contacted", "duplicate"
  createdAt: timestamp("created_at").defaultNow(),
});

// Automation relations
export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  sequence: one(sequences, {
    fields: [automationRuns.sequenceId],
    references: [sequences.id],
  }),
}));

// Automation types
export type AutomationRun = typeof automationRuns.$inferSelect;
export type InsertAutomationRun = typeof automationRuns.$inferInsert;
export type Unsubscribe = typeof unsubscribes.$inferSelect;
export type InsertUnsubscribe = typeof unsubscribes.$inferInsert;
export type AutomationExclusionLog = typeof automationExclusionLog.$inferSelect;
export type InsertAutomationExclusionLog = typeof automationExclusionLog.$inferInsert;

// Automation schemas
export const insertAutomationRunSchema = createInsertSchema(automationRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export const insertUnsubscribeSchema = createInsertSchema(unsubscribes).omit({
  id: true,
  createdAt: true,
  unsubscribedAt: true,
});

export const insertAutomationExclusionLogSchema = createInsertSchema(automationExclusionLog).omit({
  id: true,
  createdAt: true,
});

// ============================================
// EMAIL MAILBOXES MODULE
// ============================================

// Email Mailboxes table
export const emailMailboxes = pgTable("email_mailboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  provider: mailboxProviderEnum("provider").notNull(),
  
  // SMTP Settings
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  smtpSecure: boolean("smtp_secure").default(true),
  
  // SendGrid/API Settings
  apiKey: text("api_key"),
  
  // OAuth Settings (for Gmail/Outlook)
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  tokenExpiry: timestamp("token_expiry"),
  
  // Mailbox Health
  status: mailboxStatusEnum("status").default("active"),
  dailyLimit: integer("daily_limit").default(200),
  dailySent: integer("daily_sent").default(0),
  lastResetAt: timestamp("last_reset_at").defaultNow(),
  minDelayMs: integer("min_delay_ms").default(30000), // Minimum delay between emails (30s default)
  nextAvailableAt: timestamp("next_available_at"), // When mailbox can next be used
  
  // Reputation
  bounceRate: integer("bounce_rate").default(0),
  spamScore: integer("spam_score").default(0),
  warmupStage: integer("warmup_stage").default(0),
  
  // Assignment
  isDefault: boolean("is_default").default(false),
  roundRobinOrder: integer("round_robin_order").default(0),
  
  // Email Signature
  signature: text("signature"),
  
  // Metadata
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Email Queue table
export const emailQueue = pgTable("email_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  emailId: varchar("email_id").references(() => emails.id, { onDelete: "cascade" }),
  mailboxId: varchar("mailbox_id").notNull().references(() => emailMailboxes.id),
  sequenceId: varchar("sequence_id").references(() => sequences.id, { onDelete: "cascade" }),
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  
  status: emailQueueStatusEnum("status").default("pending"),
  priority: integer("priority").default(5),
  
  scheduledFor: timestamp("scheduled_for").notNull(),
  sentAt: timestamp("sent_at"),
  failedAt: timestamp("failed_at"),
  
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  lastError: text("last_error"),
  
  // Email Content (denormalized for queue processing)
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  
  // Sequence tracking
  stepOrder: integer("step_order"), // Which step in the sequence (1, 2, 3, etc.)
  
  // Email Threading Headers
  inReplyTo: text("in_reply_to"), // Message-ID of the email this is replying to
  references: text("references"), // Space-separated Message-IDs for the entire thread
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email Send Log table
export const emailSendLog = pgTable("email_send_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
  queueId: varchar("queue_id").references(() => emailQueue.id),
  mailboxId: varchar("mailbox_id").notNull().references(() => emailMailboxes.id),
  
  status: emailSendStatusEnum("status").notNull(),
  messageId: text("message_id"),
  
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  
  error: text("error"),
  responseCode: integer("response_code"),
  responseMessage: text("response_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Email mailbox types
export type EmailMailbox = typeof emailMailboxes.$inferSelect;
export type InsertEmailMailbox = typeof emailMailboxes.$inferInsert;
export type EmailQueueItem = typeof emailQueue.$inferSelect;
export type InsertEmailQueueItem = typeof emailQueue.$inferInsert;
export type EmailSendLogEntry = typeof emailSendLog.$inferSelect;
export type InsertEmailSendLogEntry = typeof emailSendLog.$inferInsert;

// Email mailbox schemas
export const insertEmailMailboxSchema = createInsertSchema(emailMailboxes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  dailySent: true,
  lastResetAt: true,
  lastUsedAt: true,
});

export const insertEmailQueueSchema = createInsertSchema(emailQueue).omit({
  id: true,
  createdAt: true,
  sentAt: true,
  failedAt: true,
});

// ============================================
// USER MANAGEMENT MODULE
// ============================================

// User status enum
export const userStatusEnum = pgEnum("user_status", ["active", "inactive", "suspended", "invited", "pending"]);

// User role enum - extended with manager and read-only roles
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "user", "read_only"]);

// Auth provider enum for passwordless login
export const authProviderEnum = pgEnum("auth_provider", ["google", "microsoft", "magic", "password"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // Nullable for OAuth users
  authProvider: authProviderEnum("auth_provider").default("password"), // Primary auth method
  passwordLoginEnabled: boolean("password_login_enabled").default(false), // Restricted password login
  forcePasswordReset: boolean("force_password_reset").default(false), // Force password change on next login
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").default(false),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  onboardingSteps: jsonb("onboarding_steps").$type<{
    mailboxConnected?: boolean;
    sequenceCreated?: boolean;
    prospectsAdded?: boolean;
    firstCampaignLaunched?: boolean;
  }>(),
  organizationId: varchar("organization_id"), // Organization membership (nullable for existing users)
  defaultWorkspaceId: varchar("default_workspace_id"), // Default workspace for user
  lastLogin: timestamp("last_login"),
  createdBy: varchar("created_by"), // References users.id (self-referential)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  orgIdIdx: index("users_organization_id_idx").on(table.organizationId),
}));

// User sessions table
export const userSessions = pgTable("user_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceInfo: text("device_info"),
  isActive: boolean("is_active").notNull().default(true),
  rememberMe: boolean("remember_me").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User invitations table
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: userRoleEnum("role").notNull().default("user"),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  organizationId: varchar("organization_id"), // Organization to join upon acceptance
  workspaceId: varchar("workspace_id"), // Workspace to join upon acceptance
  status: text("status").notNull().default("pending"), // pending, accepted, expired, cancelled
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Magic links table for passwordless login
export const magicLinks = pgTable("magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(), // Store hashed token for security
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("magic_links_email_idx").on(table.email),
  expiresAtIdx: index("magic_links_expires_at_idx").on(table.expiresAt),
}));

// Email verification tokens table
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Audit logs table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  module: text("module"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Account lockout tracking table
export const accountLockouts = pgTable("account_lockouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastAttemptAt: timestamp("last_attempt_at").notNull().defaultNow(),
  recentIPs: jsonb("recent_ips").$type<string[]>().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(userSessions),
  sentInvitations: many(userInvitations),
  auditLogs: many(auditLogs),
}));

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));

export const userInvitationsRelations = relations(userInvitations, ({ one }) => ({
  inviter: one(users, {
    fields: [userInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// User types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;
export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type AccountLockout = typeof accountLockouts.$inferSelect;
export type InsertAccountLockout = typeof accountLockouts.$inferInsert;

// User schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  lastLogin: true,
});

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
  lastActivity: true,
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const insertMagicLinkSchema = createInsertSchema(magicLinks).omit({
  id: true,
  createdAt: true,
  usedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

// ============================================
// ORGANIZATION & WORKSPACE MANAGEMENT MODULE
// ============================================

// Organization status enum
export const organizationStatusEnum = pgEnum("organization_status", ["active", "suspended", "archived"]);

// Workspace status enum
export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "archived", "deleted"]);

// Organizations table
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  brandingColors: jsonb("branding_colors").$type<{
    primary?: string;
    secondary?: string;
    accent?: string;
  }>(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  postalCode: text("postal_code"),
  industry: text("industry"),
  companySize: text("company_size"),
  website: text("website"),
  phone: text("phone"),
  timezone: text("timezone").default("UTC"),
  language: text("language").default("en"),
  fiscalYearStart: integer("fiscal_year_start").default(1),
  reportingPeriod: text("reporting_period").default("monthly"),
  preferences: jsonb("preferences").$type<{
    emailSignature?: string;
    defaultSenderName?: string;
    notificationsEnabled?: boolean;
    weeklyReports?: boolean;
    dataRetentionDays?: number;
  }>(),
  status: organizationStatusEnum("status").default("active"),
  ownerId: varchar("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: index("organizations_slug_idx").on(table.slug),
  ownerIdIdx: index("organizations_owner_id_idx").on(table.ownerId),
}));

// Workspaces table
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  type: text("type").default("default"),
  parentId: varchar("parent_id"),
  settings: jsonb("settings").$type<{
    dailyEmailLimit?: number;
    aiPersonalizationEnabled?: boolean;
    defaultSequenceSettings?: object;
    allowedDomains?: string[];
    customFields?: object;
  }>(),
  resourceLimits: jsonb("resource_limits").$type<{
    maxProspects?: number;
    maxSequences?: number;
    maxMailboxes?: number;
    maxDailyEmails?: number;
  }>(),
  status: workspaceStatusEnum("status").default("active"),
  ownerId: varchar("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  orgIdIdx: index("workspaces_organization_id_idx").on(table.organizationId),
  slugIdx: index("workspaces_slug_idx").on(table.slug),
  parentIdIdx: index("workspaces_parent_id_idx").on(table.parentId),
}));

// User-Workspace membership table (many-to-many)
export const workspaceMemberships = pgTable("workspace_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  permissions: jsonb("permissions").$type<string[]>(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  invitedBy: varchar("invited_by").references(() => users.id),
}, (table) => ({
  workspaceUserIdx: index("workspace_memberships_workspace_user_idx").on(table.workspaceId, table.userId),
}));

// Organization relations
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  owner: one(users, {
    fields: [organizations.ownerId],
    references: [users.id],
  }),
  workspaces: many(workspaces),
}));

// Workspace relations
export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workspaces.organizationId],
    references: [organizations.id],
  }),
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  parent: one(workspaces, {
    fields: [workspaces.parentId],
    references: [workspaces.id],
    relationName: "workspaceHierarchy",
  }),
  children: many(workspaces, { relationName: "workspaceHierarchy" }),
  memberships: many(workspaceMemberships),
}));

// Workspace membership relations
export const workspaceMembershipsRelations = relations(workspaceMemberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMemberships.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMemberships.userId],
    references: [users.id],
  }),
  inviter: one(users, {
    fields: [workspaceMemberships.invitedBy],
    references: [users.id],
  }),
}));

// Organization types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMembership = typeof workspaceMemberships.$inferSelect;
export type InsertWorkspaceMembership = typeof workspaceMemberships.$inferInsert;

// Organization schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  ownerId: true,
}).partial();

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});

export const updateWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  organizationId: true,
}).partial();

export const insertWorkspaceMembershipSchema = createInsertSchema(workspaceMemberships).omit({
  id: true,
  joinedAt: true,
});

// ============================================
// ROLE-BASED ACCESS CONTROL (RBAC) MODULE
// ============================================

// Permission category enum
export const permissionCategoryEnum = pgEnum("permission_category", [
  "campaign", "prospect", "analytics", "settings", "user_management", "workspace", "team"
]);

// Permission scope enum
export const permissionScopeEnum = pgEnum("permission_scope", [
  "organization", "workspace", "team"
]);

// Team role enum
export const teamRoleEnum = pgEnum("team_role", ["lead", "manager", "member"]);

// Team visibility enum
export const teamVisibilityEnum = pgEnum("team_visibility", ["private", "team_only", "organization"]);

// License tier enum
export const licenseTierEnum = pgEnum("license_tier", ["free", "basic", "professional", "enterprise"]);

// Permissions table - defines all available permissions
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "campaign.create", "prospect.export"
  name: text("name").notNull(),
  description: text("description"),
  category: permissionCategoryEnum("category").notNull(),
  isSystem: boolean("is_system").default(true), // System permissions cannot be deleted
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("permissions_category_idx").on(table.category),
}));

// Roles table - custom roles with permissions
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  scope: permissionScopeEnum("scope").default("organization"), // Where this role applies
  isSystem: boolean("is_system").default(false), // System roles: Admin, Manager, User, Read-Only
  isDefault: boolean("is_default").default(false), // Default role for new users
  inheritsFromRoleId: varchar("inherits_from_role_id"), // Role inheritance
  color: text("color"), // UI color for role badge
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("roles_organization_id_idx").on(table.organizationId),
}));

// Role permissions join table
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  roleIdIdx: index("role_permissions_role_id_idx").on(table.roleId),
  permissionIdIdx: index("role_permissions_permission_id_idx").on(table.permissionId),
}));

// User role assignments - assigns roles to users with optional scope
export const userRoleAssignments = pgTable("user_role_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: varchar("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  scopeType: permissionScopeEnum("scope_type").default("organization"), // organization, workspace, team
  scopeId: varchar("scope_id"), // ID of the org/workspace/team
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at"), // Optional expiration
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_role_assignments_user_id_idx").on(table.userId),
  roleIdIdx: index("user_role_assignments_role_id_idx").on(table.roleId),
}));

// User permission overrides - override permissions for specific users
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  allowed: boolean("allowed").notNull(), // true = grant, false = deny
  scopeType: permissionScopeEnum("scope_type").default("organization"),
  scopeId: varchar("scope_id"),
  reason: text("reason"), // Why this override was created
  grantedBy: varchar("granted_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_permission_overrides_user_id_idx").on(table.userId),
  permissionIdIdx: index("user_permission_overrides_permission_id_idx").on(table.permissionId),
}));

// ============================================
// TEAM STRUCTURE MODULE
// ============================================

// Teams table
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: "set null" }), // Optional workspace association
  parentTeamId: varchar("parent_team_id"), // Self-reference for sub-teams
  name: text("name").notNull(),
  description: text("description"),
  territory: text("territory"), // Territory or segment this team handles
  visibility: teamVisibilityEnum("visibility").default("team_only"),
  quotas: jsonb("quotas").$type<{
    monthlyProspects?: number;
    monthlyEmails?: number;
    monthlyMeetings?: number;
    revenueTarget?: number;
  }>(),
  goals: jsonb("goals").$type<{
    q1?: { target: number; achieved: number };
    q2?: { target: number; achieved: number };
    q3?: { target: number; achieved: number };
    q4?: { target: number; achieved: number };
    annual?: { target: number; achieved: number };
  }>(),
  settings: jsonb("settings").$type<{
    allowCrossTeamView?: boolean;
    requireApprovalForOutreach?: boolean;
    shareProspectsWithinTeam?: boolean;
    notifyLeadOnNewMembers?: boolean;
  }>(),
  color: text("color"), // UI color for team
  icon: text("icon"), // Icon identifier
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  archivedAt: timestamp("archived_at"),
}, (table) => ({
  orgIdIdx: index("teams_organization_id_idx").on(table.organizationId),
  workspaceIdIdx: index("teams_workspace_id_idx").on(table.workspaceId),
  parentTeamIdIdx: index("teams_parent_team_id_idx").on(table.parentTeamId),
}));

// Team members table
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: teamRoleEnum("role").default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  leftAt: timestamp("left_at"),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => ({
  teamIdIdx: index("team_members_team_id_idx").on(table.teamId),
  userIdIdx: index("team_members_user_id_idx").on(table.userId),
}));

// ============================================
// EXTENDED USER PROFILE & LICENSE MANAGEMENT
// ============================================

// User profiles table - extended profile data
export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  jobTitle: text("job_title"),
  department: text("department"),
  phone: text("phone"),
  timezone: text("timezone"),
  language: text("language").default("en"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  linkedinUrl: text("linkedin_url"),
  territory: text("territory"), // Assigned territory
  manager: varchar("manager").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  preferences: jsonb("preferences").$type<{
    emailNotifications?: boolean;
    slackNotifications?: boolean;
    weeklyDigest?: boolean;
    theme?: string;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User license allocations - track license usage
export const userLicenses = pgTable("user_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  tier: licenseTierEnum("tier").default("basic"),
  allocatedAt: timestamp("allocated_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  allocatedBy: varchar("allocated_by").references(() => users.id, { onDelete: "set null" }),
  features: jsonb("features").$type<{
    maxProspects?: number;
    maxSequences?: number;
    maxEmailsPerDay?: number;
    aiPersonalization?: boolean;
    advancedAnalytics?: boolean;
    apiAccess?: boolean;
  }>(),
});

// Organization license summary - aggregate license tracking
export const organizationLicenses = pgTable("organization_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  totalSeats: jsonb("total_seats").$type<{
    free?: number;
    basic?: number;
    professional?: number;
    enterprise?: number;
  }>(),
  usedSeats: jsonb("used_seats").$type<{
    free?: number;
    basic?: number;
    professional?: number;
    enterprise?: number;
  }>(),
  billingCycle: text("billing_cycle").default("monthly"),
  renewsAt: timestamp("renews_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// User activity logs - detailed activity tracking
export const userActivityLogs = pgTable("user_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(), // e.g., "prospect.create", "sequence.send", "login"
  targetType: text("target_type"), // e.g., "prospect", "sequence", "campaign"
  targetId: varchar("target_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  duration: integer("duration"), // Duration in milliseconds for timed actions
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_activity_logs_user_id_idx").on(table.userId),
  actionIdx: index("user_activity_logs_action_idx").on(table.action),
  createdAtIdx: index("user_activity_logs_created_at_idx").on(table.createdAt),
}));

// ============================================
// RBAC RELATIONS
// ============================================

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userOverrides: many(userPermissionOverrides),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [roles.organizationId],
    references: [organizations.id],
  }),
  inheritsFrom: one(roles, {
    fields: [roles.inheritsFromRoleId],
    references: [roles.id],
    relationName: "roleInheritance",
  }),
  children: many(roles, { relationName: "roleInheritance" }),
  rolePermissions: many(rolePermissions),
  userAssignments: many(userRoleAssignments),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userRoleAssignments.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoleAssignments.roleId],
    references: [roles.id],
  }),
  assignedByUser: one(users, {
    fields: [userRoleAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const userPermissionOverridesRelations = relations(userPermissionOverrides, ({ one }) => ({
  user: one(users, {
    fields: [userPermissionOverrides.userId],
    references: [users.id],
  }),
  permission: one(permissions, {
    fields: [userPermissionOverrides.permissionId],
    references: [permissions.id],
  }),
  grantedByUser: one(users, {
    fields: [userPermissionOverrides.grantedBy],
    references: [users.id],
  }),
}));

// ============================================
// TEAM RELATIONS
// ============================================

export const teamsRelations = relations(teams, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [teams.organizationId],
    references: [organizations.id],
  }),
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id],
  }),
  parent: one(teams, {
    fields: [teams.parentTeamId],
    references: [teams.id],
    relationName: "teamHierarchy",
  }),
  children: many(teams, { relationName: "teamHierarchy" }),
  members: many(teamMembers),
  creator: one(users, {
    fields: [teams.createdBy],
    references: [users.id],
  }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
  addedByUser: one(users, {
    fields: [teamMembers.addedBy],
    references: [users.id],
  }),
}));

// ============================================
// USER PROFILE & LICENSE RELATIONS
// ============================================

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
  managerUser: one(users, {
    fields: [userProfiles.manager],
    references: [users.id],
  }),
}));

export const userLicensesRelations = relations(userLicenses, ({ one }) => ({
  user: one(users, {
    fields: [userLicenses.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userLicenses.organizationId],
    references: [organizations.id],
  }),
  allocatedByUser: one(users, {
    fields: [userLicenses.allocatedBy],
    references: [users.id],
  }),
}));

export const organizationLicensesRelations = relations(organizationLicenses, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationLicenses.organizationId],
    references: [organizations.id],
  }),
}));

export const userActivityLogsRelations = relations(userActivityLogs, ({ one }) => ({
  user: one(users, {
    fields: [userActivityLogs.userId],
    references: [users.id],
  }),
}));

// ============================================
// RBAC TYPES
// ============================================

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = typeof rolePermissions.$inferInsert;
export type UserRoleAssignment = typeof userRoleAssignments.$inferSelect;
export type InsertUserRoleAssignment = typeof userRoleAssignments.$inferInsert;
export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type InsertUserPermissionOverride = typeof userPermissionOverrides.$inferInsert;

// ============================================
// TEAM TYPES
// ============================================

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

// ============================================
// USER PROFILE & LICENSE TYPES
// ============================================

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type UserLicense = typeof userLicenses.$inferSelect;
export type InsertUserLicense = typeof userLicenses.$inferInsert;
export type OrganizationLicense = typeof organizationLicenses.$inferSelect;
export type InsertOrganizationLicense = typeof organizationLicenses.$inferInsert;
export type UserActivityLog = typeof userActivityLogs.$inferSelect;
export type InsertUserActivityLog = typeof userActivityLogs.$inferInsert;

// ============================================
// RBAC SCHEMAS
// ============================================

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  organizationId: true,
}).partial();

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserRoleAssignmentSchema = createInsertSchema(userRoleAssignments).omit({
  id: true,
  createdAt: true,
});

export const insertUserPermissionOverrideSchema = createInsertSchema(userPermissionOverrides).omit({
  id: true,
  createdAt: true,
});

// ============================================
// TEAM SCHEMAS
// ============================================

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
});

export const updateTeamSchema = createInsertSchema(teams).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  archivedAt: true,
  organizationId: true,
}).partial();

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  joinedAt: true,
  leftAt: true,
});

// ============================================
// USER PROFILE & LICENSE SCHEMAS
// ============================================

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
}).partial();

export const insertUserLicenseSchema = createInsertSchema(userLicenses).omit({
  id: true,
  allocatedAt: true,
});

export const insertUserActivityLogSchema = createInsertSchema(userActivityLogs).omit({
  id: true,
  createdAt: true,
});
