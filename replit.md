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
- **Key Features**: Detailed email sequence builder with real-time reply detection, AI-powered email generation with customizable tones, multi-mailbox email sending with warmup and round-robin capabilities.
- **Performance**: Animated skeleton loading, URL parameter synchronization for state management, and lazy loading for large datasets.

### Technical Implementations
- **Frontend**: React, TypeScript, Vite.
- **Backend**: Express.js with TypeScript.
- **Database**: PostgreSQL with Drizzle ORM.
- **AI Integration**: Multi-provider AI system with automatic fallback support:
  - **Providers**: OpenAI (primary), OpenRouter (flexible multi-model gateway), Anthropic (fallback)
  - **Configuration**: Via `AI_PROVIDER` environment variable (openai/openrouter/anthropic)
  - **Models**: GPT-4o (default), Claude Sonnet 4, or any OpenRouter-compatible model
  - **Fallback Chain**: Automatic failover on quota exhaustion or errors
  - **Use Cases**: NLP query parsing, email generation, LinkedIn analysis, sentiment analysis
  - **See**: [AI_PROVIDER.md](./AI_PROVIDER.md) for comprehensive configuration guide
- **Job Queue**: BullMQ (requires Redis/Upstash) for background tasks like enrichment, CSV imports, and email sending.
- **Authentication & Security**: Email/password authentication (bcrypt 12 rounds), JWT tokens (7-day expiry), HTTP-only cookies with SameSite/Secure flags, password reset flow with 30-minute token expiry, 30-minute idle timeout, role-based access control (Admin/User), comprehensive audit logging, and rate limiting.
- **Multi-Tenancy**: Full multi-user support with RequestContext-based data isolation, user invitation system via Resend, and admin impersonation.
- **Natural Language Processing**: Converts user queries into structured Apollo.io filters with AI and intelligent fallback mechanisms, including keyword-based extraction for job titles, locations, companies, and industries.
- **Email Revelation**: Apollo searches automatically include `reveal_personal_emails=true` to acquire personal emails directly.
- **Email Sequence Management**: Multi-step sequences, prospect enrollment, tracking, AI personalization, and multi-mailbox sending with round-robin rotation and encryption. Includes AI follow-up generation based on actual replies and content library validation with auto-retry.
- **Sequence Creation Methods**: 3 AI-powered ways to create sequences:
  - **Template Library**: 4 pre-built templates (Cold Outreach, Product Launch, Follow-up, Re-engagement) with complete email flows
  - **Generate with AI**: Single-email generation from natural language prompts using GPT-4o/Claude Sonnet 4
  - **Auto Create with AI**: Full 4-step sequence generation (initial, follow-up, value-add, break-up) from campaign descriptions with automatic AI fallback support
- **AI Personalization Wizard**: Batch email personalization supporting up to 25 prospects at once with intelligent analysis, insights, and personalized email generation for each prospect.
- **Bulk Operations**: Efficient enrichment using Apollo's bulk match API.
- **Data Security**: Secure credential encryption (AES-256-CBC) for mailboxes.
- **API Key Management**: Automatic fallback for AI provider API keys.
- **CSV Import Resilience**: 50MB file limit, detailed logging, and error tracking.
- **Reply Detection**: IMAP-based polling for automatic reply detection, matching, and storage with intelligent content cleanup.
- **Email Formatting**: AI-generated emails use HTML `<p>` tags for proper spacing.
- **Email Threading**: Follow-up emails properly thread using RFC 5322 Message-ID headers and "Re:" subject line prefixing for manual steps.
- **Automation Layer**: Background automation for autonomous prospect imports and sequence enrollment with manual prospect selection capability.
  - **Manual Prospect Selection**: Users can select specific existing prospects to enroll in automation sequences instead of just specifying a count
  - **ProspectSelector UI**: Interactive component with checkbox selection, search, select all/clear functionality
  - **Secure Implementation**: Uses Drizzle `and()` to combine userId and prospect ID filters, preventing cross-tenant data access
  - **Data Flow**: Selected IDs stored in apolloFilters JSONB field, passed through scheduler/queue/worker to automation service
  - **Email Integration**: SequenceStepService schedules first email for each enrolled prospect, integrates with EmailQueueService
  - **Error Handling**: Individual enrollment failures logged to `errorLog` JSONB field, graceful degradation ensures partial success
  - **Multi-Tenant Security**: Storage layer enforces userId from RequestContext across personalizationResults and email_send_log tables, preventing cross-tenant data injection
- **Automation Scheduler**: Production-ready BullMQ-based scheduler with complete Redis resilience:
  - **Queue-Based Scheduling**: BullMQ queue when Redis/Upstash available for persistent, reliable automation scheduling
  - **Graceful Fallback**: Automatic fallback to in-memory timers when Redis unavailable (scheduled runs lost on restart)
  - **Retry Logic**: 3 attempts with exponential backoff (5s, 10s, 15s) across all execution paths
  - **Cancellation Safety**: All paths (queue, direct, scheduled, retry) respect user cancellations and preserve cancelled status
  - **Multi-Tenant Isolation**: All queries/updates scoped by userId to prevent cross-tenant access
  - **Error Management**: Errors cleared on success, no stale error states, comprehensive failure tracking
  - **Non-Blocking API**: Async fallback execution ensures responsive API even during Redis outages
  - **Idempotency**: Job IDs prevent duplicate processing
  - **Status Transitions**: Validates state changes to prevent race conditions
  - **See**: [SCHEDULER_IMPLEMENTATION.md](./SCHEDULER_IMPLEMENTATION.md) for complete documentation
- **Reply Classification**: Automated sentiment analysis (positive, negative, unsubscribe, neutral) with automatic unsubscribe processing.
- **ICP Templates**: Pre-configured Ideal Customer Profile templates.
- **Lead Scoring**: Automated 0-100 scoring based on seniority, data completeness, etc.
- **Duplicate Detection**: Intelligent checks by email, Apollo ID, LinkedIn URL, and name+company.
- **API Rate Limiting**: Enforced on Apollo API calls.
- **Advanced Search**: Revenue range, technology stack, and funding stage filtering.
- **Smart Search Fallback**: Multi-strategy Apollo search (strict filter -> keyword -> seniority-only) to maximize results.
- **Cascade Deletes**: Ensures clean removal of sequences and related data.
- **Session Security**: 30-minute idle timeout, session refresh, and automatic invalidation on password changes.
- **Audit Logging**: Comprehensive JSONB-based audit trail for authentication, user management, and impersonation events.
- **Rate Limiting**: Applied to sensitive endpoints like login and invitations.
- **User Invitation System**: Admin-only invitation creation with email delivery, secure token-based registration, and expiration handling.
- **Admin Impersonation**: Secure user impersonation for troubleshooting with full audit trails.
- **Error Monitoring (Sentry)**: Comprehensive error tracking and monitoring for both frontend and backend:
  - **Backend**: Automatic error capture with Express integration, environment-aware logging, stack traces, uncaught exception handling, and unhandled rejection tracking
  - **Frontend**: React Error Boundary component catches rendering errors, session replay for debugging, browser tracing integration
  - **Configuration**: Conditional initialization - requires `SENTRY_DSN` (backend) and `VITE_SENTRY_DSN` (frontend) environment variables
  - **Release Tracking**: Supports version tracking via `RELEASE` environment variable (e.g., `sdr-platform@1.0.0`)
  - **Features**: Error aggregation, performance monitoring, user-friendly error pages with reset/reload options
  - **Development Mode**: Enhanced error logging with full stack traces and event details for debugging
  - **See**: [PRODUCTION_MONITORING_SETUP.md](./PRODUCTION_MONITORING_SETUP.md) for complete monitoring setup guide
- **Uptime Monitoring**: `/healthz` endpoint for external monitoring services (UptimeRobot, Pingdom, etc.):
  - **Response Format**: JSON with status, timestamp, uptime, and environment
  - **Status Codes**: 200 (healthy), 503 (unhealthy)
  - **Monitoring Interval**: Recommended 5 minutes (production) or 1 minute (critical systems)
- **Load Testing**: K6 script for performance validation with 10-20 concurrent users:
  - **Test Coverage**: Health checks, authentication, AI search, prospect management
  - **Performance Thresholds**: P95 < 2s for general requests, P95 < 500ms for health checks
  - **Failure Rate**: < 5% target
  - **Script Location**: `k6-load-test.js`
- **Email Deliverability**: DKIM/SPF/DMARC configuration for optimal email delivery:
  - **DKIM**: Domain-based authentication (configured via email provider)
  - **SPF**: Sender Policy Framework for authorized mail servers
  - **DMARC**: Policy enforcement for failed authentication
  - **Testing**: mail-tester.com for spam score validation
  - **Target Score**: 9/10 or higher

## External Dependencies
- **Apollo.io**: Prospect search, data enrichment, and bulk matching API.
- **OpenAI**: Primary AI provider for NLP, email generation, and LinkedIn personalization.
- **OpenRouter**: Multi-model AI gateway providing access to OpenAI, Anthropic, Google, Meta, and other models through a unified API. Supports automatic failover and cost optimization.
- **Anthropic**: Alternative AI provider for NLP and email generation (Claude Sonnet 4).
- **Lusha.io**: Email enrichment service.
- **PostgreSQL (Neon)**: Cloud-hosted relational database.
- **Redis/Upstash**: Required for BullMQ job queue.
- **Resend**: Email service for sending HTML invitation emails.
- **Sentry**: Error monitoring and performance tracking service (optional, requires DSN configuration).

## AI Provider Configuration
The platform supports multiple AI providers with automatic failover. Configure via environment variables:
- `AI_PROVIDER`: Primary provider selection (openai/openrouter/anthropic)
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_API_KEY_BACKUP`: Backup OpenAI key for quota failover
- `OPEN_ROUTER`: OpenRouter API key (stored in Replit Secrets)
- `OPENROUTER_MODEL`: Model selection for OpenRouter (defaults to openai/gpt-4o)
- `ANTHROPIC_API_KEY`: Anthropic API key

**Fallback Chain**: Primary → Backup → OpenRouter → Anthropic → Keyword extraction

For detailed configuration, cost management, and troubleshooting, see [AI_PROVIDER.md](./AI_PROVIDER.md).