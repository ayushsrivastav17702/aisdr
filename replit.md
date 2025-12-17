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
- **Design System**: Clean, modern design utilizing Tailwind CSS and shadcn/ui for a responsive and intuitive interface.
- **Workflow Focus**: User-friendly workflows for AI search, prospect management, and campaign creation.
- **Performance**: Animated skeleton loading, URL parameter synchronization, and lazy loading for large datasets.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **AI Integration**: Multi-provider AI system with automatic fallback (OpenAI, OpenRouter, Anthropic) for NLP query parsing, email generation, and sentiment analysis.
- **Job Queue**: BullMQ (requires Redis/Upstash) for background tasks.
- **Authentication & Security**: Enterprise-grade passwordless authentication (Google/Microsoft OAuth, Magic Link), JWT sessions, bcrypt hashing, CSRF protection, and role-based access. Includes comprehensive audit logging.
- **Multi-Tenancy**: RequestContext-based data isolation, user invitation system, and admin impersonation.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI and intelligent fallback.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, multi-mailbox sending with round-robin rotation and encryption.
- **AI Personalization Wizard**: Batch email personalization (up to 25 prospects) with intelligent analysis.
- **Bulk Operations**: Efficient enrichment using Apollo's bulk match API.
- **Data Security**: Secure credential encryption (AES-256-CBC) for mailboxes.
- **CSV Import Resilience**: 50MB file limit with detailed logging and error tracking.
- **Reply Detection**: IMAP-based polling for automatic reply detection, matching, and storage with intelligent content cleanup. Includes OOO detection, bounce handling, and unsubscribe processing.
- **Email Threading**: Follow-up emails properly thread using RFC 5322 Message-ID headers.
- **Automation Layer**: Background automation for autonomous prospect imports and sequence enrollment with manual prospect selection capability, ensuring multi-tenant security.
- **Automation Scheduler**: Production-ready BullMQ-based scheduler with Redis resilience, graceful fallback, retry logic, and cancellation safety.
- **Email Tracking & Analytics**: Comprehensive email engagement tracking (open, click, reply rates) with HMAC-signed URL wrapping for click tracking and performance metrics.
- **Merge Field Fallbacks**: Support for `{{variable|fallback}}` syntax.
- **Duplicate Detection**: Intelligent checks by email, Apollo ID, LinkedIn URL, and name+company.
- **Advanced Search**: Revenue range, technology stack, and funding stage filtering.
- **Smart Search Fallback**: Multi-strategy Apollo search to maximize results.
- **Cascade Deletes**: Ensures clean removal of sequences and related data.
- **Error Monitoring (Sentry)**: Comprehensive error tracking and monitoring for both frontend and backend (optional).
- **Uptime Monitoring**: `/healthz` endpoint for external monitoring.
- **Email Deliverability**: DKIM/SPF/DMARC configuration for optimal email delivery.

## External Dependencies
- **Apollo.io**: Prospect search, data enrichment, and bulk matching API.
- **OpenAI**: Primary AI provider.
- **OpenRouter**: Multi-model AI gateway.
- **Anthropic**: Alternative AI provider.
- **Lusha.io**: Email enrichment service.
- **PostgreSQL (Neon)**: Cloud-hosted relational database.
- **Redis/Upstash**: Required for BullMQ job queue.
- **Resend**: Email service for sending HTML invitation emails.
- **Sentry**: Error monitoring and performance tracking service (optional).