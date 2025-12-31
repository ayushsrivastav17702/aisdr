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
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions, bcrypt, CSRF protection, role-based access, and comprehensive audit logging.
- **RBAC Middleware Rules** (Source of Truth - `server/middleware/auth.middleware.ts`):
  - **User (SDR)**: Full SDR execution - campaigns, sequences, emails, AI writing, prospect import, automation, mailboxes
  - **Manager** (`admin` role): Team oversight only - view campaigns (read-only), team analytics, user management. BLOCKED from all SDR execution via `forbidManager` middleware
  - **Super Admin** (`super_admin` role): Platform governance only - tenant provisioning, config, manager creation, audit logs, impersonation. BLOCKED from all SDR execution via `forbidManager` middleware
  - **Key Middleware**: `forbidManager` blocks managers AND super_admins from SDR routes; `requireSuperAdmin` enforces super-admin-only access; `requireManager` enforces manager-only access
- **Multi-Tenancy**: RequestContext-based data isolation, user invitation system, and admin impersonation. Includes organization and workspace management with hierarchical structures and resource limits.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, multi-mailbox sending with round-robin rotation.
- **Data Security**: Secure credential encryption (AES-256-CBC) for mailboxes.
- **Reply Detection**: IMAP-based polling for automatic reply detection, OOO detection, bounce handling, and unsubscribe processing.
- **Reply Classification**: AI-powered sentiment and intent analysis for incoming replies with automatic sequence adjustments.
- **Email Threading**: Follow-up emails properly thread using RFC 5322 Message-ID headers.
- **Unified Inbox**: Centralized reply management with AI summaries, filtering by sentiment/intent, and quick actions.
- **Template Management**: Message template library with performance tracking, variable replacement, and AI-powered template generation.
- **AI Usage Tracking**: Comprehensive token usage tracking with cost calculation across multiple AI providers.
- **Campaign Execution**: Automated sequence execution with AI personalization, daily limits, and progress tracking.
- **Automation Layer**: Background automation for autonomous prospect imports and sequence enrollment.
- **Email Tracking & Analytics**: Comprehensive email engagement tracking (open, click, reply rates) with HMAC-signed URL wrapping.
- **Duplicate Detection**: Intelligent checks by email, Apollo ID, LinkedIn URL, and name+company.
- **Advanced Search**: Revenue range, technology stack, and funding stage filtering with multi-strategy Apollo search fallback.
- **Admin Infrastructure**: Comprehensive admin settings including email infrastructure, API access (keys, webhooks), email deliverability settings, AI configuration, and multi-channel notifications.
- **Super Admin System**: Comprehensive super admin functionality for platform-level tenant management:
  - **Tenant Management**: Full tenant lifecycle (provisioning, status management, plan upgrades, configuration controls, manager account creation)
  - **Quota Enforcement**: Middleware-based resource limits with pre-flight checks (users, prospects, sequences, mailboxes)
  - **Alert Automation**: Background monitoring for tenant health, quota usage (80% threshold), mailbox health, inactive tenants, server resources
  - **Time-Series Analytics**: Daily metrics tracking for tenant/user growth with period-based aggregation (7d/30d/90d)
  - **Broadcast Messaging**: Targeted tenant communications with Resend email delivery
  - **Impersonation**: Manager impersonation with full audit trail
  - **Platform Health**: Server metrics, storage monitoring, email infrastructure dashboard
  - **Bootstrap Script**: `server/scripts/seed-super-admin.ts` for initial super admin account creation
- **User Engagement Features (Planned)**: Leaderboard & Gamification (points, badges), Best Practices Library (templates, guides, videos), and AE Handoff Workflow (qualification frameworks, scoring, status workflow).
- **Manager Dashboard**: Implemented at `/manager/dashboard` with team management (add, update, deactivate users, password reset), campaign oversight (approve, pause, stats), performance analytics with time period selection (7d/30d/90d), and resource allocation tracking. Uses `requireManager` middleware for role-based access.
- **Multi-Provider Waterfall Search System**: Intelligent prospect search system that cascades through multiple providers (Perplexity AI, Apollo.io, Lusha, OpenRouter) to maximize result coverage while optimizing costs. Features accumulating mode, smart deduplication, cost optimization, error resilience, and usage tracking.
- **Super Admin Performance Optimizations** (December 2025):
  - **N+1 Query Elimination**: Tenant listing reduced from 42 queries (20 tenants × 2 count queries + joins) to 1 query using correlated subqueries
  - **Dashboard Stats**: Combined 7 separate queries into 1 with 30-second in-memory cache
  - **Keyset Pagination**: Audit logs and tenant listing support cursor-based pagination for O(1) performance at scale
  - **Approximate Counts**: Unfiltered queries use PostgreSQL `reltuples` statistics for O(1) total counts
  - **Filter Optimization**: Status/plan filters moved from post-query JavaScript to SQL WHERE clauses
  - **Export Safety**: All export endpoints capped at reasonable limits (50k records for audit logs)
- **User Role P0 Performance Fixes** (December 2025):
  - **Prospect Enrollment N+1 Elimination**: `enrollProspects()` reduced from 5000+ queries (1000 prospects) to 5 queries total using batch operations with tenant isolation via INNER JOIN
  - **CSV Upload Async Processing**: Returns HTTP 202 immediately, processes via setImmediate() with 1000-prospect batch inserts, supports both Redis (BullMQ) and non-Redis environments
- **RBAC Hardening Phase** (December 2025):
  - **Kill Switch**: Super Admin can pause/resume tenant automation via `hardeningService.pauseTenantAutomation()`. Email queue respects kill switch and skips emails for paused orgs.
  - **Throttle Middleware**: Rate limiting via `throttle.middleware.ts` with default limits: enrollments 100/hr, prospects 500/hr, emails 10/min, AI calls 20/min
  - **Batch Limits**: Max 1000 prospects per enrollment request enforced in `sequences-routes.ts`
  - **Sequence Activation Guards**: PUT/PATCH `/sequences/:id` checks automation status before allowing activation
  - **Exponential Backoff**: Email retry mechanism uses exponential delay (2^attempts minutes, capped at 30min)
  - **Pagination Guards**: `getProspects()` caps at 50 per page, data exports cap at 50k records
  - **DB Tables**: `tenant_controls`, `throttle_windows`, `manager_quotas`, `usage_counters`, `idempotency_keys`, `background_job_audit`
  - **Key Files**: `server/services/hardening.service.ts`, `server/middleware/throttle.middleware.ts`

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