CREATE TYPE "public"."ai_model" AS ENUM('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'custom');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic', 'openrouter', 'azure', 'custom');--> statement-breakpoint
CREATE TYPE "public"."api_key_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('google', 'microsoft', 'magic', 'password');--> statement-breakpoint
CREATE TYPE "public"."automation_status" AS ENUM('draft', 'scheduled', 'running', 'completed', 'paused', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."badge_type" AS ENUM('meetings_milestone', 'reply_rate', 'streak', 'first_meeting', 'top_performer', 'improvement', 'team_player', 'speed_demon');--> statement-breakpoint
CREATE TYPE "public"."domain_verification_status" AS ENUM('pending', 'verified', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."email_queue_status" AS ENUM('pending', 'generating', 'approved', 'sending', 'sent', 'failed', 'scheduled', 'cancelled', 'preview', 'retrying', 'paused_failed', 'simulated');--> statement-breakpoint
CREATE TYPE "public"."email_send_status" AS ENUM('success', 'failed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."enrichment_status" AS ENUM('new', 'partial', 'enriched', 'failed');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('pending_review', 'accepted', 'rejected', 'converted', 'lost');--> statement-breakpoint
CREATE TYPE "public"."intent_status" AS ENUM('draft', 'testing', 'approved', 'production', 'deprecated', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('enrichment', 'import', 'search');--> statement-breakpoint
CREATE TYPE "public"."license_tier" AS ENUM('free', 'basic', 'professional', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."mailbox_provider" AS ENUM('gmail', 'outlook', 'smtp', 'sendgrid');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('active', 'paused', 'error', 'warming');--> statement-breakpoint
CREATE TYPE "public"."manager_role" AS ENUM('primary', 'secondary', 'readonly');--> statement-breakpoint
CREATE TYPE "public"."match_result" AS ENUM('matched', 'unmatched', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app', 'slack', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('system_downtime', 'integration_failure', 'security_incident', 'usage_limit_warning', 'bounce_threshold', 'spam_complaint', 'blacklist_alert', 'api_rate_limit', 'campaign_complete', 'sequence_complete', 'daily_digest');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."permission_category" AS ENUM('campaign', 'prospect', 'analytics', 'settings', 'user_management', 'workspace', 'team');--> statement-breakpoint
CREATE TYPE "public"."permission_scope" AS ENUM('organization', 'workspace', 'team');--> statement-breakpoint
CREATE TYPE "public"."platform_alert_severity" AS ENUM('info', 'warning', 'critical', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."platform_alert_status" AS ENUM('active', 'acknowledged', 'resolved', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."prospect_source" AS ENUM('manual', 'csv', 'ai_search', 'automation', 'api');--> statement-breakpoint
CREATE TYPE "public"."sdr_workflow_stage" AS ENUM('readiness', 'upload', 'enrichment', 'sequence', 'enrollment', 'activation', 'sending', 'replies', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."search_provider" AS ENUM('perplexity', 'apollo', 'lusha', 'openrouter');--> statement-breakpoint
CREATE TYPE "public"."super_admin_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('lead', 'manager', 'member');--> statement-breakpoint
CREATE TYPE "public"."team_visibility" AS ENUM('private', 'team_only', 'organization');--> statement-breakpoint
CREATE TYPE "public"."tenant_automation_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."tenant_communication_status" AS ENUM('draft', 'scheduled', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tenant_communication_type" AS ENUM('platform_update', 'new_feature', 'maintenance', 'security_alert', 'best_practice', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tenant_plan" AS ENUM('trial', 'starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'trial', 'suspended', 'churned', 'pending_approval');--> statement-breakpoint
CREATE TYPE "public"."tenant_workflow_stage" AS ENUM('created', 'manager_active', 'limits_configured', 'automation_enabled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'user', 'read_only', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended', 'invited', 'pending');--> statement-breakpoint
CREATE TYPE "public"."webhook_event_type" AS ENUM('email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.replied', 'prospect.created', 'prospect.updated', 'prospect.enriched', 'sequence.started', 'sequence.completed', 'sequence.paused', 'campaign.created', 'campaign.completed');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE "account_lockouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_attempt_at" timestamp DEFAULT now() NOT NULL,
	"recent_ips" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_lockouts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ae_handoffs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"sdr_user_id" varchar NOT NULL,
	"ae_user_id" varchar,
	"qualification_framework" text DEFAULT 'bant',
	"qualification_score" integer,
	"budget" text,
	"budget_confirmed" boolean DEFAULT false,
	"authority" text,
	"authority_confirmed" boolean DEFAULT false,
	"need" text,
	"need_confirmed" boolean DEFAULT false,
	"timeline" text,
	"timeline_confirmed" boolean DEFAULT false,
	"metrics" text,
	"economic_buyer" text,
	"decision_criteria" text,
	"decision_process" text,
	"identify_pain" text,
	"champion" text,
	"meeting_scheduled_at" timestamp,
	"meeting_completed_at" timestamp,
	"meeting_notes" text,
	"status" "handoff_status" DEFAULT 'pending_review',
	"handoff_notes" text,
	"handoff_reason" text,
	"ae_feedback" text,
	"ae_rating" integer,
	"deal_value" real,
	"deal_currency" text DEFAULT 'USD',
	"closed_at" timestamp,
	"outcome" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_configuration" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"default_provider" "ai_provider" DEFAULT 'openai',
	"default_model" "ai_model" DEFAULT 'gpt-4o-mini',
	"fallback_provider" "ai_provider",
	"fallback_model" "ai_model",
	"default_temperature" real DEFAULT 0.7,
	"default_max_tokens" integer DEFAULT 1000,
	"daily_token_limit" integer DEFAULT 100000,
	"monthly_token_limit" integer DEFAULT 3000000,
	"per_campaign_token_limit" integer DEFAULT 50000,
	"content_filter_enabled" boolean DEFAULT true,
	"blocked_topics" jsonb,
	"required_disclosures" jsonb,
	"monthly_budget_usd" real,
	"budget_alert_threshold" integer DEFAULT 80,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ai_configuration_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "ai_followup_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" varchar NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"days_between" integer DEFAULT 3 NOT NULL,
	"max_followups" integer DEFAULT 3 NOT NULL,
	"followup_type" text DEFAULT 'gentle' NOT NULL,
	"trigger_condition" text DEFAULT 'no_response' NOT NULL,
	"total_sent" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"generation_type" varchar(100) NOT NULL,
	"prompt" text,
	"response" text,
	"model" varchar(100),
	"provider" varchar(50),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_usd" real,
	"latency_ms" integer,
	"success" boolean DEFAULT true,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_prompt_templates" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100) NOT NULL,
	"system_prompt" text,
	"user_prompt_template" text NOT NULL,
	"required_variables" jsonb,
	"optional_variables" jsonb,
	"temperature" real,
	"max_tokens" integer,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar,
	"provider" varchar(50) NOT NULL,
	"model" varchar(100) NOT NULL,
	"feature" varchar(100),
	"campaign_id" varchar,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"estimated_cost_usd" real,
	"latency_ms" integer,
	"success" boolean DEFAULT true,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_configurations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"thresholds" jsonb,
	"email_notifications" boolean DEFAULT true,
	"email_recipients" text[],
	"cooldown_minutes" integer DEFAULT 30,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "alert_configurations_alert_type_unique" UNIQUE("alert_type")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"key_prefix" varchar(12) NOT NULL,
	"key_hash" varchar(255) NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"scopes" jsonb,
	"rate_limit_per_minute" integer DEFAULT 60,
	"rate_limit_per_day" integer DEFAULT 10000,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0,
	"status" "api_key_status" DEFAULT 'active',
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" varchar,
	"revoke_reason" text,
	"allowed_ips" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"provider" varchar(50) NOT NULL,
	"endpoint" varchar(255),
	"request_data" jsonb,
	"response_data" jsonb,
	"tokens_used" integer,
	"cost" real,
	"success" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_usage_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"api_key_id" varchar NOT NULL,
	"endpoint" varchar(255) NOT NULL,
	"method" varchar(10) NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"request_size" integer,
	"response_size" integer,
	"ip_address" varchar(45),
	"user_agent" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"module" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_exclusion_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"automation_run_id" varchar NOT NULL,
	"prospect_email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"sequence_id" varchar NOT NULL,
	"prospect_count" integer NOT NULL,
	"prospect_source" text DEFAULT 'apollo',
	"ai_personalization_enabled" boolean DEFAULT true,
	"apollo_filters" jsonb,
	"status" "automation_status" DEFAULT 'running',
	"is_stopped" boolean DEFAULT false,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"scheduled_for" timestamp,
	"timezone" text DEFAULT 'UTC',
	"attempt_count" integer DEFAULT 0,
	"last_attempt_at" timestamp,
	"prospects_added" integer DEFAULT 0,
	"emails_sent" integer DEFAULT 0,
	"replies_received" integer DEFAULT 0,
	"errors" text,
	"error_log" jsonb,
	"exclusion_rules" jsonb,
	"rate_limit_config" jsonb,
	"prospects_enrolled" jsonb DEFAULT '[]'::jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "background_job_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"job_type" varchar(100) NOT NULL,
	"job_id" varchar(255),
	"status" varchar(50) DEFAULT 'queued' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"last_error" text,
	"queued_at" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"items_processed" integer DEFAULT 0,
	"items_failed" integer DEFAULT 0,
	"payload" jsonb,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "best_practice_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "best_practice_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "best_practice_ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"best_practice_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"rating" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "best_practices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" varchar,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"content" text,
	"content_type" text DEFAULT 'article' NOT NULL,
	"template_subject" text,
	"template_body" text,
	"template_variables" jsonb,
	"author" text,
	"industry" text,
	"difficulty" text,
	"estimated_read_time" integer,
	"view_count" integer DEFAULT 0,
	"use_count" integer DEFAULT 0,
	"rating" real DEFAULT 0,
	"rating_count" integer DEFAULT 0,
	"tags" text[],
	"is_published" boolean DEFAULT false,
	"is_featured" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "best_practices_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "communication_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"recipient_email" text NOT NULL,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"opted_out" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"domain" text,
	"name" text NOT NULL,
	"apollo_id" text,
	"enrichment_data" jsonb,
	"confidence" varchar(10) DEFAULT 'high',
	"needs_review" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "content_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"tags" jsonb,
	"industry" text,
	"use_case" text,
	"variables" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"subject" varchar(255),
	"last_message_at" timestamp,
	"message_count" integer DEFAULT 0,
	"status" varchar(50) DEFAULT 'active',
	"priority" integer DEFAULT 5,
	"assigned_to" varchar,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "credit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"credits_deducted" integer NOT NULL,
	"description" text,
	"prospect_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "do_not_contact_list" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"email" varchar(255),
	"domain" varchar(255),
	"phone" varchar(50),
	"reason" varchar(100) NOT NULL,
	"source" varchar(100),
	"notes" text,
	"added_by" varchar,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_deliverability_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"global_daily_limit" integer DEFAULT 1000,
	"global_hourly_limit" integer DEFAULT 100,
	"per_prospect_max_emails" integer DEFAULT 5,
	"min_time_between_emails_hours" integer DEFAULT 24,
	"hard_bounce_action" varchar(50) DEFAULT 'remove',
	"soft_bounce_retries" integer DEFAULT 3,
	"soft_bounce_action" varchar(50) DEFAULT 'pause',
	"bounce_threshold_percent" integer DEFAULT 5,
	"unsubscribe_page_url" text,
	"unsubscribe_page_logo" text,
	"unsubscribe_page_message" text,
	"unsubscribe_confirmation_email" boolean DEFAULT true,
	"company_signature" text,
	"signature_include_address" boolean DEFAULT true,
	"signature_include_phone" boolean DEFAULT false,
	"signature_include_website" boolean DEFAULT true,
	"signature_include_social" boolean DEFAULT false,
	"track_opens" boolean DEFAULT true,
	"track_clicks" boolean DEFAULT true,
	"custom_tracking_domain" varchar(255),
	"pixel_placement" varchar(50) DEFAULT 'bottom',
	"link_tracking_enabled" boolean DEFAULT true,
	"exclude_links_from_tracking" jsonb,
	"spam_complaint_threshold" integer DEFAULT 1,
	"spam_alert_emails" jsonb,
	"blacklist_monitoring_enabled" boolean DEFAULT true,
	"blacklist_alert_emails" jsonb,
	"monitored_blacklists" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_deliverability_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "email_footer_compliance" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"physical_address_required" boolean DEFAULT true,
	"physical_address" text,
	"unsubscribe_link_required" boolean DEFAULT true,
	"unsubscribe_link_text" varchar(255) DEFAULT 'Unsubscribe',
	"unsubscribe_link_placement" varchar(50) DEFAULT 'footer',
	"company_name_required" boolean DEFAULT true,
	"company_name" varchar(255),
	"include_privacy_link" boolean DEFAULT false,
	"privacy_policy_url" text,
	"include_terms_link" boolean DEFAULT false,
	"terms_url" text,
	"custom_footer_html" text,
	"custom_footer_enabled" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "email_footer_compliance_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "email_mailboxes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"provider" "mailbox_provider" NOT NULL,
	"smtp_host" text,
	"smtp_port" integer,
	"smtp_user" text,
	"smtp_password" text,
	"smtp_secure" boolean DEFAULT true,
	"imap_host" text,
	"imap_port" integer,
	"api_key" text,
	"refresh_token" text,
	"access_token" text,
	"token_expiry" timestamp,
	"status" "mailbox_status" DEFAULT 'active',
	"daily_limit" integer DEFAULT 200,
	"daily_sent" integer DEFAULT 0,
	"last_reset_at" timestamp DEFAULT now(),
	"min_delay_ms" integer DEFAULT 30000,
	"next_available_at" timestamp,
	"bounce_rate" integer DEFAULT 0,
	"spam_score" integer DEFAULT 0,
	"warmup_stage" integer DEFAULT 0,
	"is_default" boolean DEFAULT false,
	"round_robin_order" integer DEFAULT 0,
	"signature" text,
	"readiness_flags" jsonb DEFAULT '{"spfValid":false,"dkimValid":false,"warmupComplete":false}'::jsonb,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_mailboxes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email_id" varchar,
	"mailbox_id" varchar NOT NULL,
	"sequence_id" varchar,
	"prospect_id" varchar NOT NULL,
	"status" "email_queue_status" DEFAULT 'pending',
	"priority" integer DEFAULT 5,
	"scheduled_for" timestamp NOT NULL,
	"sent_at" timestamp,
	"failed_at" timestamp,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"deferral_attempts" integer DEFAULT 0,
	"last_error" text,
	"last_attempt_at" timestamp,
	"next_retry_at" timestamp,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"from_name" text,
	"reply_to" text,
	"step_order" integer,
	"idempotency_key" text,
	"failure_reason" text,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_replies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" varchar,
	"sequence_id" varchar,
	"prospect_id" varchar NOT NULL,
	"reply_content" text NOT NULL,
	"sentiment" text DEFAULT 'neutral',
	"reply_type" text DEFAULT 'human_reply',
	"intent" text,
	"extracted_info" jsonb,
	"ooo_return_date" timestamp,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"ai_summary" text,
	"next_action" text,
	"processed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "email_send_audit" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"sequence_id" varchar,
	"mailbox_id" varchar,
	"decision" text NOT NULL,
	"final_score" text NOT NULL,
	"score_breakdown" jsonb,
	"reasons" text[],
	"blocked_reasons" jsonb,
	"ai_confidence" text,
	"has_hallucination_flag" boolean DEFAULT false,
	"claim_violations" jsonb,
	"email_queue_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_send_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"queue_id" varchar,
	"mailbox_id" varchar NOT NULL,
	"status" "email_send_status" NOT NULL,
	"message_id" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"error" text,
	"response_code" integer,
	"response_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"sequence_id" varchar,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"personalization_score" integer,
	"ai_generated" boolean DEFAULT false,
	"is_follow_up" boolean DEFAULT false,
	"parent_email_id" varchar,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"clicked_at" timestamp,
	"replied_at" timestamp,
	"delivered_at" timestamp,
	"bounced_at" timestamp,
	"tracking_id" text,
	"message_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"entity_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"signal_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_event_id" text,
	"source_timestamp" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"trust_score" integer DEFAULT 50 NOT NULL,
	"freshness_score" integer DEFAULT 100 NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"redacted_at" timestamp with time zone,
	"redacted_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feature_usage_tracking" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_name" text NOT NULL,
	"organization_id" varchar,
	"user_id" varchar,
	"usage_count" integer DEFAULT 1,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoff_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handoff_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icp_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"operation" varchar(100) NOT NULL,
	"resource_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending',
	"response" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"super_admin_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"target_user_id" varchar,
	"reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "import_records" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"job_id" varchar,
	"file_name" text NOT NULL,
	"total_rows" integer DEFAULT 0,
	"valid_rows" integer DEFAULT 0,
	"duplicate_rows" integer DEFAULT 0,
	"error_rows" integer DEFAULT 0,
	"field_mappings" jsonb,
	"validation_results" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intent_definitions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}',
	"status" "intent_status" DEFAULT 'draft' NOT NULL,
	"active_version_id" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intent_matches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"intent_id" varchar NOT NULL,
	"intent_version_id" varchar NOT NULL,
	"entity_id" varchar NOT NULL,
	"entity_type" text NOT NULL,
	"result" "match_result" NOT NULL,
	"score" integer,
	"score_breakdown" jsonb DEFAULT '{}',
	"is_replay" boolean DEFAULT false NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "intent_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"dsl_source" text NOT NULL,
	"compiled_ast" jsonb,
	"complexity_score" integer DEFAULT 0,
	"validation_errors" jsonb DEFAULT '[]',
	"is_valid" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" varchar,
	"created_by" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'queued',
	"title" text NOT NULL,
	"description" text,
	"total_items" integer DEFAULT 0,
	"processed_items" integer DEFAULT 0,
	"success_count" integer DEFAULT 0,
	"failure_count" integer DEFAULT 0,
	"partial_count" integer DEFAULT 0,
	"job_data" jsonb,
	"results" jsonb,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"lead_id" varchar NOT NULL,
	"sequence_id" varchar NOT NULL,
	"step_id" varchar,
	"event_type" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "leaderboard_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"meetings_booked" integer DEFAULT 0,
	"emails_sent" integer DEFAULT 0,
	"replies_received" integer DEFAULT 0,
	"positive_replies" integer DEFAULT 0,
	"open_rate" real DEFAULT 0,
	"reply_rate" real DEFAULT 0,
	"rank" integer,
	"points" integer DEFAULT 0,
	"previous_rank" integer,
	"rank_change" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_periods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"period_type" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_final" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "mailbox_team_allocations" (
	"id" varchar PRIMARY KEY NOT NULL,
	"mailbox_id" varchar NOT NULL,
	"team_id" varchar NOT NULL,
	"priority" integer DEFAULT 1,
	"allocated_at" timestamp DEFAULT now(),
	"allocated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "mailbox_warmup_schedules" (
	"id" varchar PRIMARY KEY NOT NULL,
	"mailbox_id" varchar NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"initial_daily_limit" integer DEFAULT 5,
	"target_daily_limit" integer DEFAULT 100,
	"increment_per_day" integer DEFAULT 5,
	"current_stage" integer DEFAULT 1,
	"total_stages" integer DEFAULT 20,
	"send_window_start" integer DEFAULT 9,
	"send_window_end" integer DEFAULT 17,
	"timezone" varchar(50) DEFAULT 'UTC',
	"exclude_weekends" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"paused_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "manager_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"manager_role" "manager_role" DEFAULT 'secondary',
	"phone_number" text,
	"job_title" text,
	"department" text,
	"invited_by" varchar,
	"invited_by_type" text,
	"invitation_sent_at" timestamp,
	"invitation_accepted_at" timestamp,
	"welcome_email_sent" boolean DEFAULT false,
	"permissions" jsonb,
	"last_active_at" timestamp,
	"total_logins" integer DEFAULT 0,
	"total_actions_performed" integer DEFAULT 0,
	"prospects_created" integer DEFAULT 0,
	"emails_sent" integer DEFAULT 0,
	"sequences_launched" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_activity_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" varchar,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_quotas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"max_users" integer DEFAULT 10,
	"max_prospects" integer DEFAULT 10000,
	"max_sequences" integer DEFAULT 50,
	"max_active_sequences" integer DEFAULT 10,
	"max_active_campaigns" integer DEFAULT 5,
	"max_prospects_per_upload" integer DEFAULT 1000,
	"current_users" integer DEFAULT 0,
	"current_prospects" integer DEFAULT 0,
	"current_sequences" integer DEFAULT 0,
	"current_active_sequences" integer DEFAULT 0,
	"current_active_campaigns" integer DEFAULT 0,
	"is_paused" boolean DEFAULT false,
	"paused_at" timestamp,
	"paused_by" varchar,
	"paused_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"subject_line" varchar(255),
	"body" text NOT NULL,
	"type" varchar(50) DEFAULT 'personal',
	"tone" varchar(50) DEFAULT 'professional',
	"category" varchar(100),
	"variables" jsonb,
	"use_count" integer DEFAULT 0,
	"total_sent" integer DEFAULT 0,
	"total_opens" integer DEFAULT 0,
	"total_replies" integer DEFAULT 0,
	"avg_reply_rate" real,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"date" date NOT NULL,
	"emails_sent" integer DEFAULT 0,
	"emails_opened" integer DEFAULT 0,
	"emails_clicked" integer DEFAULT 0,
	"replies_received" integer DEFAULT 0,
	"positive_replies" integer DEFAULT 0,
	"negative_replies" integer DEFAULT 0,
	"meetings_booked" integer DEFAULT 0,
	"bounces" integer DEFAULT 0,
	"unsubscribes" integer DEFAULT 0,
	"ai_credits_used" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"channel" varchar(50) NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"subject" varchar(255),
	"content" text,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"status" varchar(50) DEFAULT 'pending',
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true,
	"channels" jsonb DEFAULT '["email"]'::jsonb,
	"recipient_emails" jsonb,
	"recipient_user_ids" jsonb,
	"threshold" integer,
	"threshold_unit" varchar(50),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"default_channels" jsonb DEFAULT '["email","in_app"]'::jsonb,
	"business_hours_only" boolean DEFAULT false,
	"business_hours_start" integer DEFAULT 9,
	"business_hours_end" integer DEFAULT 17,
	"business_timezone" varchar(50) DEFAULT 'UTC',
	"escalation_enabled" boolean DEFAULT false,
	"escalation_delay_minutes" integer DEFAULT 30,
	"escalation_emails" jsonb,
	"daily_digest_enabled" boolean DEFAULT true,
	"daily_digest_time" integer DEFAULT 9,
	"weekly_digest_enabled" boolean DEFAULT true,
	"weekly_digest_day" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "notification_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "observability_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_licenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"total_seats" jsonb,
	"used_seats" jsonb,
	"billing_cycle" text DEFAULT 'monthly',
	"renews_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_licenses_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"branding_colors" jsonb,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"postal_code" text,
	"industry" text,
	"company_size" text,
	"website" text,
	"phone" text,
	"timezone" text DEFAULT 'UTC',
	"language" text DEFAULT 'en',
	"fiscal_year_start" integer DEFAULT 1,
	"reporting_period" text DEFAULT 'monthly',
	"preferences" jsonb,
	"status" "organization_status" DEFAULT 'active',
	"owner_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" "permission_category" NOT NULL,
	"is_system" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "personalization_results" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"personalization_score" integer NOT NULL,
	"variables" jsonb,
	"insights" jsonb,
	"email_suggestions" jsonb,
	"content_recommendations" jsonb,
	"linkedin_data" jsonb,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_alerts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_type" text NOT NULL,
	"severity" "platform_alert_severity" DEFAULT 'warning' NOT NULL,
	"status" "platform_alert_status" DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"source_system" text,
	"affected_tenant_id" varchar,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"notifications_sent" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "platform_feature_analytics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_name" text NOT NULL,
	"total_usage_count" integer DEFAULT 0,
	"unique_users_count" integer DEFAULT 0,
	"unique_tenants_count" integer DEFAULT 0,
	"adoption_rate" real DEFAULT 0,
	"avg_usage_per_tenant" real DEFAULT 0,
	"avg_usage_per_user" real DEFAULT 0,
	"period_type" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_enrichment_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" varchar,
	"status" varchar(50) DEFAULT 'pending',
	"provider" varchar(50),
	"retry_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prospect_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"user_id" varchar,
	"search_criteria" jsonb NOT NULL,
	"provider" varchar(50),
	"total_results" integer DEFAULT 0,
	"api_cost" real DEFAULT 0,
	"status" varchar(50) DEFAULT 'completed',
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prospects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"first_name" text,
	"last_name" text,
	"full_name" text,
	"primary_email" text,
	"secondary_email" text,
	"job_title" text,
	"seniority" text,
	"department" text,
	"company_name" text,
	"company_domain" text,
	"company_size" text,
	"company_industry" text,
	"company_location" text,
	"contact_location" text,
	"phone_number" text,
	"linkedin_url" text,
	"apollo_id" text,
	"tags" text[],
	"enrichment_status" "enrichment_status" DEFAULT 'new',
	"enrichment_data" jsonb,
	"source" "prospect_source" DEFAULT 'manual',
	"field_sources" jsonb,
	"timezone" text,
	"lead_score" integer DEFAULT 0,
	"is_vip" boolean DEFAULT false,
	"company_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"scope" "permission_scope" DEFAULT 'organization',
	"is_system" boolean DEFAULT false,
	"is_default" boolean DEFAULT false,
	"inherits_from_role_id" varchar,
	"color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_execution_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar NOT NULL,
	"match_id" varchar NOT NULL,
	"rule_id" text NOT NULL,
	"rule_label" text,
	"passed" boolean NOT NULL,
	"evidence_ids" text[] DEFAULT '{}',
	"evaluated_value" jsonb,
	"expected_value" jsonb,
	"execution_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_heartbeat" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduler_type" text DEFAULT 'email_queue' NOT NULL,
	"last_heartbeat" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"processed_count" integer DEFAULT 0,
	"failed_count" integer DEFAULT 0,
	"average_processing_ms" integer,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdr_workflow_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"current_stage" "sdr_workflow_stage" DEFAULT 'readiness' NOT NULL,
	"readiness_completed_at" timestamp,
	"upload_completed_at" timestamp,
	"enrichment_completed_at" timestamp,
	"sequence_completed_at" timestamp,
	"enrollment_completed_at" timestamp,
	"activation_completed_at" timestamp,
	"sending_started_at" timestamp,
	"replies_detected_at" timestamp,
	"analytics_unlocked_at" timestamp,
	"blocking_reasons" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sdr_workflow_progress_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"extraction_name" text,
	"tag" text,
	"query" text NOT NULL,
	"ai_filters" jsonb,
	"apollo_filters" jsonb,
	"total_results" integer DEFAULT 0,
	"imported_results" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sending_domains" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"domain" varchar(255) NOT NULL,
	"dkim_selector" varchar(255),
	"dkim_public_key" text,
	"dkim_private_key" text,
	"spf_record" text,
	"dmarc_record" text,
	"return_path" varchar(255),
	"verification_status" "domain_verification_status" DEFAULT 'pending',
	"verification_token" varchar(255),
	"verified_at" timestamp,
	"last_verified_at" timestamp,
	"health_score" integer DEFAULT 100,
	"last_health_check" timestamp,
	"health_issues" jsonb,
	"is_active" boolean DEFAULT true,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sequence_prospects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"current_step_id" varchar,
	"automation_run_id" varchar,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL,
	"last_contacted_at" timestamp,
	"completed_at" timestamp,
	"replies" integer DEFAULT 0,
	"opens" integer DEFAULT 0,
	"clicks" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" varchar NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"step_order" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"step_type" text DEFAULT 'email' NOT NULL,
	"ai_generated" boolean DEFAULT false,
	"variables" jsonb,
	"mailbox_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'outbound' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"ai_personalization_enabled" boolean DEFAULT false,
	"total_prospects" integer DEFAULT 0,
	"active_prospects" integer DEFAULT 0,
	"completed_prospects" integer DEFAULT 0,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_activated_at" timestamp,
	"last_status_change_at" timestamp,
	"activation_toggle_count" integer DEFAULT 0,
	"is_approved" boolean DEFAULT false,
	"sending_window_start" integer DEFAULT 9,
	"sending_window_end" integer DEFAULT 17,
	"daily_email_limit" integer DEFAULT 50,
	"re_engagement_days" integer DEFAULT 30,
	"max_re_engagements" integer DEFAULT 3
);
--> statement-breakpoint
CREATE TABLE "super_admin_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"super_admin_id" varchar,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" varchar,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "super_admin_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"super_admin_id" varchar NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "super_admin_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "super_admins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"status" "super_admin_status" DEFAULT 'active',
	"is_master_admin" boolean DEFAULT false,
	"permissions" jsonb,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "super_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "suppression_list_imports" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"file_name" varchar(255),
	"file_size" integer,
	"record_count" integer,
	"imported_count" integer,
	"duplicate_count" integer,
	"error_count" integer,
	"imported_by" varchar,
	"status" varchar(50) DEFAULT 'pending',
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" "team_role" DEFAULT 'member',
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"added_by" varchar
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"workspace_id" varchar,
	"parent_team_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"territory" text,
	"visibility" "team_visibility" DEFAULT 'team_only',
	"quotas" jsonb,
	"goals" jsonb,
	"settings" jsonb,
	"color" text,
	"icon" text,
	"is_active" boolean DEFAULT true,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tenant_activity_timeline" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"event_title" text NOT NULL,
	"event_description" text,
	"actor_id" varchar,
	"actor_type" text,
	"metadata" jsonb,
	"importance" text DEFAULT 'normal',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_communications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "tenant_communication_type" DEFAULT 'custom' NOT NULL,
	"status" "tenant_communication_status" DEFAULT 'draft' NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"target_all" boolean DEFAULT true,
	"target_plan_types" text[],
	"target_industries" text[],
	"target_usage_levels" text[],
	"target_tenant_ids" text[],
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"created_by" varchar,
	"recipient_count" integer DEFAULT 0,
	"open_count" integer DEFAULT 0,
	"click_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_configuration" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"max_users" integer,
	"max_prospects" integer,
	"max_sequences" integer,
	"max_mailboxes" integer,
	"max_daily_emails" integer,
	"max_hourly_emails" integer,
	"api_rate_limit_per_minute" integer,
	"storage_quota_mb" integer DEFAULT 1000,
	"current_storage_used_mb" integer DEFAULT 0,
	"api_requests_per_hour" integer DEFAULT 1000,
	"api_requests_per_day" integer DEFAULT 10000,
	"bulk_operations_per_day" integer DEFAULT 10,
	"max_emails_per_hour" integer DEFAULT 50,
	"warmup_mode_enabled" boolean DEFAULT false,
	"warmup_daily_limit" integer DEFAULT 20,
	"max_prospects_per_import" integer DEFAULT 1000,
	"max_enrichments_per_day" integer DEFAULT 100,
	"demo_mode_enabled" boolean DEFAULT false,
	"demo_mode_reason" text,
	"demo_mode_enabled_at" timestamp,
	"demo_mode_enabled_by" varchar,
	"multi_manager_enabled" boolean DEFAULT false,
	"max_managers" integer DEFAULT 1,
	"branding_logo" text,
	"branding_primary_color" text,
	"branding_secondary_color" text,
	"branding_font_family" text,
	"custom_email_footer" text,
	"data_retention_days" integer DEFAULT 365,
	"audit_log_retention_days" integer DEFAULT 90,
	"session_timeout_minutes" integer DEFAULT 480,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_configuration_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_controls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"tenant_automation_status" "tenant_automation_status" DEFAULT 'active',
	"paused_reason" text,
	"paused_at" timestamp,
	"paused_by" varchar,
	"emails_per_minute" integer DEFAULT 10,
	"ai_calls_per_minute" integer DEFAULT 20,
	"enrollments_per_hour" integer DEFAULT 100,
	"prospects_per_hour" integer DEFAULT 500,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_controls_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_feature_flags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"ai_prospecting" boolean DEFAULT true,
	"ai_email_generation" boolean DEFAULT true,
	"ai_sentiment_analysis" boolean DEFAULT true,
	"advanced_analytics" boolean DEFAULT false,
	"custom_reports" boolean DEFAULT false,
	"export_capabilities" boolean DEFAULT true,
	"white_label" boolean DEFAULT false,
	"custom_branding" boolean DEFAULT false,
	"custom_domain" boolean DEFAULT false,
	"crm_integration" boolean DEFAULT false,
	"webhook_access" boolean DEFAULT false,
	"api_access" boolean DEFAULT true,
	"multi_mailbox" boolean DEFAULT true,
	"email_sequences" boolean DEFAULT true,
	"bulk_operations" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_feature_flags_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_onboarding" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"manager_account_created" boolean DEFAULT false,
	"manager_account_created_at" timestamp,
	"initial_users_added" boolean DEFAULT false,
	"initial_users_added_at" timestamp,
	"users_added_count" integer DEFAULT 0,
	"first_campaign_launched" boolean DEFAULT false,
	"first_campaign_launched_at" timestamp,
	"domain_configured" boolean DEFAULT false,
	"domain_configured_at" timestamp,
	"first_meeting_booked" boolean DEFAULT false,
	"first_meeting_booked_at" timestamp,
	"first_prospect_added" boolean DEFAULT false,
	"first_prospect_added_at" timestamp,
	"first_email_sent" boolean DEFAULT false,
	"first_email_sent_at" timestamp,
	"mailbox_connected" boolean DEFAULT false,
	"mailbox_connected_at" timestamp,
	"onboarding_progress" integer DEFAULT 0,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_completed_at" timestamp,
	"success_manager_id" varchar,
	"success_manager_assigned_at" timestamp,
	"health_score" integer DEFAULT 50,
	"health_score_updated_at" timestamp,
	"health_risk_level" text DEFAULT 'medium',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_onboarding_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"plan" "tenant_plan" DEFAULT 'trial',
	"tenant_status" "tenant_status" DEFAULT 'trial',
	"trial_ends_at" timestamp,
	"subscription_started_at" timestamp,
	"subscription_ends_at" timestamp,
	"billing_email" text,
	"billing_address" text,
	"max_users" integer DEFAULT 5,
	"max_prospects" integer DEFAULT 1000,
	"max_sequences" integer DEFAULT 10,
	"max_mailboxes" integer DEFAULT 3,
	"max_daily_emails" integer DEFAULT 100,
	"current_user_count" integer DEFAULT 0,
	"current_prospect_count" integer DEFAULT 0,
	"current_sequence_count" integer DEFAULT 0,
	"health_score" integer DEFAULT 100,
	"last_activity_at" timestamp,
	"total_emails_sent" integer DEFAULT 0,
	"total_prospects_enriched" integer DEFAULT 0,
	"provisioned_by" varchar,
	"provisioned_at" timestamp,
	"suspended_by" varchar,
	"suspended_at" timestamp,
	"suspend_reason" text,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"primary_contact_phone" text,
	"internal_notes" text,
	"credit_per_user" integer DEFAULT 500,
	"billing_cycle_start" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_settings_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_workflow_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"current_stage" "tenant_workflow_stage" DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"manager_active_at" timestamp,
	"limits_configured_at" timestamp,
	"automation_enabled_at" timestamp,
	"created_by" varchar,
	"manager_activated_by" varchar,
	"limits_configured_by" varchar,
	"automation_enabled_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_workflow_progress_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "throttle_windows" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar,
	"counter_type" varchar(50) NOT NULL,
	"window_start" timestamp NOT NULL,
	"window_duration_minutes" integer DEFAULT 1 NOT NULL,
	"current_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"prospect_id" varchar NOT NULL,
	"email" text NOT NULL,
	"reason" text,
	"unsubscribed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar,
	"counter_type" varchar(50) NOT NULL,
	"period_type" varchar(20) NOT NULL,
	"period_start" timestamp NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" varchar,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"duration" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"badge_type" "badge_type" NOT NULL,
	"badge_name" text NOT NULL,
	"badge_description" text,
	"badge_icon" text,
	"badge_color" text,
	"achieved_at" timestamp DEFAULT now() NOT NULL,
	"achievement_value" integer,
	"period_type" text,
	"is_displayed" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_controls" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"manager_id" varchar,
	"max_emails_per_day" integer DEFAULT 200,
	"max_active_campaigns" integer DEFAULT 3,
	"max_concurrent_enrollments" integer DEFAULT 5,
	"max_prospects_per_sequence" integer DEFAULT 500,
	"max_personalization_tokens" integer DEFAULT 1000,
	"max_retries_per_campaign" integer DEFAULT 3,
	"emails_sent_today" integer DEFAULT 0,
	"active_campaigns" integer DEFAULT 0,
	"active_enrollments" integer DEFAULT 0,
	"failed_retries_count" integer DEFAULT 0,
	"last_reset_date" date,
	"is_paused" boolean DEFAULT false,
	"paused_at" timestamp,
	"paused_by" varchar,
	"paused_reason" text,
	"auto_paused_on_failures" boolean DEFAULT false,
	"consecutive_failures" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"tenant_id" varchar NOT NULL,
	"credits_assigned" integer DEFAULT 500 NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"invited_by" varchar NOT NULL,
	"organization_id" varchar,
	"workspace_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_licenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"tier" "license_tier" DEFAULT 'basic',
	"allocated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"allocated_by" varchar,
	"features" jsonb,
	CONSTRAINT "user_licenses_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"permission_id" varchar NOT NULL,
	"allowed" boolean NOT NULL,
	"scope_type" "permission_scope" DEFAULT 'organization',
	"scope_id" varchar,
	"reason" text,
	"granted_by" varchar,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"job_title" text,
	"department" text,
	"phone" text,
	"timezone" text,
	"language" text DEFAULT 'en',
	"avatar_url" text,
	"bio" text,
	"linkedin_url" text,
	"territory" text,
	"manager" varchar,
	"metadata" jsonb,
	"preferences" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_quotas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"user_id" varchar NOT NULL,
	"period" varchar(50) NOT NULL,
	"quota_type" varchar(50) NOT NULL,
	"quota_value" integer NOT NULL,
	"current_value" integer DEFAULT 0,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_role_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role_id" varchar NOT NULL,
	"scope_type" "permission_scope" DEFAULT 'organization',
	"scope_id" varchar,
	"assigned_by" varchar,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_info" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"remember_me" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"expired_at" timestamp,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text,
	"email" text NOT NULL,
	"password_hash" text,
	"auth_provider" "auth_provider" DEFAULT 'password',
	"password_login_enabled" boolean DEFAULT false,
	"force_password_reset" boolean DEFAULT false,
	"first_name" text,
	"last_name" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified" boolean DEFAULT false,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_completed_at" timestamp,
	"onboarding_steps" jsonb,
	"organization_id" varchar,
	"default_workspace_id" varchar,
	"last_login" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "webhook_delivery_logs" (
	"id" varchar PRIMARY KEY NOT NULL,
	"webhook_id" varchar NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb,
	"status_code" integer,
	"response_body" text,
	"response_time_ms" integer,
	"attempt_number" integer DEFAULT 1,
	"next_retry_at" timestamp,
	"success" boolean DEFAULT false,
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" varchar PRIMARY KEY NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"auth_type" varchar(50) DEFAULT 'none',
	"auth_token" text,
	"auth_header" varchar(100),
	"hmac_secret" text,
	"max_retries" integer DEFAULT 3,
	"retry_delay_seconds" integer DEFAULT 60,
	"timeout_seconds" integer DEFAULT 30,
	"is_active" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"consecutive_failures" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" jsonb,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"invited_by" varchar
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'default',
	"parent_id" varchar,
	"settings" jsonb,
	"resource_limits" jsonb,
	"status" "workspace_status" DEFAULT 'active',
	"owner_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ae_handoffs" ADD CONSTRAINT "ae_handoffs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ae_handoffs" ADD CONSTRAINT "ae_handoffs_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ae_handoffs" ADD CONSTRAINT "ae_handoffs_sdr_user_id_users_id_fk" FOREIGN KEY ("sdr_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ae_handoffs" ADD CONSTRAINT "ae_handoffs_ae_user_id_users_id_fk" FOREIGN KEY ("ae_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_configuration" ADD CONSTRAINT "ai_configuration_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_followup_jobs" ADD CONSTRAINT "ai_followup_jobs_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_exclusion_log" ADD CONSTRAINT "automation_exclusion_log_automation_run_id_automation_runs_id_fk" FOREIGN KEY ("automation_run_id") REFERENCES "public"."automation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "background_job_audit" ADD CONSTRAINT "background_job_audit_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_practice_ratings" ADD CONSTRAINT "best_practice_ratings_best_practice_id_best_practices_id_fk" FOREIGN KEY ("best_practice_id") REFERENCES "public"."best_practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_practice_ratings" ADD CONSTRAINT "best_practice_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_practices" ADD CONSTRAINT "best_practices_category_id_best_practice_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."best_practice_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_communication_id_tenant_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."tenant_communications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_recipients" ADD CONSTRAINT "communication_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_logs" ADD CONSTRAINT "credit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_logs" ADD CONSTRAINT "credit_logs_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "do_not_contact_list" ADD CONSTRAINT "do_not_contact_list_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "do_not_contact_list" ADD CONSTRAINT "do_not_contact_list_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_deliverability_settings" ADD CONSTRAINT "email_deliverability_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_footer_compliance" ADD CONSTRAINT "email_footer_compliance_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_mailbox_id_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_queue" ADD CONSTRAINT "email_queue_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_audit" ADD CONSTRAINT "email_send_audit_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_audit" ADD CONSTRAINT "email_send_audit_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_audit" ADD CONSTRAINT "email_send_audit_mailbox_id_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_audit" ADD CONSTRAINT "email_send_audit_email_queue_id_email_queue_id_fk" FOREIGN KEY ("email_queue_id") REFERENCES "public"."email_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_log" ADD CONSTRAINT "email_send_log_queue_id_email_queue_id_fk" FOREIGN KEY ("queue_id") REFERENCES "public"."email_queue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_send_log" ADD CONSTRAINT "email_send_log_mailbox_id_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage_tracking" ADD CONSTRAINT "feature_usage_tracking_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_usage_tracking" ADD CONSTRAINT "feature_usage_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_activities" ADD CONSTRAINT "handoff_activities_handoff_id_ae_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."ae_handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_activities" ADD CONSTRAINT "handoff_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_super_admin_id_super_admins_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_matches" ADD CONSTRAINT "intent_matches_intent_id_intent_definitions_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intent_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_matches" ADD CONSTRAINT "intent_matches_intent_version_id_intent_versions_id_fk" FOREIGN KEY ("intent_version_id") REFERENCES "public"."intent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intent_versions" ADD CONSTRAINT "intent_versions_intent_id_intent_definitions_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."intent_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_prospects_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_period_id_leaderboard_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."leaderboard_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_periods" ADD CONSTRAINT "leaderboard_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_team_allocations" ADD CONSTRAINT "mailbox_team_allocations_mailbox_id_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_team_allocations" ADD CONSTRAINT "mailbox_team_allocations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_team_allocations" ADD CONSTRAINT "mailbox_team_allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_warmup_schedules" ADD CONSTRAINT "mailbox_warmup_schedules_mailbox_id_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."email_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_accounts" ADD CONSTRAINT "manager_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_accounts" ADD CONSTRAINT "manager_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_activity_logs" ADD CONSTRAINT "manager_activity_logs_manager_id_manager_accounts_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."manager_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_activity_logs" ADD CONSTRAINT "manager_activity_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_quotas" ADD CONSTRAINT "manager_quotas_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_quotas" ADD CONSTRAINT "manager_quotas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_licenses" ADD CONSTRAINT "organization_licenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personalization_results" ADD CONSTRAINT "personalization_results_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_alerts" ADD CONSTRAINT "platform_alerts_affected_tenant_id_organizations_id_fk" FOREIGN KEY ("affected_tenant_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_alerts" ADD CONSTRAINT "platform_alerts_acknowledged_by_super_admins_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_alerts" ADD CONSTRAINT "platform_alerts_resolved_by_super_admins_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_enrichment_queue" ADD CONSTRAINT "prospect_enrichment_queue_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_notes" ADD CONSTRAINT "prospect_notes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_searches" ADD CONSTRAINT "prospect_searches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_searches" ADD CONSTRAINT "prospect_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_execution_logs" ADD CONSTRAINT "rule_execution_logs_match_id_intent_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."intent_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_workflow_progress" ADD CONSTRAINT "sdr_workflow_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_workflow_progress" ADD CONSTRAINT "sdr_workflow_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_domains" ADD CONSTRAINT "sending_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_prospects" ADD CONSTRAINT "sequence_prospects_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_prospects" ADD CONSTRAINT "sequence_prospects_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_prospects" ADD CONSTRAINT "sequence_prospects_current_step_id_sequence_steps_id_fk" FOREIGN KEY ("current_step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_super_admin_id_super_admins_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "super_admin_sessions" ADD CONSTRAINT "super_admin_sessions_super_admin_id_super_admins_id_fk" FOREIGN KEY ("super_admin_id") REFERENCES "public"."super_admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list_imports" ADD CONSTRAINT "suppression_list_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list_imports" ADD CONSTRAINT "suppression_list_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_activity_timeline" ADD CONSTRAINT "tenant_activity_timeline_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_communications" ADD CONSTRAINT "tenant_communications_created_by_super_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_configuration" ADD CONSTRAINT "tenant_configuration_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_controls" ADD CONSTRAINT "tenant_controls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_flags" ADD CONSTRAINT "tenant_feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_onboarding" ADD CONSTRAINT "tenant_onboarding_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_onboarding" ADD CONSTRAINT "tenant_onboarding_success_manager_id_super_admins_id_fk" FOREIGN KEY ("success_manager_id") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_provisioned_by_super_admins_id_fk" FOREIGN KEY ("provisioned_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_suspended_by_super_admins_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_workflow_progress" ADD CONSTRAINT "tenant_workflow_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_workflow_progress" ADD CONSTRAINT "tenant_workflow_progress_created_by_super_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_workflow_progress" ADD CONSTRAINT "tenant_workflow_progress_limits_configured_by_super_admins_id_fk" FOREIGN KEY ("limits_configured_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_workflow_progress" ADD CONSTRAINT "tenant_workflow_progress_automation_enabled_by_super_admins_id_fk" FOREIGN KEY ("automation_enabled_by") REFERENCES "public"."super_admins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "throttle_windows" ADD CONSTRAINT "throttle_windows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "throttle_windows" ADD CONSTRAINT "throttle_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribes" ADD CONSTRAINT "unsubscribes_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_controls" ADD CONSTRAINT "user_controls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_controls" ADD CONSTRAINT "user_controls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_controls" ADD CONSTRAINT "user_controls_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_tenant_id_organizations_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_licenses" ADD CONSTRAINT "user_licenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_licenses" ADD CONSTRAINT "user_licenses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_licenses" ADD CONSTRAINT "user_licenses_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_manager_users_id_fk" FOREIGN KEY ("manager") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ae_handoffs_org_idx" ON "ae_handoffs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ae_handoffs_prospect_idx" ON "ae_handoffs" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "ae_handoffs_sdr_idx" ON "ae_handoffs" USING btree ("sdr_user_id");--> statement-breakpoint
CREATE INDEX "ae_handoffs_ae_idx" ON "ae_handoffs" USING btree ("ae_user_id");--> statement-breakpoint
CREATE INDEX "ae_handoffs_status_idx" ON "ae_handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_prompt_templates_org_category_idx" ON "ai_prompt_templates" USING btree ("organization_id","category");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_org_idx" ON "ai_usage_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_usage_org_id_idx" ON "api_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "api_usage_provider_idx" ON "api_usage" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "api_usage_created_at_idx" ON "api_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_usage_logs_api_key_id_idx" ON "api_usage_logs" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_usage_logs_created_at_idx" ON "api_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "background_job_audit_org_id_idx" ON "background_job_audit" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "background_job_audit_type_status_idx" ON "background_job_audit" USING btree ("job_type","status");--> statement-breakpoint
CREATE INDEX "background_job_audit_queued_at_idx" ON "background_job_audit" USING btree ("queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "best_practice_ratings_unique" ON "best_practice_ratings" USING btree ("best_practice_id","user_id");--> statement-breakpoint
CREATE INDEX "best_practices_category_idx" ON "best_practices" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "best_practices_type_idx" ON "best_practices" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "best_practices_published_idx" ON "best_practices" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "communication_recipients_comm_id_idx" ON "communication_recipients" USING btree ("communication_id");--> statement-breakpoint
CREATE INDEX "communication_recipients_org_id_idx" ON "communication_recipients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "companies_user_id_idx" ON "companies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "companies_apollo_id_idx" ON "companies" USING btree ("apollo_id");--> statement-breakpoint
CREATE INDEX "credit_logs_user_id_idx" ON "credit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_logs_tenant_id_idx" ON "credit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "credit_logs_created_at_idx" ON "credit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dnc_org_email_idx" ON "do_not_contact_list" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "dnc_org_domain_idx" ON "do_not_contact_list" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE INDEX "email_queue_sequence_id_idx" ON "email_queue" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "email_queue_user_status_sent_idx" ON "email_queue" USING btree ("user_id","status","sent_at");--> statement-breakpoint
CREATE INDEX "email_queue_status_scheduled_idx" ON "email_queue" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "email_queue_mailbox_id_idx" ON "email_queue" USING btree ("mailbox_id");--> statement-breakpoint
CREATE INDEX "email_queue_sequence_id_status_sent_at_idx" ON "email_queue" USING btree ("sequence_id","status","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_queue_idempotency_key_idx" ON "email_queue" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "email_replies_sequence_id_idx" ON "email_replies" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "email_replies_sequence_received_idx" ON "email_replies" USING btree ("sequence_id","received_at");--> statement-breakpoint
CREATE INDEX "email_replies_sentiment_idx" ON "email_replies" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "email_replies_prospect_id_idx" ON "email_replies" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "email_send_audit_user_id_idx" ON "email_send_audit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_send_audit_prospect_id_idx" ON "email_send_audit" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "email_send_audit_sequence_id_idx" ON "email_send_audit" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "email_send_audit_decision_idx" ON "email_send_audit" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "email_send_audit_created_at_idx" ON "email_send_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "evidence_items_tenant_entity_idx" ON "evidence_items" USING btree ("tenant_id","entity_id");--> statement-breakpoint
CREATE INDEX "evidence_items_signal_type_idx" ON "evidence_items" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "evidence_items_source_event_idx" ON "evidence_items" USING btree ("tenant_id","source_event_id");--> statement-breakpoint
CREATE INDEX "evidence_items_expires_idx" ON "evidence_items" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "feature_usage_tracking_feature_idx" ON "feature_usage_tracking" USING btree ("feature_name");--> statement-breakpoint
CREATE INDEX "feature_usage_tracking_org_id_idx" ON "feature_usage_tracking" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "feature_usage_tracking_period_idx" ON "feature_usage_tracking" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "handoff_activities_handoff_idx" ON "handoff_activities" USING btree ("handoff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_key_idx" ON "idempotency_keys" USING btree ("organization_id","user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "impersonation_logs_super_admin_id_idx" ON "impersonation_logs" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "impersonation_logs_org_id_idx" ON "impersonation_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "impersonation_logs_started_at_idx" ON "impersonation_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "intent_definitions_tenant_idx" ON "intent_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "intent_definitions_status_idx" ON "intent_definitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "intent_definitions_tenant_name_idx" ON "intent_definitions" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "intent_matches_tenant_intent_idx" ON "intent_matches" USING btree ("tenant_id","intent_id");--> statement-breakpoint
CREATE INDEX "intent_matches_entity_idx" ON "intent_matches" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "intent_matches_evaluated_at_idx" ON "intent_matches" USING btree ("evaluated_at");--> statement-breakpoint
CREATE INDEX "intent_matches_replay_idx" ON "intent_matches" USING btree ("is_replay");--> statement-breakpoint
CREATE INDEX "intent_versions_intent_idx" ON "intent_versions" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "intent_versions_tenant_idx" ON "intent_versions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intent_versions_intent_version_uniq" ON "intent_versions" USING btree ("intent_id","version_number");--> statement-breakpoint
CREATE INDEX "lead_events_user_id_idx" ON "lead_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lead_events_lead_id_idx" ON "lead_events" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_events_sequence_id_idx" ON "lead_events" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "lead_events_step_id_idx" ON "lead_events" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "lead_events_event_type_idx" ON "lead_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_period_idx" ON "leaderboard_entries" USING btree ("period_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_user_idx" ON "leaderboard_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_rank_idx" ON "leaderboard_entries" USING btree ("period_id","rank");--> statement-breakpoint
CREATE INDEX "leaderboard_periods_org_period_idx" ON "leaderboard_periods" USING btree ("organization_id","period_type");--> statement-breakpoint
CREATE INDEX "leaderboard_periods_start_idx" ON "leaderboard_periods" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "magic_links_email_idx" ON "magic_links" USING btree ("email");--> statement-breakpoint
CREATE INDEX "magic_links_expires_at_idx" ON "magic_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mailbox_team_allocations_idx" ON "mailbox_team_allocations" USING btree ("mailbox_id","team_id");--> statement-breakpoint
CREATE INDEX "manager_accounts_user_id_idx" ON "manager_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manager_accounts_org_id_idx" ON "manager_accounts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "manager_accounts_role_idx" ON "manager_accounts" USING btree ("manager_role");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_accounts_user_org_unique" ON "manager_accounts" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "manager_activity_logs_manager_id_idx" ON "manager_activity_logs" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "manager_activity_logs_org_id_idx" ON "manager_activity_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "manager_activity_logs_action_idx" ON "manager_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "manager_activity_logs_created_at_idx" ON "manager_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_quotas_manager_id_idx" ON "manager_quotas" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "manager_quotas_org_id_idx" ON "manager_quotas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_logs_org_idx" ON "notification_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_org_type_idx" ON "notification_preferences" USING btree ("organization_id","notification_type");--> statement-breakpoint
CREATE INDEX "observability_events_type_created_idx" ON "observability_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_owner_id_idx" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "permissions_category_idx" ON "permissions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "platform_alerts_alert_type_idx" ON "platform_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "platform_alerts_severity_idx" ON "platform_alerts" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "platform_alerts_status_idx" ON "platform_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_alerts_created_at_idx" ON "platform_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_feature_analytics_feature_idx" ON "platform_feature_analytics" USING btree ("feature_name");--> statement-breakpoint
CREATE INDEX "platform_feature_analytics_period_idx" ON "platform_feature_analytics" USING btree ("period_type","period_start");--> statement-breakpoint
CREATE INDEX "enrichment_queue_prospect_id_idx" ON "prospect_enrichment_queue" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "enrichment_queue_status_idx" ON "prospect_enrichment_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prospect_notes_prospect_id_idx" ON "prospect_notes" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "prospect_notes_user_id_idx" ON "prospect_notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prospect_searches_org_id_idx" ON "prospect_searches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "prospect_searches_user_id_idx" ON "prospect_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prospect_searches_provider_idx" ON "prospect_searches" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "prospect_searches_created_at_idx" ON "prospect_searches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prospects_user_id_idx" ON "prospects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prospects_email_idx" ON "prospects" USING btree ("primary_email");--> statement-breakpoint
CREATE INDEX "prospects_apollo_id_idx" ON "prospects" USING btree ("apollo_id");--> statement-breakpoint
CREATE INDEX "prospects_created_at_idx" ON "prospects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "prospects_source_idx" ON "prospects" USING btree ("source");--> statement-breakpoint
CREATE INDEX "prospects_company_id_idx" ON "prospects" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rule_execution_logs_match_idx" ON "rule_execution_logs" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "rule_execution_logs_rule_idx" ON "rule_execution_logs" USING btree ("rule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduler_heartbeat_type_idx" ON "scheduler_heartbeat" USING btree ("scheduler_type");--> statement-breakpoint
CREATE INDEX "sdr_workflow_progress_org_id_idx" ON "sdr_workflow_progress" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sdr_workflow_progress_user_id_idx" ON "sdr_workflow_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sdr_workflow_progress_stage_idx" ON "sdr_workflow_progress" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "sending_domains_org_domain_idx" ON "sending_domains" USING btree ("organization_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_prospects_unique_idx" ON "sequence_prospects" USING btree ("sequence_id","prospect_id");--> statement-breakpoint
CREATE INDEX "sequence_prospects_sequence_id_status_idx" ON "sequence_prospects" USING btree ("sequence_id","status");--> statement-breakpoint
CREATE INDEX "sequences_user_id_status_created_at_idx" ON "sequences" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "sequences_user_id_created_at_idx" ON "sequences" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "super_admin_audit_logs_admin_id_idx" ON "super_admin_audit_logs" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "super_admin_audit_logs_action_idx" ON "super_admin_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "super_admin_audit_logs_created_at_idx" ON "super_admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "super_admin_sessions_admin_id_idx" ON "super_admin_sessions" USING btree ("super_admin_id");--> statement-breakpoint
CREATE INDEX "super_admin_sessions_token_idx" ON "super_admin_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "super_admins_email_idx" ON "super_admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "team_members_team_id_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teams_workspace_id_idx" ON "teams" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "teams_parent_team_id_idx" ON "teams" USING btree ("parent_team_id");--> statement-breakpoint
CREATE INDEX "tenant_activity_timeline_org_id_idx" ON "tenant_activity_timeline" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_activity_timeline_event_type_idx" ON "tenant_activity_timeline" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "tenant_activity_timeline_created_at_idx" ON "tenant_activity_timeline" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tenant_communications_status_idx" ON "tenant_communications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_communications_type_idx" ON "tenant_communications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "tenant_communications_created_at_idx" ON "tenant_communications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tenant_configuration_org_id_idx" ON "tenant_configuration" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_controls_org_id_idx" ON "tenant_controls" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_controls_automation_status_idx" ON "tenant_controls" USING btree ("tenant_automation_status");--> statement-breakpoint
CREATE INDEX "tenant_feature_flags_org_id_idx" ON "tenant_feature_flags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_onboarding_org_id_idx" ON "tenant_onboarding" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_onboarding_health_score_idx" ON "tenant_onboarding" USING btree ("health_score");--> statement-breakpoint
CREATE INDEX "tenant_onboarding_progress_idx" ON "tenant_onboarding" USING btree ("onboarding_progress");--> statement-breakpoint
CREATE INDEX "tenant_settings_org_id_idx" ON "tenant_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_settings_plan_idx" ON "tenant_settings" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "tenant_settings_status_idx" ON "tenant_settings" USING btree ("tenant_status");--> statement-breakpoint
CREATE INDEX "tenant_workflow_progress_org_id_idx" ON "tenant_workflow_progress" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tenant_workflow_progress_stage_idx" ON "tenant_workflow_progress" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "throttle_windows_org_type_window_idx" ON "throttle_windows" USING btree ("organization_id","counter_type","window_start");--> statement-breakpoint
CREATE INDEX "throttle_windows_user_type_window_idx" ON "throttle_windows" USING btree ("user_id","counter_type","window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_org_type_period_idx" ON "usage_counters" USING btree ("organization_id","counter_type","period_type","period_start");--> statement-breakpoint
CREATE INDEX "usage_counters_user_type_period_idx" ON "usage_counters" USING btree ("user_id","counter_type","period_type","period_start");--> statement-breakpoint
CREATE INDEX "user_activity_logs_user_id_idx" ON "user_activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_activity_logs_action_idx" ON "user_activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "user_activity_logs_created_at_idx" ON "user_activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_badges_user_id_idx" ON "user_badges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_badges_org_id_idx" ON "user_badges" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_badges_type_idx" ON "user_badges" USING btree ("badge_type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_controls_user_id_idx" ON "user_controls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_controls_org_id_idx" ON "user_controls" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_controls_manager_id_idx" ON "user_controls" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "user_credits_user_id_idx" ON "user_credits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_credits_tenant_id_idx" ON "user_credits" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_credits_user_period_idx" ON "user_credits" USING btree ("user_id","period_start");--> statement-breakpoint
CREATE INDEX "user_permission_overrides_user_id_idx" ON "user_permission_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_permission_overrides_permission_id_idx" ON "user_permission_overrides" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_role_assignments_user_id_idx" ON "user_role_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_assignments_role_id_idx" ON "user_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_created_by_idx" ON "users" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "users_manager_email_unique_idx" ON "users" USING btree ("created_by","email");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "webhook_delivery_logs_webhook_id_idx" ON "webhook_delivery_logs" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhooks_organization_id_idx" ON "webhooks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_workspace_user_idx" ON "workspace_memberships" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspaces_organization_id_idx" ON "workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspaces_slug_idx" ON "workspaces" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workspaces_parent_id_idx" ON "workspaces" USING btree ("parent_id");