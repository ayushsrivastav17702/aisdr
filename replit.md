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
- **Super Admin System (Planned)**: Comprehensive super admin functionality for platform-level tenant management, including detailed tenant profiles, configuration controls, manager account creation, audit logs, platform health monitoring, tenant usage analytics, alerts, broadcast messaging, and onboarding tracking.
- **User Engagement Features (Planned)**: Leaderboard & Gamification (points, badges), Best Practices Library (templates, guides, videos), and AE Handoff Workflow (qualification frameworks, scoring, status workflow).
- **Manager Dashboard**: Implemented at `/manager/dashboard` with team management (add, update, deactivate users, password reset), campaign oversight (approve, pause, stats), performance analytics with time period selection (7d/30d/90d), and resource allocation tracking. Uses `requireManager` middleware for role-based access.
- **Multi-Provider Waterfall Search System**: Intelligent prospect search system that cascades through multiple providers (Perplexity AI, Apollo.io, Lusha, OpenRouter) to maximize result coverage while optimizing costs. Features accumulating mode, smart deduplication, cost optimization, error resilience, and usage tracking.

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