# AI-Powered SDR Platform

## Overview
An AI-powered Sales Development Representative (SDR) platform designed to automate prospect discovery, enrichment, and multi-channel outreach. It translates natural language queries into structured searches, enriches prospect data, and automates personalized email sequences. The platform aims to boost sales efficiency by offering a comprehensive solution for lead generation and engagement, from initial search to automated email follow-ups and reply tracking. It features a complete multi-user, multi-tenant system with robust security and audit trails, enhancing sales productivity and market reach.

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
- **Job Queue**: BullMQ (requires Redis/Upstash) for background tasks.
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions with role/tenantId payload, bcrypt, CSRF protection, strict role-based access control (User, Manager, Super Admin), and comprehensive audit logging.
- **Role-Based Routing**: Enforced on both frontend and backend for 'user', 'manager', and 'super_admin' roles.
- **Multi-Tenancy**: RequestContext-based data isolation, user invitation system, organization/workspace management, and admin impersonation.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, multi-mailbox sending with round-robin rotation.
- **Token Resolution System**: Comprehensive merge field system supporting standard tokens, fallback handling, and async AI-generated personalization.
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
- **Super Admin System**: Platform-level tenant management including provisioning, status, plan upgrades, quota enforcement, and alert automation, with time-series analytics, broadcast messaging, and health monitoring.
- **Tenant Activation Workflow**: Step-by-step workflow enforcement for tenant onboarding with validation of prerequisites for automation.
- **Manager Dashboard**: For team management, campaign oversight, performance analytics, and resource allocation tracking, with access control.
- **Multi-Provider Waterfall Search System**: Intelligent prospect search system that cascades through multiple providers for result coverage and cost optimization.
- **RBAC Hardening**: Implemented kill switches for automation, rate limiting, batch limits, sequence activation guards, and exponential backoff for email retries. Pagination guards are enforced.
- **User/SDR Safeguards**: User-level quotas with kill switch, cascade pause checks, daily email limits, enrollment concurrency caps, and DB-level deduplication.
- **SDR Workflow System**: 9-stage step enforcement system for SDR workflow (readiness → upload → enrichment → sequence → enrollment → activation → sending → replies → analytics) with sequential advancement validation.
- **Production Hardening**: Cross-tenant workspace isolation, quota middleware, HMAC signature verification, auto-pause mailbox on high bounce rates, demo mode, data reset tools, and observability service.
- **Email Queue Integrity**: DB CHECK constraint and service-layer guard enforce SMTP messageId for sent emails. Background monitoring for stuck emails.
- **Guaranteed Delivery Pipeline**: Full email retry system per spec with error classification and exponential backoff. Watchdog for queue health.
- **Email Scheduler Fault Tolerance**: Comprehensive scheduler monitoring with heartbeat tracking, health status, failure rate alerting, retry queue, idempotency keys, and job state machine.
- **Bulk Approval Preview System**: Sequence activation preview showing sample emails with confidence indicators, risk assessment, hallucination detection, diff highlighting, and bulk approval options.
- **SDR Dashboard**: Comprehensive dashboard with email activity stats, quota visibility, campaign health, AI personalization usage, workflow progress tracker, personal analytics, and activity feed.
- **AI Decision Engine**: Comprehensive email template selection system with 30+ proven templates, hard elimination rules, single-intent matching, pattern break selection, and guardrail validation. Includes AI Recommendation Panel, PreSend Validation, and AI Reply Suggestion Panel.
- **Content Library Organization Scoping**: Content library items are accessible to all users in the same organization for shared resources.
- **Operational Copilot**: AI-powered diagnostic engine for operational questions with evidence-only approach and strict tenant scoping. Features forbidden pattern detection, role-based data access, cross-tenant query prevention, rate limiting, response caching, and context injection.
- **Health Dashboard**: Real-time delivery health monitoring with delivery rates, queue status, scheduler health, and trend data. Role-based scoping for managers and users.
- **Alerting System**: Threshold-based alerting for operational issues like stuck queues, delivery failures, high retry rates, and scheduler downtime. Features throttling, history tracking, and active alert listing.

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