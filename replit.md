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
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions, bcrypt, CSRF protection, role-based access (User, Manager, Super Admin), and comprehensive audit logging.
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
- **SDR Dashboard**: Comprehensive dashboard at `/sdr-dashboard` with email activity stats, quota visibility, campaign health, AI personalization usage, 9-stage workflow progress tracker, personal analytics, self-service sending preferences, and an activity feed.

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