import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Enums
export const enrichmentStatusEnum = pgEnum("enrichment_status", ["new", "partial", "enriched", "failed"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const jobTypeEnum = pgEnum("job_type", ["enrichment", "import", "search"]);
export const mailboxStatusEnum = pgEnum("mailbox_status", ["active", "paused", "error", "warming"]);
export const mailboxProviderEnum = pgEnum("mailbox_provider", ["gmail", "outlook", "smtp", "sendgrid"]);
export const emailQueueStatusEnum = pgEnum("email_queue_status", ["pending", "sending", "sent", "failed", "scheduled"]);
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
});

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
  userId: varchar("user_id").notNull(), // Multi-tenant owner - required
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
  sentiment: text("sentiment").default("neutral"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  aiSummary: text("ai_summary"),
  nextAction: text("next_action"),
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
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  personalizationScore: integer("personalization_score").notNull(),
  variables: jsonb("variables"),
  insights: jsonb("insights"),
  emailSuggestions: jsonb("email_suggestions"),
  contentRecommendations: jsonb("content_recommendations"),
  linkedinData: jsonb("linkedin_data"),
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

// User role enum
export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  role: userRoleEnum("role").notNull().default("user"),
  status: userStatusEnum("status").notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").default(false),
  lastLogin: timestamp("last_login"),
  createdBy: varchar("created_by"), // References users.id (self-referential)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

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
  status: text("status").notNull().default("pending"), // pending, accepted, expired, cancelled
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
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
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

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

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});
