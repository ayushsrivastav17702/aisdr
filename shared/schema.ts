import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean, integer, pgEnum, index, real, uniqueIndex, date } from "drizzle-orm/pg-core";
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
}, (table) => ({
  sequenceIdIdx: index("email_replies_sequence_id_idx").on(table.sequenceId),
  sequenceReceivedIdx: index("email_replies_sequence_received_idx").on(table.sequenceId, table.receivedAt),
  sentimentIdx: index("email_replies_sentiment_idx").on(table.sentiment),
  prospectIdIdx: index("email_replies_prospect_id_idx").on(table.prospectId),
}));

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

// Message templates table - for saving successful email templates
export const messageTemplates = pgTable("message_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  subjectLine: varchar("subject_line", { length: 255 }),
  body: text("body").notNull(),
  type: varchar("type", { length: 50 }).default("personal"), // personal, team, company
  tone: varchar("tone", { length: 50 }).default("professional"), // professional, casual, consultative, direct
  category: varchar("category", { length: 100 }), // cold_outreach, follow_up, breakup, meeting_request
  variables: jsonb("variables"), // Available variables like {{FirstName}}, {{Company}}
  useCount: integer("use_count").default(0),
  totalSent: integer("total_sent").default(0),
  totalOpens: integer("total_opens").default(0),
  totalReplies: integer("total_replies").default(0),
  avgReplyRate: real("avg_reply_rate"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI generations tracking table - for tracking AI usage and costs
export const aiGenerations = pgTable("ai_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull(),
  generationType: varchar("generation_type", { length: 100 }).notNull(), // email, subject_line, reply_suggestion, sentiment_analysis
  prompt: text("prompt"),
  response: text("response"),
  model: varchar("model", { length: 100 }), // gpt-4o, claude-sonnet-4, etc.
  provider: varchar("provider", { length: 50 }), // openai, anthropic, openrouter
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  costUsd: real("cost_usd"),
  latencyMs: integer("latency_ms"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Additional context like prospectId, sequenceId
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily metrics aggregation table
export const metricsDaily = pgTable("metrics_daily", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull(),
  date: date("date").notNull(),
  emailsSent: integer("emails_sent").default(0),
  emailsOpened: integer("emails_opened").default(0),
  emailsClicked: integer("emails_clicked").default(0),
  repliesReceived: integer("replies_received").default(0),
  positiveReplies: integer("positive_replies").default(0),
  negativeReplies: integer("negative_replies").default(0),
  meetingsBooked: integer("meetings_booked").default(0),
  bounces: integer("bounces").default(0),
  unsubscribes: integer("unsubscribes").default(0),
  aiCreditsUsed: integer("ai_credits_used").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User quotas table for tracking usage limits
export const userQuotas = pgTable("user_quotas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull(),
  period: varchar("period", { length: 50 }).notNull(), // daily, weekly, monthly, quarterly
  quotaType: varchar("quota_type", { length: 50 }).notNull(), // emails, meetings, replies, ai_credits
  quotaValue: integer("quota_value").notNull(),
  currentValue: integer("current_value").default(0),
  startDate: date("start_date"),
  endDate: date("end_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Conversations table for threading replies
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id"),
  userId: varchar("user_id").notNull(),
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 255 }),
  lastMessageAt: timestamp("last_message_at"),
  messageCount: integer("message_count").default(0),
  status: varchar("status", { length: 50 }).default("active"), // active, archived, qualified, lost
  priority: integer("priority").default(5), // 1-10 scale
  assignedTo: varchar("assigned_to"),
  tags: jsonb("tags"),
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
export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type InsertMessageTemplate = typeof messageTemplates.$inferInsert;
export type AIGeneration = typeof aiGenerations.$inferSelect;
export type InsertAIGeneration = typeof aiGenerations.$inferInsert;
export type MetricsDaily = typeof metricsDaily.$inferSelect;
export type InsertMetricsDaily = typeof metricsDaily.$inferInsert;
export type UserQuota = typeof userQuotas.$inferSelect;
export type InsertUserQuota = typeof userQuotas.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

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
}, (table) => ({
  sequenceIdIdx: index("email_queue_sequence_id_idx").on(table.sequenceId),
  userStatusSentIdx: index("email_queue_user_status_sent_idx").on(table.userId, table.status, table.sentAt),
  statusScheduledIdx: index("email_queue_status_scheduled_idx").on(table.status, table.scheduledFor),
  mailboxIdIdx: index("email_queue_mailbox_id_idx").on(table.mailboxId),
}));

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
  email: text("email").notNull().unique(), // Global unique required for authentication
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
  createdBy: varchar("created_by"), // References users.id (self-referential) - Manager who created this user
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => ({
  orgIdIdx: index("users_organization_id_idx").on(table.organizationId),
  createdByIdx: index("users_created_by_idx").on(table.createdBy), // Index for manager lookups
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

// ============================================
// EMAIL INFRASTRUCTURE MODULE
// ============================================

// Domain verification status enum
export const domainVerificationStatusEnum = pgEnum("domain_verification_status", ["pending", "verified", "failed", "expired"]);

// Sending Domains table
export const sendingDomains = pgTable("sending_domains", {
  id: varchar("id").primaryKey().$defaultFn(() => `dom_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull(),
  
  // DNS Records
  dkimSelector: varchar("dkim_selector", { length: 255 }),
  dkimPublicKey: text("dkim_public_key"),
  dkimPrivateKey: text("dkim_private_key"), // Encrypted
  spfRecord: text("spf_record"),
  dmarcRecord: text("dmarc_record"),
  returnPath: varchar("return_path", { length: 255 }),
  
  // Verification
  verificationStatus: domainVerificationStatusEnum("verification_status").default("pending"),
  verificationToken: varchar("verification_token", { length: 255 }),
  verifiedAt: timestamp("verified_at"),
  lastVerifiedAt: timestamp("last_verified_at"),
  
  // Health
  healthScore: integer("health_score").default(100),
  lastHealthCheck: timestamp("last_health_check"),
  healthIssues: jsonb("health_issues").$type<string[]>(),
  
  // Status
  isActive: boolean("is_active").default(true),
  isPrimary: boolean("is_primary").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgDomainIdx: index("sending_domains_org_domain_idx").on(table.organizationId, table.domain),
}));

// Mailbox-Team allocation table
export const mailboxTeamAllocations = pgTable("mailbox_team_allocations", {
  id: varchar("id").primaryKey().$defaultFn(() => `mta_${Date.now()}`),
  mailboxId: varchar("mailbox_id").notNull().references(() => emailMailboxes.id, { onDelete: "cascade" }),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  priority: integer("priority").default(1),
  allocatedAt: timestamp("allocated_at").defaultNow(),
  allocatedBy: varchar("allocated_by").references(() => users.id),
}, (table) => ({
  mailboxTeamIdx: index("mailbox_team_allocations_idx").on(table.mailboxId, table.teamId),
}));

// Mailbox warmup schedules
export const mailboxWarmupSchedules = pgTable("mailbox_warmup_schedules", {
  id: varchar("id").primaryKey().$defaultFn(() => `mws_${Date.now()}`),
  mailboxId: varchar("mailbox_id").notNull().references(() => emailMailboxes.id, { onDelete: "cascade" }),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  
  // Warmup configuration
  initialDailyLimit: integer("initial_daily_limit").default(5),
  targetDailyLimit: integer("target_daily_limit").default(100),
  incrementPerDay: integer("increment_per_day").default(5),
  currentStage: integer("current_stage").default(1),
  totalStages: integer("total_stages").default(20),
  
  // Schedule
  sendWindowStart: integer("send_window_start").default(9), // Hour (0-23)
  sendWindowEnd: integer("send_window_end").default(17),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  excludeWeekends: boolean("exclude_weekends").default(true),
  
  isActive: boolean("is_active").default(true),
  pausedAt: timestamp("paused_at"),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// API ACCESS MANAGEMENT MODULE
// ============================================

// API Key status enum
export const apiKeyStatusEnum = pgEnum("api_key_status", ["active", "revoked", "expired"]);

// API Keys table
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().$defaultFn(() => `apikey_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(), // First 8 chars shown to user
  keyHash: varchar("key_hash", { length: 255 }).notNull(), // Hashed full key
  
  // Permissions
  permissions: jsonb("permissions").$type<string[]>().default([]),
  scopes: jsonb("scopes").$type<{
    prospects?: boolean;
    campaigns?: boolean;
    sequences?: boolean;
    analytics?: boolean;
    settings?: boolean;
  }>(),
  
  // Rate limits
  rateLimitPerMinute: integer("rate_limit_per_minute").default(60),
  rateLimitPerDay: integer("rate_limit_per_day").default(10000),
  
  // Usage tracking
  lastUsedAt: timestamp("last_used_at"),
  usageCount: integer("usage_count").default(0),
  
  // Lifecycle
  status: apiKeyStatusEnum("status").default("active"),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  revokedBy: varchar("revoked_by").references(() => users.id),
  revokeReason: text("revoke_reason"),
  
  // IP restrictions (optional)
  allowedIps: jsonb("allowed_ips").$type<string[]>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdx: index("api_keys_organization_id_idx").on(table.organizationId),
  userIdx: index("api_keys_user_id_idx").on(table.userId),
  prefixIdx: index("api_keys_key_prefix_idx").on(table.keyPrefix),
}));

// API Usage logs
export const apiUsageLogs = pgTable("api_usage_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => `apiul_${Date.now()}`),
  apiKeyId: varchar("api_key_id").notNull().references(() => apiKeys.id, { onDelete: "cascade" }),
  
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  requestSize: integer("request_size"),
  responseSize: integer("response_size"),
  
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  apiKeyIdx: index("api_usage_logs_api_key_id_idx").on(table.apiKeyId),
  createdAtIdx: index("api_usage_logs_created_at_idx").on(table.createdAt),
}));

// Webhook event types enum
export const webhookEventTypeEnum = pgEnum("webhook_event_type", [
  "email.sent", "email.delivered", "email.opened", "email.clicked", "email.bounced", "email.replied",
  "prospect.created", "prospect.updated", "prospect.enriched",
  "sequence.started", "sequence.completed", "sequence.paused",
  "campaign.created", "campaign.completed"
]);

// Webhooks table
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().$defaultFn(() => `webhook_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  
  // Events
  events: jsonb("events").$type<string[]>().notNull(),
  
  // Authentication
  authType: varchar("auth_type", { length: 50 }).default("none"), // none, bearer, basic, hmac
  authToken: text("auth_token"), // Encrypted
  authHeader: varchar("auth_header", { length: 100 }),
  hmacSecret: text("hmac_secret"), // Encrypted
  
  // Retry policy
  maxRetries: integer("max_retries").default(3),
  retryDelaySeconds: integer("retry_delay_seconds").default(60),
  timeoutSeconds: integer("timeout_seconds").default(30),
  
  // Status
  isActive: boolean("is_active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  consecutiveFailures: integer("consecutive_failures").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgIdx: index("webhooks_organization_id_idx").on(table.organizationId),
}));

// Webhook delivery logs
export const webhookDeliveryLogs = pgTable("webhook_delivery_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => `whdl_${Date.now()}`),
  webhookId: varchar("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  
  eventType: varchar("event_type", { length: 50 }).notNull(),
  payload: jsonb("payload"),
  
  // Response
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  responseTimeMs: integer("response_time_ms"),
  
  // Retry info
  attemptNumber: integer("attempt_number").default(1),
  nextRetryAt: timestamp("next_retry_at"),
  
  success: boolean("success").default(false),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  webhookIdx: index("webhook_delivery_logs_webhook_id_idx").on(table.webhookId),
}));

// ============================================
// EMAIL DELIVERABILITY SETTINGS (FR-A19)
// ============================================

// Organization email settings
export const emailDeliverabilitySettings = pgTable("email_deliverability_settings", {
  id: varchar("id").primaryKey().$defaultFn(() => `eds_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Global send limits
  globalDailyLimit: integer("global_daily_limit").default(1000),
  globalHourlyLimit: integer("global_hourly_limit").default(100),
  perProspectMaxEmails: integer("per_prospect_max_emails").default(5),
  minTimeBetweenEmailsHours: integer("min_time_between_emails_hours").default(24),
  
  // Bounce handling
  hardBounceAction: varchar("hard_bounce_action", { length: 50 }).default("remove"), // remove, pause, mark
  softBounceRetries: integer("soft_bounce_retries").default(3),
  softBounceAction: varchar("soft_bounce_action", { length: 50 }).default("pause"),
  bounceThresholdPercent: integer("bounce_threshold_percent").default(5),
  
  // Unsubscribe settings
  unsubscribePageUrl: text("unsubscribe_page_url"),
  unsubscribePageLogo: text("unsubscribe_page_logo"),
  unsubscribePageMessage: text("unsubscribe_page_message"),
  unsubscribeConfirmationEmail: boolean("unsubscribe_confirmation_email").default(true),
  
  // Email signature templates
  companySignature: text("company_signature"),
  signatureIncludeAddress: boolean("signature_include_address").default(true),
  signatureIncludePhone: boolean("signature_include_phone").default(false),
  signatureIncludeWebsite: boolean("signature_include_website").default(true),
  signatureIncludeSocial: boolean("signature_include_social").default(false),
  
  // Tracking
  trackOpens: boolean("track_opens").default(true),
  trackClicks: boolean("track_clicks").default(true),
  customTrackingDomain: varchar("custom_tracking_domain", { length: 255 }),
  pixelPlacement: varchar("pixel_placement", { length: 50 }).default("bottom"), // top, bottom, hidden
  
  // Link tracking
  linkTrackingEnabled: boolean("link_tracking_enabled").default(true),
  excludeLinksFromTracking: jsonb("exclude_links_from_tracking").$type<string[]>(),
  
  // Spam alerts
  spamComplaintThreshold: integer("spam_complaint_threshold").default(1), // per 1000
  spamAlertEmails: jsonb("spam_alert_emails").$type<string[]>(),
  
  // Blacklist monitoring
  blacklistMonitoringEnabled: boolean("blacklist_monitoring_enabled").default(true),
  blacklistAlertEmails: jsonb("blacklist_alert_emails").$type<string[]>(),
  monitoredBlacklists: jsonb("monitored_blacklists").$type<string[]>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// COMPLIANCE AUTOMATION MODULE
// ============================================

// Do Not Contact list
export const doNotContactList = pgTable("do_not_contact_list", {
  id: varchar("id").primaryKey().$defaultFn(() => `dnc_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Contact info (one or more)
  email: varchar("email", { length: 255 }),
  domain: varchar("domain", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  
  // Reason
  reason: varchar("reason", { length: 100 }).notNull(), // bounce, unsubscribe, complaint, manual, competitor
  source: varchar("source", { length: 100 }), // import, api, automatic, manual
  notes: text("notes"),
  
  // Metadata
  addedBy: varchar("added_by").references(() => users.id),
  expiresAt: timestamp("expires_at"), // For temporary blocks
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgEmailIdx: index("dnc_org_email_idx").on(table.organizationId, table.email),
  orgDomainIdx: index("dnc_org_domain_idx").on(table.organizationId, table.domain),
}));

// Suppression list imports
export const suppressionListImports = pgTable("suppression_list_imports", {
  id: varchar("id").primaryKey().$defaultFn(() => `sli_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  recordCount: integer("record_count"),
  importedCount: integer("imported_count"),
  duplicateCount: integer("duplicate_count"),
  errorCount: integer("error_count"),
  
  importedBy: varchar("imported_by").references(() => users.id),
  status: varchar("status", { length: 50 }).default("pending"), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Email footer compliance settings
export const emailFooterCompliance = pgTable("email_footer_compliance", {
  id: varchar("id").primaryKey().$defaultFn(() => `efc_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Required elements
  physicalAddressRequired: boolean("physical_address_required").default(true),
  physicalAddress: text("physical_address"),
  
  unsubscribeLinkRequired: boolean("unsubscribe_link_required").default(true),
  unsubscribeLinkText: varchar("unsubscribe_link_text", { length: 255 }).default("Unsubscribe"),
  unsubscribeLinkPlacement: varchar("unsubscribe_link_placement", { length: 50 }).default("footer"), // footer, header, both
  
  companyNameRequired: boolean("company_name_required").default(true),
  companyName: varchar("company_name", { length: 255 }),
  
  // Optional elements
  includePrivacyLink: boolean("include_privacy_link").default(false),
  privacyPolicyUrl: text("privacy_policy_url"),
  
  includeTermsLink: boolean("include_terms_link").default(false),
  termsUrl: text("terms_url"),
  
  // Custom footer HTML
  customFooterHtml: text("custom_footer_html"),
  customFooterEnabled: boolean("custom_footer_enabled").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================
// NOTIFICATION SETTINGS MODULE (FR-A22)
// ============================================

// Notification type enum
export const notificationTypeEnum = pgEnum("notification_type", [
  "system_downtime", "integration_failure", "security_incident", "usage_limit_warning",
  "bounce_threshold", "spam_complaint", "blacklist_alert", "api_rate_limit",
  "campaign_complete", "sequence_complete", "daily_digest"
]);

// Notification channel enum
export const notificationChannelEnum = pgEnum("notification_channel", ["email", "in_app", "slack", "webhook"]);

// Organization notification settings
export const notificationSettings = pgTable("notification_settings", {
  id: varchar("id").primaryKey().$defaultFn(() => `ns_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Default channels
  defaultChannels: jsonb("default_channels").$type<string[]>().default(["email", "in_app"]),
  
  // Schedule
  businessHoursOnly: boolean("business_hours_only").default(false),
  businessHoursStart: integer("business_hours_start").default(9),
  businessHoursEnd: integer("business_hours_end").default(17),
  businessTimezone: varchar("business_timezone", { length: 50 }).default("UTC"),
  
  // Escalation
  escalationEnabled: boolean("escalation_enabled").default(false),
  escalationDelayMinutes: integer("escalation_delay_minutes").default(30),
  escalationEmails: jsonb("escalation_emails").$type<string[]>(),
  
  // Digest settings
  dailyDigestEnabled: boolean("daily_digest_enabled").default(true),
  dailyDigestTime: integer("daily_digest_time").default(9), // Hour
  weeklyDigestEnabled: boolean("weekly_digest_enabled").default(true),
  weeklyDigestDay: integer("weekly_digest_day").default(1), // Monday
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Notification preferences per type
export const notificationPreferences = pgTable("notification_preferences", {
  id: varchar("id").primaryKey().$defaultFn(() => `np_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  enabled: boolean("enabled").default(true),
  channels: jsonb("channels").$type<string[]>().default(["email"]),
  
  // Recipients
  recipientEmails: jsonb("recipient_emails").$type<string[]>(),
  recipientUserIds: jsonb("recipient_user_ids").$type<string[]>(),
  
  // Thresholds (where applicable)
  threshold: integer("threshold"),
  thresholdUnit: varchar("threshold_unit", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgTypeIdx: index("notification_preferences_org_type_idx").on(table.organizationId, table.notificationType),
}));

// Notification log
export const notificationLogs = pgTable("notification_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => `nl_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  channel: varchar("channel", { length: 50 }).notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  
  subject: varchar("subject", { length: 255 }),
  content: text("content"),
  
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  readAt: timestamp("read_at"),
  
  status: varchar("status", { length: 50 }).default("pending"), // pending, sent, delivered, failed
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdx: index("notification_logs_org_idx").on(table.organizationId),
}));

// ============================================
// AI CONFIGURATION MODULE
// ============================================

// AI provider enum
export const aiProviderEnum = pgEnum("ai_provider", ["openai", "anthropic", "openrouter", "azure", "custom"]);

// AI model enum
export const aiModelEnum = pgEnum("ai_model", [
  "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo",
  "claude-3-5-sonnet", "claude-3-opus", "claude-3-sonnet", "claude-3-haiku",
  "custom"
]);

// Organization AI settings
export const aiConfiguration = pgTable("ai_configuration", {
  id: varchar("id").primaryKey().$defaultFn(() => `aic_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Model selection
  defaultProvider: aiProviderEnum("default_provider").default("openai"),
  defaultModel: aiModelEnum("default_model").default("gpt-4o-mini"),
  fallbackProvider: aiProviderEnum("fallback_provider"),
  fallbackModel: aiModelEnum("fallback_model"),
  
  // Generation settings
  defaultTemperature: real("default_temperature").default(0.7),
  defaultMaxTokens: integer("default_max_tokens").default(1000),
  
  // Usage limits
  dailyTokenLimit: integer("daily_token_limit").default(100000),
  monthlyTokenLimit: integer("monthly_token_limit").default(3000000),
  perCampaignTokenLimit: integer("per_campaign_token_limit").default(50000),
  
  // Safety filters
  contentFilterEnabled: boolean("content_filter_enabled").default(true),
  blockedTopics: jsonb("blocked_topics").$type<string[]>(),
  requiredDisclosures: jsonb("required_disclosures").$type<string[]>(),
  
  // Cost tracking
  monthlyBudgetUsd: real("monthly_budget_usd"),
  budgetAlertThreshold: integer("budget_alert_threshold").default(80), // Percentage
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Custom prompt templates
export const aiPromptTemplates = pgTable("ai_prompt_templates", {
  id: varchar("id").primaryKey().$defaultFn(() => `aipt_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).notNull(), // email, personalization, analysis, other
  
  systemPrompt: text("system_prompt"),
  userPromptTemplate: text("user_prompt_template").notNull(),
  
  // Variables
  requiredVariables: jsonb("required_variables").$type<string[]>(),
  optionalVariables: jsonb("optional_variables").$type<string[]>(),
  
  // Settings override
  temperature: real("temperature"),
  maxTokens: integer("max_tokens"),
  
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orgCategoryIdx: index("ai_prompt_templates_org_category_idx").on(table.organizationId, table.category),
}));

// AI usage tracking
export const aiUsageLogs = pgTable("ai_usage_logs", {
  id: varchar("id").primaryKey().$defaultFn(() => `aiul_${Date.now()}`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  
  provider: varchar("provider", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  
  feature: varchar("feature", { length: 100 }), // personalization, analysis, generation
  campaignId: varchar("campaign_id"),
  
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  totalTokens: integer("total_tokens"),
  estimatedCostUsd: real("estimated_cost_usd"),
  
  latencyMs: integer("latency_ms"),
  success: boolean("success").default(true),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdx: index("ai_usage_logs_org_idx").on(table.organizationId),
  createdAtIdx: index("ai_usage_logs_created_at_idx").on(table.createdAt),
}));

// ============================================
// INFRASTRUCTURE TYPES
// ============================================

export type SendingDomain = typeof sendingDomains.$inferSelect;
export type InsertSendingDomain = typeof sendingDomains.$inferInsert;
export type MailboxTeamAllocation = typeof mailboxTeamAllocations.$inferSelect;
export type InsertMailboxTeamAllocation = typeof mailboxTeamAllocations.$inferInsert;
export type MailboxWarmupSchedule = typeof mailboxWarmupSchedules.$inferSelect;
export type InsertMailboxWarmupSchedule = typeof mailboxWarmupSchedules.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = typeof apiUsageLogs.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;
export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;
export type InsertWebhookDeliveryLog = typeof webhookDeliveryLogs.$inferInsert;

export type EmailDeliverabilitySettings = typeof emailDeliverabilitySettings.$inferSelect;
export type InsertEmailDeliverabilitySettings = typeof emailDeliverabilitySettings.$inferInsert;

export type DoNotContactEntry = typeof doNotContactList.$inferSelect;
export type InsertDoNotContactEntry = typeof doNotContactList.$inferInsert;
export type SuppressionListImport = typeof suppressionListImports.$inferSelect;
export type InsertSuppressionListImport = typeof suppressionListImports.$inferInsert;
export type EmailFooterCompliance = typeof emailFooterCompliance.$inferSelect;
export type InsertEmailFooterCompliance = typeof emailFooterCompliance.$inferInsert;

export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type InsertNotificationSettings = typeof notificationSettings.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;
export type NotificationLog = typeof notificationLogs.$inferSelect;
export type InsertNotificationLog = typeof notificationLogs.$inferInsert;

export type AIConfiguration = typeof aiConfiguration.$inferSelect;
export type InsertAIConfiguration = typeof aiConfiguration.$inferInsert;
export type AIPromptTemplate = typeof aiPromptTemplates.$inferSelect;
export type InsertAIPromptTemplate = typeof aiPromptTemplates.$inferInsert;
export type AIUsageLog = typeof aiUsageLogs.$inferSelect;
export type InsertAIUsageLog = typeof aiUsageLogs.$inferInsert;

// ============================================
// INFRASTRUCTURE SCHEMAS
// ============================================

export const insertSendingDomainSchema = createInsertSchema(sendingDomains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastUsedAt: true,
  usageCount: true,
  revokedAt: true,
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTriggeredAt: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  consecutiveFailures: true,
});

export const insertDoNotContactSchema = createInsertSchema(doNotContactList).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAIPromptTemplateSchema = createInsertSchema(aiPromptTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// SUPER ADMIN / PLATFORM MANAGEMENT MODULE
// ============================================

// Tenant plan enum
export const tenantPlanEnum = pgEnum("tenant_plan", ["trial", "starter", "growth", "enterprise"]);

// Tenant status enum (extended for platform management)
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "trial", "suspended", "churned", "pending_approval"]);

// Super Admin status enum
export const superAdminStatusEnum = pgEnum("super_admin_status", ["active", "inactive", "suspended"]);

// Super Admins table - Platform-level administrators (AiSDR company employees)
export const superAdmins = pgTable("super_admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  status: superAdminStatusEnum("status").default("active"),
  isMasterAdmin: boolean("is_master_admin").default(false), // Can manage other super admins
  permissions: jsonb("permissions").$type<{
    canProvisionTenants?: boolean;
    canManageBilling?: boolean;
    canImpersonateManagers?: boolean;
    canSuspendTenants?: boolean;
    canDeleteTenants?: boolean;
    canViewAllData?: boolean;
  }>(),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  emailIdx: index("super_admins_email_idx").on(table.email),
}));

// Super Admin sessions table
export const superAdminSessions = pgTable("super_admin_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  superAdminId: varchar("super_admin_id").notNull().references(() => superAdmins.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at").notNull(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  superAdminIdIdx: index("super_admin_sessions_admin_id_idx").on(table.superAdminId),
  tokenIdx: index("super_admin_sessions_token_idx").on(table.token),
}));

// Super Admin audit logs table - Platform-level actions
export const superAdminAuditLogs = pgTable("super_admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  superAdminId: varchar("super_admin_id").references(() => superAdmins.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type"), // tenant, manager, super_admin, billing, etc.
  targetId: varchar("target_id"), // ID of the affected entity
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  superAdminIdIdx: index("super_admin_audit_logs_admin_id_idx").on(table.superAdminId),
  actionIdx: index("super_admin_audit_logs_action_idx").on(table.action),
  createdAtIdx: index("super_admin_audit_logs_created_at_idx").on(table.createdAt),
}));

// Tenant settings table - Extended organization management
export const tenantSettings = pgTable("tenant_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  
  // Plan and billing
  plan: tenantPlanEnum("plan").default("trial"),
  tenantStatus: tenantStatusEnum("tenant_status").default("trial"),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  billingEmail: text("billing_email"),
  billingAddress: text("billing_address"),
  
  // Resource limits based on plan
  maxUsers: integer("max_users").default(5),
  maxProspects: integer("max_prospects").default(1000),
  maxSequences: integer("max_sequences").default(10),
  maxMailboxes: integer("max_mailboxes").default(3),
  maxDailyEmails: integer("max_daily_emails").default(100),
  
  // Usage tracking
  currentUserCount: integer("current_user_count").default(0),
  currentProspectCount: integer("current_prospect_count").default(0),
  currentSequenceCount: integer("current_sequence_count").default(0),
  
  // Health and metrics
  healthScore: integer("health_score").default(100), // 0-100
  lastActivityAt: timestamp("last_activity_at"),
  totalEmailsSent: integer("total_emails_sent").default(0),
  totalProspectsEnriched: integer("total_prospects_enriched").default(0),
  
  // Provisioning info
  provisionedBy: varchar("provisioned_by").references(() => superAdmins.id),
  provisionedAt: timestamp("provisioned_at"),
  suspendedBy: varchar("suspended_by").references(() => superAdmins.id),
  suspendedAt: timestamp("suspended_at"),
  suspendReason: text("suspend_reason"),
  
  // Contact info (for AiSDR support)
  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  
  // Notes (internal use by super admins)
  internalNotes: text("internal_notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("tenant_settings_org_id_idx").on(table.organizationId),
  planIdx: index("tenant_settings_plan_idx").on(table.plan),
  statusIdx: index("tenant_settings_status_idx").on(table.tenantStatus),
}));

// Super Admin impersonation logs - Track when super admins access tenant accounts
export const impersonationLogs = pgTable("impersonation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  superAdminId: varchar("super_admin_id").notNull().references(() => superAdmins.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  targetUserId: varchar("target_user_id").references(() => users.id, { onDelete: "set null" }), // Manager being impersonated
  reason: text("reason"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => ({
  superAdminIdIdx: index("impersonation_logs_super_admin_id_idx").on(table.superAdminId),
  orgIdIdx: index("impersonation_logs_org_id_idx").on(table.organizationId),
  startedAtIdx: index("impersonation_logs_started_at_idx").on(table.startedAt),
}));

// Tenant Feature Flags - FR-SA4: Enable/disable features per tenant
export const tenantFeatureFlags = pgTable("tenant_feature_flags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  
  // AI Features
  aiProspecting: boolean("ai_prospecting").default(true),
  aiEmailGeneration: boolean("ai_email_generation").default(true),
  aiSentimentAnalysis: boolean("ai_sentiment_analysis").default(true),
  
  // Analytics Features
  advancedAnalytics: boolean("advanced_analytics").default(false),
  customReports: boolean("custom_reports").default(false),
  exportCapabilities: boolean("export_capabilities").default(true),
  
  // White-label Options (Enterprise)
  whiteLabel: boolean("white_label").default(false),
  customBranding: boolean("custom_branding").default(false),
  customDomain: boolean("custom_domain").default(false),
  
  // Integration Features
  crmIntegration: boolean("crm_integration").default(false),
  webhookAccess: boolean("webhook_access").default(false),
  apiAccess: boolean("api_access").default(true),
  
  // Communication Features
  multiMailbox: boolean("multi_mailbox").default(true),
  emailSequences: boolean("email_sequences").default(true),
  bulkOperations: boolean("bulk_operations").default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("tenant_feature_flags_org_id_idx").on(table.organizationId),
}));

// Tenant Extended Configuration - FR-SA4: Additional limits and settings
export const tenantConfiguration = pgTable("tenant_configuration", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  
  // Core Resource Limits (overrides tenantSettings when set)
  maxUsers: integer("max_users"),
  maxProspects: integer("max_prospects"),
  maxSequences: integer("max_sequences"),
  maxMailboxes: integer("max_mailboxes"),
  maxDailyEmails: integer("max_daily_emails"),
  maxHourlyEmails: integer("max_hourly_emails"),
  apiRateLimitPerMinute: integer("api_rate_limit_per_minute"),
  
  // Storage Limits
  storageQuotaMb: integer("storage_quota_mb").default(1000), // MB
  currentStorageUsedMb: integer("current_storage_used_mb").default(0),
  
  // API Rate Limits
  apiRequestsPerHour: integer("api_requests_per_hour").default(1000),
  apiRequestsPerDay: integer("api_requests_per_day").default(10000),
  bulkOperationsPerDay: integer("bulk_operations_per_day").default(10),
  
  // Email Limits (extends tenantSettings)
  maxEmailsPerHour: integer("max_emails_per_hour").default(50),
  warmupModeEnabled: boolean("warmup_mode_enabled").default(false),
  warmupDailyLimit: integer("warmup_daily_limit").default(20),
  
  // Prospect Limits
  maxProspectsPerImport: integer("max_prospects_per_import").default(1000),
  maxEnrichmentsPerDay: integer("max_enrichments_per_day").default(100),
  
  // Multi-Manager Settings (Enterprise - FR-SA10)
  multiManagerEnabled: boolean("multi_manager_enabled").default(false),
  maxManagers: integer("max_managers").default(1),
  
  // Custom Branding (Enterprise)
  brandingLogo: text("branding_logo"), // URL to logo
  brandingPrimaryColor: text("branding_primary_color"), // Hex color
  brandingSecondaryColor: text("branding_secondary_color"),
  brandingFontFamily: text("branding_font_family"),
  customEmailFooter: text("custom_email_footer"),
  
  // Advanced Settings
  datRetentionDays: integer("data_retention_days").default(365),
  auditLogRetentionDays: integer("audit_log_retention_days").default(90),
  sessionTimeoutMinutes: integer("session_timeout_minutes").default(480), // 8 hours
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("tenant_configuration_org_id_idx").on(table.organizationId),
}));

// Manager Role Enum for multi-manager support
export const managerRoleEnum = pgEnum("manager_role", [
  "primary",     // Full access, can manage other managers
  "secondary",   // Limited access, cannot delete or manage managers
  "readonly"     // Read-only access to tenant data
]);

// Manager Accounts - FR-SA7, FR-SA8, FR-SA10: Multi-manager support with role hierarchy
export const managerAccounts = pgTable("manager_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Manager Role within tenant
  managerRole: managerRoleEnum("manager_role").default("secondary"),
  
  // Contact Information
  phoneNumber: text("phone_number"),
  jobTitle: text("job_title"),
  department: text("department"),
  
  // Invitation & Onboarding
  invitedBy: varchar("invited_by"), // References users.id or superAdmins.id
  invitedByType: text("invited_by_type"), // 'super_admin' or 'manager'
  invitationSentAt: timestamp("invitation_sent_at"),
  invitationAcceptedAt: timestamp("invitation_accepted_at"),
  welcomeEmailSent: boolean("welcome_email_sent").default(false),
  
  // Permissions (overrides for secondary managers)
  permissions: jsonb("permissions").$type<{
    canCreateUsers?: boolean;
    canDeleteUsers?: boolean;
    canManageSequences?: boolean;
    canDeleteSequences?: boolean;
    canManageMailboxes?: boolean;
    canViewAnalytics?: boolean;
    canExportData?: boolean;
    canManageIntegrations?: boolean;
    canInviteManagers?: boolean;
  }>(),
  
  // Activity Tracking
  lastActiveAt: timestamp("last_active_at"),
  totalLogins: integer("total_logins").default(0),
  totalActionsPerformed: integer("total_actions_performed").default(0),
  
  // Performance Metrics
  prospectsCreated: integer("prospects_created").default(0),
  emailsSent: integer("emails_sent").default(0),
  sequencesLaunched: integer("sequences_launched").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("manager_accounts_user_id_idx").on(table.userId),
  orgIdIdx: index("manager_accounts_org_id_idx").on(table.organizationId),
  managerRoleIdx: index("manager_accounts_role_idx").on(table.managerRole),
  userOrgUnique: uniqueIndex("manager_accounts_user_org_unique").on(table.userId, table.organizationId),
}));

// Manager Activity Logs - FR-SA8: Track manager actions for oversight
export const managerActivityLogs = pgTable("manager_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  managerId: varchar("manager_id").notNull().references(() => managerAccounts.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  action: text("action").notNull(), // CREATE_PROSPECT, SEND_EMAIL, LAUNCH_SEQUENCE, etc.
  resourceType: text("resource_type"), // prospect, sequence, email, user, etc.
  resourceId: varchar("resource_id"),
  details: jsonb("details"),
  
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  managerIdIdx: index("manager_activity_logs_manager_id_idx").on(table.managerId),
  orgIdIdx: index("manager_activity_logs_org_id_idx").on(table.organizationId),
  actionIdx: index("manager_activity_logs_action_idx").on(table.action),
  createdAtIdx: index("manager_activity_logs_created_at_idx").on(table.createdAt),
}));

// Tenant Activity Timeline - FR-SA3: Activity timeline for tenant detail view
export const tenantActivityTimeline = pgTable("tenant_activity_timeline", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  eventType: text("event_type").notNull(), // USER_CREATED, SEQUENCE_LAUNCHED, MILESTONE_REACHED, etc.
  eventTitle: text("event_title").notNull(),
  eventDescription: text("event_description"),
  
  actorId: varchar("actor_id"), // User or manager who triggered the event
  actorType: text("actor_type"), // 'user', 'manager', 'system', 'super_admin'
  
  metadata: jsonb("metadata"),
  importance: text("importance").default("normal"), // low, normal, high, critical
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("tenant_activity_timeline_org_id_idx").on(table.organizationId),
  eventTypeIdx: index("tenant_activity_timeline_event_type_idx").on(table.eventType),
  createdAtIdx: index("tenant_activity_timeline_created_at_idx").on(table.createdAt),
}));

// ============================================
// PLATFORM ALERTS - FR-SA26
// ============================================

export const platformAlertSeverityEnum = pgEnum("platform_alert_severity", ["info", "warning", "critical", "emergency"]);
export const platformAlertStatusEnum = pgEnum("platform_alert_status", ["active", "acknowledged", "resolved", "snoozed"]);

export const platformAlerts = pgTable("platform_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Alert type and details
  alertType: text("alert_type").notNull(), // system_downtime, performance_degradation, security_incident, failed_backup, tenant_issue, billing_issue, resource_exhaustion
  severity: platformAlertSeverityEnum("severity").notNull().default("warning"),
  status: platformAlertStatusEnum("status").notNull().default("active"),
  
  title: text("title").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  
  // Source and target
  sourceSystem: text("source_system"), // api, email, database, security, billing
  affectedTenantId: varchar("affected_tenant_id").references(() => organizations.id, { onDelete: "set null" }),
  
  // Resolution tracking
  acknowledgedBy: varchar("acknowledged_by").references(() => superAdmins.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: varchar("resolved_by").references(() => superAdmins.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  
  // Notification tracking
  notificationsSent: jsonb("notifications_sent").$type<{channel: string; sentAt: string; recipient: string}[]>().default(sql`'[]'::jsonb`),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  alertTypeIdx: index("platform_alerts_alert_type_idx").on(table.alertType),
  severityIdx: index("platform_alerts_severity_idx").on(table.severity),
  statusIdx: index("platform_alerts_status_idx").on(table.status),
  createdAtIdx: index("platform_alerts_created_at_idx").on(table.createdAt),
}));

// Alert configurations - what triggers alerts
export const alertConfigurations = pgTable("alert_configurations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  alertType: text("alert_type").notNull().unique(),
  enabled: boolean("enabled").notNull().default(true),
  
  // Thresholds
  thresholds: jsonb("thresholds").$type<{
    errorRatePercent?: number;
    responseTimeMs?: number;
    cpuPercent?: number;
    memoryPercent?: number;
    diskPercent?: number;
    failedLoginCount?: number;
    bounceRatePercent?: number;
  }>(),
  
  // Notification channels
  emailNotifications: boolean("email_notifications").default(true),
  emailRecipients: text("email_recipients").array(),
  
  // Cooldown to prevent spam
  cooldownMinutes: integer("cooldown_minutes").default(30),
  lastTriggeredAt: timestamp("last_triggered_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================
// TENANT COMMUNICATIONS - FR-SA28
// ============================================

export const tenantCommunicationTypeEnum = pgEnum("tenant_communication_type", ["platform_update", "new_feature", "maintenance", "security_alert", "best_practice", "custom"]);
export const tenantCommunicationStatusEnum = pgEnum("tenant_communication_status", ["draft", "scheduled", "sent", "cancelled"]);

export const tenantCommunications = pgTable("tenant_communications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Communication details
  type: tenantCommunicationTypeEnum("type").notNull().default("custom"),
  status: tenantCommunicationStatusEnum("status").notNull().default("draft"),
  
  subject: text("subject").notNull(),
  body: text("body").notNull(), // HTML content
  
  // Targeting
  targetAll: boolean("target_all").default(true),
  targetPlanTypes: text("target_plan_types").array(), // trial, starter, growth, enterprise
  targetIndustries: text("target_industries").array(),
  targetUsageLevels: text("target_usage_levels").array(), // low, medium, high
  targetTenantIds: text("target_tenant_ids").array(), // Specific tenant IDs
  
  // Scheduling
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  
  // Tracking
  createdBy: varchar("created_by").references(() => superAdmins.id),
  recipientCount: integer("recipient_count").default(0),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("tenant_communications_status_idx").on(table.status),
  typeIdx: index("tenant_communications_type_idx").on(table.type),
  createdAtIdx: index("tenant_communications_created_at_idx").on(table.createdAt),
}));

// Track individual communication recipients
export const communicationRecipients = pgTable("communication_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  communicationId: varchar("communication_id").notNull().references(() => tenantCommunications.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  
  // Tracking
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  optedOut: boolean("opted_out").default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  commIdIdx: index("communication_recipients_comm_id_idx").on(table.communicationId),
  orgIdIdx: index("communication_recipients_org_id_idx").on(table.organizationId),
}));

// ============================================
// TENANT ONBOARDING - FR-SA29
// ============================================

export const tenantOnboarding = pgTable("tenant_onboarding", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }).unique(),
  
  // Onboarding checklist items
  managerAccountCreated: boolean("manager_account_created").default(false),
  managerAccountCreatedAt: timestamp("manager_account_created_at"),
  
  initialUsersAdded: boolean("initial_users_added").default(false),
  initialUsersAddedAt: timestamp("initial_users_added_at"),
  usersAddedCount: integer("users_added_count").default(0),
  
  firstCampaignLaunched: boolean("first_campaign_launched").default(false),
  firstCampaignLaunchedAt: timestamp("first_campaign_launched_at"),
  
  domainConfigured: boolean("domain_configured").default(false),
  domainConfiguredAt: timestamp("domain_configured_at"),
  
  firstMeetingBooked: boolean("first_meeting_booked").default(false),
  firstMeetingBookedAt: timestamp("first_meeting_booked_at"),
  
  firstProspectAdded: boolean("first_prospect_added").default(false),
  firstProspectAddedAt: timestamp("first_prospect_added_at"),
  
  firstEmailSent: boolean("first_email_sent").default(false),
  firstEmailSentAt: timestamp("first_email_sent_at"),
  
  mailboxConnected: boolean("mailbox_connected").default(false),
  mailboxConnectedAt: timestamp("mailbox_connected_at"),
  
  // Progress tracking
  onboardingProgress: integer("onboarding_progress").default(0), // 0-100
  onboardingCompleted: boolean("onboarding_completed").default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  
  // Success team
  successManagerId: varchar("success_manager_id").references(() => superAdmins.id),
  successManagerAssignedAt: timestamp("success_manager_assigned_at"),
  
  // Health score (0-100)
  healthScore: integer("health_score").default(50),
  healthScoreUpdatedAt: timestamp("health_score_updated_at"),
  healthRiskLevel: text("health_risk_level").default("medium"), // low, medium, high, critical
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("tenant_onboarding_org_id_idx").on(table.organizationId),
  healthScoreIdx: index("tenant_onboarding_health_score_idx").on(table.healthScore),
  onboardingProgressIdx: index("tenant_onboarding_progress_idx").on(table.onboardingProgress),
}));

// ============================================
// PRODUCT ANALYTICS - FR-SA25
// ============================================

export const featureUsageTracking = pgTable("feature_usage_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  featureName: text("feature_name").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Usage metrics
  usageCount: integer("usage_count").default(1),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  
  // Aggregation period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Additional context
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  featureIdx: index("feature_usage_tracking_feature_idx").on(table.featureName),
  orgIdIdx: index("feature_usage_tracking_org_id_idx").on(table.organizationId),
  periodIdx: index("feature_usage_tracking_period_idx").on(table.periodStart, table.periodEnd),
}));

// Platform-wide feature analytics aggregation
export const platformFeatureAnalytics = pgTable("platform_feature_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  featureName: text("feature_name").notNull(),
  
  // Adoption metrics
  totalUsageCount: integer("total_usage_count").default(0),
  uniqueUsersCount: integer("unique_users_count").default(0),
  uniqueTenantsCount: integer("unique_tenants_count").default(0),
  adoptionRate: real("adoption_rate").default(0), // Percentage of tenants using feature
  
  // Engagement
  avgUsagePerTenant: real("avg_usage_per_tenant").default(0),
  avgUsagePerUser: real("avg_usage_per_user").default(0),
  
  // Time period
  periodType: text("period_type").notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  featureIdx: index("platform_feature_analytics_feature_idx").on(table.featureName),
  periodIdx: index("platform_feature_analytics_period_idx").on(table.periodType, table.periodStart),
}));

// ============================================
// FR-U25: LEADERBOARD & GAMIFICATION
// ============================================

export const badgeTypeEnum = pgEnum("badge_type", [
  "meetings_milestone",
  "reply_rate",
  "streak",
  "first_meeting",
  "top_performer",
  "improvement",
  "team_player",
  "speed_demon"
]);

export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  badgeType: badgeTypeEnum("badge_type").notNull(),
  badgeName: text("badge_name").notNull(),
  badgeDescription: text("badge_description"),
  badgeIcon: text("badge_icon"), // Icon name or URL
  badgeColor: text("badge_color"), // Hex color
  
  // Achievement details
  achievedAt: timestamp("achieved_at").notNull().defaultNow(),
  achievementValue: integer("achievement_value"), // e.g., 100 meetings
  periodType: text("period_type"), // daily, weekly, monthly, all-time
  
  // Display
  isDisplayed: boolean("is_displayed").default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("user_badges_user_id_idx").on(table.userId),
  orgIdIdx: index("user_badges_org_id_idx").on(table.organizationId),
  badgeTypeIdx: index("user_badges_type_idx").on(table.badgeType),
}));

export const leaderboardPeriods = pgTable("leaderboard_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  periodType: text("period_type").notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  isActive: boolean("is_active").default(true),
  isFinal: boolean("is_final").default(false), // Set true when period ends
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgPeriodIdx: index("leaderboard_periods_org_period_idx").on(table.organizationId, table.periodType),
  periodStartIdx: index("leaderboard_periods_start_idx").on(table.periodStart),
}));

export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  periodId: varchar("period_id").notNull().references(() => leaderboardPeriods.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Metrics
  meetingsBooked: integer("meetings_booked").default(0),
  emailsSent: integer("emails_sent").default(0),
  repliesReceived: integer("replies_received").default(0),
  positiveReplies: integer("positive_replies").default(0),
  openRate: real("open_rate").default(0),
  replyRate: real("reply_rate").default(0),
  
  // Ranking
  rank: integer("rank"),
  points: integer("points").default(0),
  previousRank: integer("previous_rank"),
  rankChange: integer("rank_change"), // positive = up, negative = down
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  periodIdIdx: index("leaderboard_entries_period_idx").on(table.periodId),
  userIdIdx: index("leaderboard_entries_user_idx").on(table.userId),
  rankIdx: index("leaderboard_entries_rank_idx").on(table.periodId, table.rank),
}));

// ============================================
// FR-U29: BEST PRACTICE LIBRARY
// ============================================

export const bestPracticeCategories = pgTable("best_practice_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const bestPractices = pgTable("best_practices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").references(() => bestPracticeCategories.id, { onDelete: "set null" }),
  
  // Content
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  content: text("content"), // Rich text/markdown content
  contentType: text("content_type").notNull().default("article"), // article, template, guide, video, checklist
  
  // For templates
  templateSubject: text("template_subject"),
  templateBody: text("template_body"),
  templateVariables: jsonb("template_variables").$type<string[]>(),
  
  // Metadata
  author: text("author"),
  industry: text("industry"), // Industry-specific
  difficulty: text("difficulty"), // beginner, intermediate, advanced
  estimatedReadTime: integer("estimated_read_time"), // minutes
  
  // Engagement
  viewCount: integer("view_count").default(0),
  useCount: integer("use_count").default(0), // Times template was used
  rating: real("rating").default(0),
  ratingCount: integer("rating_count").default(0),
  
  // Tags and search
  tags: text("tags").array(),
  
  // Publishing
  isPublished: boolean("is_published").default(false),
  isFeatured: boolean("is_featured").default(false),
  publishedAt: timestamp("published_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("best_practices_category_idx").on(table.categoryId),
  contentTypeIdx: index("best_practices_type_idx").on(table.contentType),
  publishedIdx: index("best_practices_published_idx").on(table.isPublished),
}));

export const bestPracticeRatings = pgTable("best_practice_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bestPracticeId: varchar("best_practice_id").notNull().references(() => bestPractices.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  rating: integer("rating").notNull(), // 1-5
  feedback: text("feedback"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  practiceUserIdx: uniqueIndex("best_practice_ratings_unique").on(table.bestPracticeId, table.userId),
}));

// ============================================
// FR-U32: AE HANDOFF / SQL QUALIFICATION
// ============================================

export const handoffStatusEnum = pgEnum("handoff_status", [
  "pending_review",
  "accepted",
  "rejected",
  "converted",
  "lost"
]);

export const aeHandoffs = pgTable("ae_handoffs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  
  // Prospect and SDR info
  prospectId: varchar("prospect_id").notNull().references(() => prospects.id, { onDelete: "cascade" }),
  sdrUserId: varchar("sdr_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  aeUserId: varchar("ae_user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Qualification (BANT/MEDDIC)
  qualificationFramework: text("qualification_framework").default("bant"), // bant, meddic, custom
  qualificationScore: integer("qualification_score"), // 0-100
  
  // BANT fields
  budget: text("budget"),
  budgetConfirmed: boolean("budget_confirmed").default(false),
  authority: text("authority"),
  authorityConfirmed: boolean("authority_confirmed").default(false),
  need: text("need"),
  needConfirmed: boolean("need_confirmed").default(false),
  timeline: text("timeline"),
  timelineConfirmed: boolean("timeline_confirmed").default(false),
  
  // MEDDIC fields
  metrics: text("metrics"),
  economicBuyer: text("economic_buyer"),
  decisionCriteria: text("decision_criteria"),
  decisionProcess: text("decision_process"),
  identifyPain: text("identify_pain"),
  champion: text("champion"),
  
  // Meeting context
  meetingScheduledAt: timestamp("meeting_scheduled_at"),
  meetingCompletedAt: timestamp("meeting_completed_at"),
  meetingNotes: text("meeting_notes"),
  
  // Handoff status
  status: handoffStatusEnum("status").default("pending_review"),
  handoffNotes: text("handoff_notes"),
  handoffReason: text("handoff_reason"),
  
  // AE feedback
  aeFeedback: text("ae_feedback"),
  aeRating: integer("ae_rating"), // 1-5 quality rating
  
  // Outcome tracking
  dealValue: real("deal_value"),
  dealCurrency: text("deal_currency").default("USD"),
  closedAt: timestamp("closed_at"),
  outcome: text("outcome"), // won, lost, no_decision
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("ae_handoffs_org_idx").on(table.organizationId),
  prospectIdx: index("ae_handoffs_prospect_idx").on(table.prospectId),
  sdrIdx: index("ae_handoffs_sdr_idx").on(table.sdrUserId),
  aeIdx: index("ae_handoffs_ae_idx").on(table.aeUserId),
  statusIdx: index("ae_handoffs_status_idx").on(table.status),
}));

export const handoffActivities = pgTable("handoff_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  handoffId: varchar("handoff_id").notNull().references(() => aeHandoffs.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  activityType: text("activity_type").notNull(), // note, status_change, feedback, meeting_update
  description: text("description"),
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  handoffIdx: index("handoff_activities_handoff_idx").on(table.handoffId),
}));

// ============================================
// SUPER ADMIN TYPES
// ============================================

export type SuperAdmin = typeof superAdmins.$inferSelect;
export type InsertSuperAdmin = typeof superAdmins.$inferInsert;
export type SuperAdminSession = typeof superAdminSessions.$inferSelect;
export type InsertSuperAdminSession = typeof superAdminSessions.$inferInsert;
export type SuperAdminAuditLog = typeof superAdminAuditLogs.$inferSelect;
export type InsertSuperAdminAuditLog = typeof superAdminAuditLogs.$inferInsert;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = typeof tenantSettings.$inferInsert;
export type ImpersonationLog = typeof impersonationLogs.$inferSelect;
export type InsertImpersonationLog = typeof impersonationLogs.$inferInsert;
export type TenantFeatureFlags = typeof tenantFeatureFlags.$inferSelect;
export type InsertTenantFeatureFlags = typeof tenantFeatureFlags.$inferInsert;
export type TenantConfiguration = typeof tenantConfiguration.$inferSelect;
export type InsertTenantConfiguration = typeof tenantConfiguration.$inferInsert;
export type ManagerAccount = typeof managerAccounts.$inferSelect;
export type InsertManagerAccount = typeof managerAccounts.$inferInsert;
export type ManagerActivityLog = typeof managerActivityLogs.$inferSelect;
export type InsertManagerActivityLog = typeof managerActivityLogs.$inferInsert;
export type TenantActivityTimelineEntry = typeof tenantActivityTimeline.$inferSelect;
export type InsertTenantActivityTimelineEntry = typeof tenantActivityTimeline.$inferInsert;

// ============================================
// SUPER ADMIN SCHEMAS
// ============================================

export const insertSuperAdminSchema = createInsertSchema(superAdmins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
});

export const insertTenantSettingsSchema = createInsertSchema(tenantSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertImpersonationLogSchema = createInsertSchema(impersonationLogs).omit({
  id: true,
  startedAt: true,
  endedAt: true,
});

export const insertTenantFeatureFlagsSchema = createInsertSchema(tenantFeatureFlags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantConfigurationSchema = createInsertSchema(tenantConfiguration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertManagerAccountSchema = createInsertSchema(managerAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertManagerActivityLogSchema = createInsertSchema(managerActivityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertTenantActivityTimelineSchema = createInsertSchema(tenantActivityTimeline).omit({
  id: true,
  createdAt: true,
});

// Phase 2 Types
export type PlatformAlert = typeof platformAlerts.$inferSelect;
export type InsertPlatformAlert = typeof platformAlerts.$inferInsert;
export type AlertConfiguration = typeof alertConfigurations.$inferSelect;
export type InsertAlertConfiguration = typeof alertConfigurations.$inferInsert;
export type TenantCommunication = typeof tenantCommunications.$inferSelect;
export type InsertTenantCommunication = typeof tenantCommunications.$inferInsert;
export type CommunicationRecipient = typeof communicationRecipients.$inferSelect;
export type InsertCommunicationRecipient = typeof communicationRecipients.$inferInsert;
export type TenantOnboarding = typeof tenantOnboarding.$inferSelect;
export type InsertTenantOnboarding = typeof tenantOnboarding.$inferInsert;
export type FeatureUsageTracking = typeof featureUsageTracking.$inferSelect;
export type InsertFeatureUsageTracking = typeof featureUsageTracking.$inferInsert;
export type PlatformFeatureAnalytics = typeof platformFeatureAnalytics.$inferSelect;
export type InsertPlatformFeatureAnalytics = typeof platformFeatureAnalytics.$inferInsert;

// Phase 2 Schemas
export const insertPlatformAlertSchema = createInsertSchema(platformAlerts).omit({
  id: true,
  createdAt: true,
});

export const insertAlertConfigurationSchema = createInsertSchema(alertConfigurations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantCommunicationSchema = createInsertSchema(tenantCommunications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTenantOnboardingSchema = createInsertSchema(tenantOnboarding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFeatureUsageTrackingSchema = createInsertSchema(featureUsageTracking).omit({
  id: true,
  createdAt: true,
});

// ============================================
// FR-U25, FR-U29, FR-U32 TYPES
// ============================================

// Leaderboard Types
export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = typeof userBadges.$inferInsert;
export type LeaderboardPeriod = typeof leaderboardPeriods.$inferSelect;
export type InsertLeaderboardPeriod = typeof leaderboardPeriods.$inferInsert;
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type InsertLeaderboardEntry = typeof leaderboardEntries.$inferInsert;

// Best Practice Types
export type BestPracticeCategory = typeof bestPracticeCategories.$inferSelect;
export type InsertBestPracticeCategory = typeof bestPracticeCategories.$inferInsert;
export type BestPractice = typeof bestPractices.$inferSelect;
export type InsertBestPractice = typeof bestPractices.$inferInsert;
export type BestPracticeRating = typeof bestPracticeRatings.$inferSelect;
export type InsertBestPracticeRating = typeof bestPracticeRatings.$inferInsert;

// AE Handoff Types
export type AEHandoff = typeof aeHandoffs.$inferSelect;
export type InsertAEHandoff = typeof aeHandoffs.$inferInsert;
export type HandoffActivity = typeof handoffActivities.$inferSelect;
export type InsertHandoffActivity = typeof handoffActivities.$inferInsert;

// ============================================
// FR-U25, FR-U29, FR-U32 SCHEMAS
// ============================================

export const insertUserBadgeSchema = createInsertSchema(userBadges).omit({
  id: true,
  createdAt: true,
});

export const insertLeaderboardPeriodSchema = createInsertSchema(leaderboardPeriods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeaderboardEntrySchema = createInsertSchema(leaderboardEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBestPracticeCategorySchema = createInsertSchema(bestPracticeCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBestPracticeSchema = createInsertSchema(bestPractices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBestPracticeRatingSchema = createInsertSchema(bestPracticeRatings).omit({
  id: true,
  createdAt: true,
});

export const insertAEHandoffSchema = createInsertSchema(aeHandoffs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHandoffActivitySchema = createInsertSchema(handoffActivities).omit({
  id: true,
  createdAt: true,
});

// ============================================
// MULTI-PROVIDER WATERFALL SEARCH SYSTEM
// ============================================

// Provider enum for waterfall search
export const searchProviderEnum = pgEnum("search_provider", ["perplexity", "apollo", "lusha", "openrouter"]);

// Prospect searches tracking table
export const prospectSearches = pgTable("prospect_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  searchCriteria: jsonb("search_criteria").notNull(),
  provider: varchar("provider", { length: 50 }),
  totalResults: integer("total_results").default(0),
  apiCost: real("api_cost").default(0),
  status: varchar("status", { length: 50 }).default("completed"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("prospect_searches_org_id_idx").on(table.organizationId),
  userIdIdx: index("prospect_searches_user_id_idx").on(table.userId),
  providerIdx: index("prospect_searches_provider_idx").on(table.provider),
  createdAtIdx: index("prospect_searches_created_at_idx").on(table.createdAt),
}));

// API usage tracking table
export const apiUsage = pgTable("api_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }),
  requestData: jsonb("request_data"),
  responseData: jsonb("response_data"),
  tokensUsed: integer("tokens_used"),
  cost: real("cost"),
  success: boolean("success").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orgIdIdx: index("api_usage_org_id_idx").on(table.organizationId),
  providerIdx: index("api_usage_provider_idx").on(table.provider),
  createdAtIdx: index("api_usage_created_at_idx").on(table.createdAt),
}));

// Prospect enrichment queue for async processing
export const prospectEnrichmentQueue = pgTable("prospect_enrichment_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prospectId: varchar("prospect_id").references(() => prospects.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 50 }).default("pending"),
  provider: varchar("provider", { length: 50 }),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  prospectIdIdx: index("enrichment_queue_prospect_id_idx").on(table.prospectId),
  statusIdx: index("enrichment_queue_status_idx").on(table.status),
}));

// Waterfall Search Types
export type ProspectSearch = typeof prospectSearches.$inferSelect;
export type InsertProspectSearch = typeof prospectSearches.$inferInsert;
export type ApiUsage = typeof apiUsage.$inferSelect;
export type InsertApiUsage = typeof apiUsage.$inferInsert;
export type ProspectEnrichmentQueue = typeof prospectEnrichmentQueue.$inferSelect;
export type InsertProspectEnrichmentQueue = typeof prospectEnrichmentQueue.$inferInsert;

// Waterfall Search Schemas
export const insertProspectSearchSchema = createInsertSchema(prospectSearches).omit({
  id: true,
  createdAt: true,
});

export const insertApiUsageSchema = createInsertSchema(apiUsage).omit({
  id: true,
  createdAt: true,
});

export const insertProspectEnrichmentQueueSchema = createInsertSchema(prospectEnrichmentQueue).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

// ICP Criteria interface for waterfall search
export interface WaterfallSearchCriteria {
  industry?: string;
  companySize?: string;
  jobTitles?: string[];
  location?: string;
  locations?: string[];
  limit?: number;
  keywords?: string;
  seniority?: string[];
  departments?: string[];
  revenueRange?: { min?: number; max?: number };
  technologies?: string[];
  fundingStage?: string;
}
