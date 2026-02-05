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
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions with role/tenantId payload, bcrypt, CSRF protection, strict role-based access control (User, Manager, Super Admin), and comprehensive audit logging.
- **Role-Based Routing**: User role is the single source of truth for all routing decisions. Frontend ProtectedRoute enforces `requireRole` and `allowedRoles` props. Backend normalizes legacy 'admin' role to 'manager'. Roles: 'user' (SDR) → /, 'manager' → /manager/dashboard, 'super_admin' → /super-admin.
- **Multi-Tenancy**: RequestContext-based data isolation, user invitation system, organization/workspace management, and admin impersonation.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, multi-mailbox sending with round-robin rotation.
- **Token Resolution System**: Comprehensive merge field system supporting standard tokens, fallback handling, inline fallback syntax, and async AI-generated personalization.
- **Data Security**: Secure credential encryption (AES-256-CBC) for mailboxes.
- **Reply Detection & Classification**: IMAP-based polling for automatic reply detection, OOO, bounce, and unsubscribe handling, with AI-powered sentiment and intent analysis.
- **Unified Inbox**: Centralized reply management with AI summaries, filtering, and quick actions.
- **Template Management**: Message template library with performance tracking, variable replacement, and AI-powered generation.
- **AI Usage Tracking**: Comprehensive token usage tracking with cost calculation across multiple AI providers.
- **Campaign Execution**: Automated sequence execution with AI personalization, daily limits, and progress tracking.
- **Automation Layer**: Background automation for autonomous prospect imports and sequence enrollment.
- **Email Tracking & Analytics**: Comprehensive email engagement tracking (open, click, reply rates) with HMAC-signed URL wrapping.
- **Duplicate Detection**: Intelligent checks by email, Apollo ID, LinkedIn URL, and name+company.
- **Advanced Search**: Revenue range, technology stack, and funding stage filtering with multi-strategy Apollo search fallback.
- **Admin Infrastructure**: Comprehensive admin settings including email infrastructure, API access, email deliverability, AI configuration, and multi-channel notifications.
- **Super Admin System**: Comprehensive platform-level tenant management including provisioning, status, plan upgrades, configuration, manager account creation, quota enforcement, and alert automation. Includes time-series analytics, broadcast messaging, impersonation, and platform health monitoring.
- **Tenant Activation Workflow**: Step-by-step workflow enforcement for tenant onboarding with validation of prerequisites for automation.
- **Manager Dashboard**: Implemented at `/manager/dashboard` for team management, campaign oversight, performance analytics, and resource allocation tracking, with `requireManager` middleware for access control and manager-level safeguards.
- **Multi-Provider Waterfall Search System**: Intelligent prospect search system that cascades through multiple providers to maximize result coverage while optimizing costs, featuring accumulating mode, smart deduplication, cost optimization, error resilience, and usage tracking.
- **RBAC Hardening**: Implemented kill switch for tenant automation, rate limiting, batch limits for prospect enrollment, sequence activation guards, and exponential backoff for email retries. Pagination guards are enforced on data exports and prospect listings. Universal Kill Switch is enforced across background services.
- **User/SDR Safeguards**: User-level quotas with kill switch, cascade pause checks, daily email limits with automatic reset, enrollment concurrency caps, DB-level deduplication, middleware guards, and background worker enforcement.
- **SDR Workflow System**: 9-stage step enforcement system for SDR workflow (readiness → upload → enrichment → sequence → enrollment → activation → sending → replies → analytics) with sequential advancement validation and API routes enforcing fail-closed security.
- **Production Hardening**: Cross-tenant workspace isolation, quota middleware returning 500 on errors, HMAC signature verification on email webhooks, auto-pause mailbox on high bounce rates, demo mode, data reset tools, and observability service.
- **Email Queue Integrity**: DB CHECK constraint (`chk_sent_requires_message_id`) enforces SMTP messageId for status='sent' at database level - prevents phantom delivery claims. Service-layer guard provides defense-in-depth. Email queue health monitoring API at `/api/admin/email-queue/health` and stuck email detection at `/api/admin/email-queue/stuck`. Background monitoring logs stuck emails (>60 min pending) every 5 minutes.
- **Guaranteed Delivery Pipeline**: Full email retry system per spec with states (pending → sending → sent, retrying → failed). Error classification (SMTP 4xx/timeout/rate limit = retryable; invalid email/blocked domain/AI blocked = non-retryable). Backoff timing: retry #1 = +2min, #2 = +5min, #3 = +15min. Watchdog runs every 5 minutes with 4 queries: stuck sending (>5 min), pending too long (>10 min), retry overdue, phantom sent. Auto-alerts when: >5 failed in 10min, >20 retrying, >10 pending >10min. APIs: `/api/admin/email-queue/dead-letter`, `/api/admin/email-queue/retry-stuck`, `/api/admin/email-queue/metrics`. Metrics tracked: queue_depth, avg_send_time, retry_rate, failure_rate, phantom_sent_count.
- **Route Security Audit (2026-02-05)**: All ICP template routes (`/api/icp-templates/*`) now require authentication. Test endpoint `/api/test/email-queue-simulation` only available in test/demo mode (NODE_ENV=test OR DEMO_MODE=true).
- **Email Scheduler Fault Tolerance**: Comprehensive scheduler monitoring with heartbeat tracking (60-second intervals), health status (healthy/delayed/down), failure rate alerting (>5% in 15 minutes triggers critical alert), retry queue with max 3 attempts and exponential backoff, idempotency keys to prevent duplicate sends, and job state machine (pending → generating → approved → sending → sent → failed). UI status indicator shows real-time scheduler health with tooltip details.
- **Bulk Approval Preview System**: Sequence activation preview showing 10 sample emails with confidence indicators (High/Medium/Low), risk assessment (Low/Medium/High Risk), hallucination detection, diff highlighting for dynamic fields, and bulk approval options. Features "Approve All" for safe sequences, "Approve Low-Risk Only" for filtered approval, revert activation capability, and prominent warning that emails will be sent to real prospects.
- **SDR Dashboard**: Comprehensive dashboard at `/sdr-dashboard` with email activity stats, quota visibility, campaign health, AI personalization usage, 9-stage workflow progress tracker, personal analytics, self-service sending preferences, and an activity feed.
- **AI Decision Engine**: Comprehensive email template selection system with 30+ proven templates across categories (first touch, trigger-based, founder-led, enterprise, follow-up, objection, re-engagement). Features hard elimination rules, single-intent matching per stage, pattern break selection, and guardrail validation (word count, multiple CTAs, calendar links in first touch, pitch detection). Templates include assumption-based diagnostic, negative persona disqualification, trigger-based (hiring/funding/expansion), and Gong-tested follow-up patterns. Frontend components include AIRecommendationPanel (template selection with reasoning), PreSendValidation (guardrail warnings integrated in PersonalizationWizard review step), and AIReplySuggestionPanel (inbox objection handling with auto-fetch for objection/question/not_now intents).
- **Content Library Organization Scoping**: Content library items are now accessible to all users in the same organization, enabling admin-created case studies, product descriptions, and approved statistics to be shared across the team for brand-compliant emails.
- **Operational Copilot (2026-02-05)**: AI-powered diagnostic engine for operational questions. Uses evidence-only approach with strict tenant scoping. Components: state_collector.ts (gathers system metrics), evidence_builder.ts (constructs context), openrouter_client.ts (Claude Sonnet 4 via OpenRouter), copilot.controller.ts (request handling with output validation). Features: forbidden pattern detection (blocks speculation words like "AI", "model", "prompt"), role-based data access (users see own data, managers see team data), cross-tenant query prevention. API: POST `/api/copilot/query`.
- **Health Dashboard (2026-02-05)**: Real-time delivery health monitoring with delivery rates, queue status, scheduler health, and trend data. APIs: GET `/api/health/overview` (metrics summary), GET `/api/health/failed-emails` (failed email list), GET `/api/health/stuck-emails` (stuck queue items), GET `/api/health/retry-queue` (pending retries). Role-based scoping: managers see all data, users see only their own metrics.
- **Alerting System (2026-02-05)**: Threshold-based alerting for operational issues. Alert types: stuck_queue (>5 items stuck), delivery_failure (>10% failure rate), high_retry_rate (>20 in retry), scheduler_down (>5 min unhealthy). Features: 30-minute throttling per alert type, alert history tracking, active alert listing. APIs: GET `/api/alerts/active` (manager only), GET `/api/alerts/history` (manager only). Integrated with Health Dashboard for automatic anomaly detection.

## Testing Infrastructure
- **Automated Test Suite**: Comprehensive Vitest test suite with 194 tests covering authentication, data isolation, security, AI generation, email execution, and failure scenarios. Currently at 91% pass rate (177/194 passing).
- **Test Categories**: resilience, security, ai, auth, email, chaos, ux, user, manager, performance
- **Security-Gated Test Bypass**: X-Test-Bypass header for CSRF bypass is gated to test/demo environments only (NODE_ENV=test OR DEMO_MODE=true) to prevent production exploitation.
- **AI Test Simulation**: Endpoints support X-Test-Simulate-Timeout and X-Test-Timeout-Duration headers for timeout testing.
- **Validation-First Architecture**: API routes return 400/422 validation errors before 403 authorization errors to prevent information leakage.
- **Development Configuration**: DEMO_MODE=true set in development environment to enable test bypass functionality.
- **Test Files Location**: tests/ directory with subdirectories for each test category.
- **Test Utils**: tests/fixtures/test-utils.ts provides authHeader(), testUserId, and other test utilities.

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