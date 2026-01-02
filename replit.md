# AI-Powered SDR Platform

## Overview
An AI-powered Sales Development Representative (SDR) platform designed to automate prospect discovery, enrichment, and multi-channel outreach. It translates natural language queries into structured searches, enriches prospect data, and automates personalized email sequences. The platform aims to boost sales efficiency by offering a comprehensive solution for lead generation and engagement, from initial search to automated email follow-ups and reply tracking, including a complete multi-user, multi-tenant system with robust security and audit trails.

## User Preferences
- I prefer clear and concise explanations.
- I value iterative development and prefer to be involved in major architectural decisions.
- Please ask for confirmation before making significant changes to core functionalities or database schemas.
- Ensure all new features are backward-compatible and do not break existing workflows.
- I prefer to maintain a high level of code quality, with a focus on maintainability and scalability.

## System Architecture
The platform is built on a modern web stack, featuring a multi-tenant architecture designed for scalability, security, and user experience.

### UI/UX Decisions
- **Design System**: Clean, modern design utilizing Tailwind CSS and shadcn/ui.
- **Workflow Focus**: User-friendly workflows for AI search, prospect management, and campaign creation.
- **Performance**: Animated skeleton loading, URL parameter synchronization, and lazy loading.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **AI Integration**: Multi-provider AI system with automatic fallback (OpenAI, OpenRouter, Anthropic) for NLP, email generation, and sentiment analysis.
- **Job Queue**: BullMQ (requires Redis/Upstash) for background tasks like automation scheduling.
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions, bcrypt, CSRF protection, role-based access (User, Manager, Super Admin), and comprehensive audit logging. Role-based access control (RBAC) rules are enforced via middleware to prevent unauthorized SDR execution by Managers and Super Admins.
- **Multi-Tenancy**: RequestContext-based data isolation, user invitation system, organization/workspace management, and admin impersonation.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, multi-mailbox sending with round-robin rotation.
- **Data Security**: Secure credential encryption (AES-256-CBC) for mailboxes.
- **Reply Detection & Classification**: IMAP-based polling for automatic reply detection, OOO, bounce, and unsubscribe handling, with AI-powered sentiment and intent analysis. Follow-up emails are properly threaded.
- **Unified Inbox**: Centralized reply management with AI summaries, filtering, and quick actions.
- **Template Management**: Message template library with performance tracking, variable replacement, and AI-powered generation.
- **AI Usage Tracking**: Comprehensive token usage tracking with cost calculation across multiple AI providers.
- **Campaign Execution**: Automated sequence execution with AI personalization, daily limits, and progress tracking.
- **Automation Layer**: Background automation for autonomous prospect imports and sequence enrollment.
- **Email Tracking & Analytics**: Comprehensive email engagement tracking (open, click, reply rates) with HMAC-signed URL wrapping.
- **Duplicate Detection**: Intelligent checks by email, Apollo ID, LinkedIn URL, and name+company.
- **Advanced Search**: Revenue range, technology stack, and funding stage filtering with multi-strategy Apollo search fallback.
- **Admin Infrastructure**: Comprehensive admin settings including email infrastructure, API access, email deliverability, AI configuration, and multi-channel notifications.
- **Super Admin System**: Comprehensive platform-level tenant management including provisioning, status, plan upgrades, configuration, manager account creation, quota enforcement, and alert automation. Includes time-series analytics, broadcast messaging, impersonation, and platform health monitoring. Performance optimizations for Super Admin dashboards and listings include N+1 query elimination, in-memory caching, keyset pagination, approximate counts, and filter optimization.
- **Tenant Activation Workflow**: Step-by-step workflow enforcement for tenant onboarding. New tenants start with `automationStatus='paused'` (INACTIVE_AUTOMATION). Workflow stages: (1) Created - tenant/manager provisioned, (2) Manager Active - first manager login recorded, (3) Limits Configured - Super Admin reviews and confirms limits, (4) Automation Enabled - explicit enablement after prerequisites met. Backend validates all prerequisites before allowing automation; frontend gates Enable button on `canEnableAutomation` flag with missing steps surfaced in UI.
- **Manager Dashboard**: Implemented at `/manager/dashboard` for team management, campaign oversight, performance analytics, and resource allocation tracking, with `requireManager` middleware for access control. Manager-level safeguards include hard limits on active campaigns, sequences, users, and prospects, and a Manager Kill Switch to pause operations.
- **Multi-Provider Waterfall Search System**: Intelligent prospect search system that cascades through multiple providers (Perplexity AI, Apollo.io, Lusha, OpenRouter) to maximize result coverage while optimizing costs, featuring accumulating mode, smart deduplication, cost optimization, error resilience, and usage tracking.
- **Performance Fixes**: Prospect enrollment N+1 query elimination and asynchronous CSV upload processing.
- **RBAC Hardening**: Implemented kill switch for tenant automation, rate limiting via throttle middleware (enrollments, prospects, emails, AI calls), batch limits for prospect enrollment, sequence activation guards, and exponential backoff for email retries. Pagination guards are enforced on data exports and prospect listings. Universal Kill Switch is enforced across background services (automation-worker, reply-detection, intelligent-personalization, email-queue). Unit-based throttling prevents quota gaming.
- **User/SDR Safeguards**: User-level quotas (maxEmailsPerDay, maxConcurrentEnrollments, maxRetriesPerCampaign) with kill switch. Cascade pause checks (user → manager → tenant). Daily email limits with automatic reset. Enrollment concurrency caps (DB-backed). DB-level deduplication via unique constraint on sequenceProspects. Middleware guards on HTTP endpoints with observability event emission. Background worker enforcement with deferral tracking (separate from retry attempts) and max deferral limits.
- **SDR Workflow System (Phase 1 Complete)**: 9-stage step enforcement system (readiness → upload → enrichment → sequence → enrollment → activation → sending → replies → analytics) with sequential advancement validation. Schema includes `sdrWorkflowProgress` table with stage tracking and timestamps. Core service (`sdr-workflow.service.ts`) provides `assertStage`, `advanceStage`, `block`, `forceAdvance`, `resetWorkflow`, `tryAutoAdvance` methods. API routes enforce fail-closed security: all SDR routes use `validateWorkflowAccess` helper checking role (blocks managers/super_admins) and tenant automation status; admin routes (reset, force-advance) look up authoritative organizationId from workflow record. All workflow transitions emit audit events with organizationId and resourceId.

### P1 Roadmap (Future Work)
- **Cost-Based Throttling**: Implement AI token usage tracking, provider cost weighting, monthly spend limits per tenant, and cost alerts.
- **Auto-Pause Rules**: Introduce automatic triggers for pausing tenants based on spend spikes, queue backlogs, or error storms.
- **Super Admin Visibility Dashboard**: Develop real-time operational visibility for queue depth, AI usage trends, throttle violations, and tenant health scores.
- **Manager-Level Quotas**: Implement explicit quota allocation per manager within tenant limits, allowing managers to subdivide quotas to SDRs.
- **Manager Spend Visibility**: Provide managers with dashboards showing AI tokens, email volume, and estimated costs per campaign/sequence.
- **Campaign Health Scoring**: Introduce soft health signals (bounce rate, reply rate, AI error rate) and visual indicators for campaign performance.
- **Auto-Throttle at Manager Level**: Implement soft throttles for managers before tenant pause triggers.
- **Manager Abuse Alerts**: Develop alerts for sudden volume spikes, queue backlogs, and anomaly detection for usage patterns per manager.
- **Manager Change Audit Trail**: Implement manager-level activity logs for actions like campaign creation, limit changes, and bulk uploads.
- **[NEXT PATCH] Atomic Send Limits**: Combine check+increment in single transaction for email send limits to prevent race conditions on concurrent sends.
- **Service-Layer Telemetry**: Add observability events to service-layer rejections (recordEmailSent failures, auto-pause triggers) for complete visibility.
- **Manager Pause via UserControls**: Extend cascade pause logic to recognize manager pauses in userControls table in addition to managerQuotas.

## External Dependencies
- **Apollo.io**: Prospect search, data enrichment, and bulk matching API.
- **OpenAI**: Primary AI provider.
- **OpenRouter**: Multi-model AI gateway.
- **Anthropic**: Alternative AI provider.
- **Lusha.io**: Email enrichment service.
- **Perplexity AI**: AI-powered B2B research.
- **PostgreSQL (Neon)**: Cloud-hosted relational database.
- **Redis/Upstash**: Required for BullMQ job queue.
- **Resend**: Email service for sending HTML invitation emails.
- **Sentry**: Error monitoring and performance tracking service (optional).