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
- **Organization Management**: Full organization settings with branding, regional preferences, fiscal year configuration, and organization-wide preferences.
- **Workspace Management**: Hierarchical workspace structure with resource limits, workspace-specific settings, archiving/restoration, and ownership transfer capabilities.
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
- **Admin Infrastructure**: Comprehensive admin settings page (`/admin-infrastructure`) with 5 tabs:
  - **Email Infrastructure**: Sending domain management with DNS verification status tracking
  - **API Access**: API key generation with scopes (read/write/admin) and webhook configuration with event subscriptions
  - **Email Settings**: Deliverability settings (daily/hourly limits, warmup mode, tracking) and Do Not Contact list with CSV import
  - **AI Configuration**: Model selection (default/fallback), temperature control, token limits, and budget tracking
  - **Notifications**: Multi-channel preferences (email/in-app) for system notifications (daily summary, bounce alerts, reply notifications, etc.)

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

## Super Admin System (Phase 2)
Comprehensive Super Admin functionality for managing tenants at a platform level:

### Authentication
- Separate cookie-based authentication (super_admin_token cookie)
- JWT session tokens with 8-hour expiry
- Master admin role with full permissions

### Tenant Management Features
- **FR-SA3**: Detailed tenant profile views with organization info, usage stats, and health metrics
- **FR-SA4**: Configuration controls for resource limits (maxUsers, maxProspects, maxSequences, maxMailboxes) and feature flags
- **FR-SA7/FR-SA8**: Manager account creation with temporary passwords and role assignment
- **FR-SA10**: Multi-manager support with role hierarchy (primary, secondary, readonly)

### Feature Flag Keys (aligned with database schema)
Frontend and backend use these consistent camelCase keys matching Drizzle schema columns:
- aiProspecting, aiEmailGeneration, aiSentimentAnalysis
- advancedAnalytics, customReports, exportCapabilities
- whiteLabel, customBranding, customDomain
- crmIntegration, webhookAccess, apiAccess
- multiMailbox, emailSequences, bulkOperations

### Database Tables
- super_admins, super_admin_sessions, super_admin_audit_log
- tenant_feature_flags, tenant_configuration, manager_accounts

### Phase 2 Features (Dashboard Tabs)
- **FR-SA21 Audit Logs**: Tamper-proof audit trail with 5-year retention, CSV/JSON export, filtering by action/date
- **FR-SA22 Platform Health**: Real-time service status with 30-second auto-refresh, key metrics, email performance tracking
- **FR-SA23 Tenant Usage Analytics**: Usage metrics per tenant, churn risk detection, upsell candidate identification
- **FR-SA26 Alerts Panel**: System alerts with acknowledge/resolve workflow, severity-based styling
- **FR-SA28 Communications**: Broadcast messaging with compose form, draft management, send functionality
- **FR-SA29 Onboarding**: Tenant onboarding progress tracking with health scores and checklists

### Test Super Admin Account
- Email: admin@increff.com
- Password: SuperAdmin123!

## User Engagement Features (FR-U25, FR-U29, FR-U32)

### FR-U25: Leaderboard & Gamification
Comprehensive gamification system to drive SDR performance:
- **Leaderboard Rankings**: Daily, weekly, and monthly performance rankings based on points
- **Points Calculation**: Positive replies (100 pts), all replies (50 pts), emails sent (1 pt)
- **Badge System**: 10 achievement badges with thresholds (First Steps, Meeting Master, Deal Dynamo, etc.)
- **Live Refresh**: Manual refresh button to recalculate stats from email activity
- **Frontend**: `/leaderboard` page with rankings table, user badges, and available badges display
- **Routes**: `/api/leaderboard`, `/api/leaderboard/refresh`, `/api/badges`, `/api/badges/check`
- **Schema**: `user_badges`, `leaderboard_periods`, `leaderboard_entries` tables

### FR-U29: Best Practices Library
Knowledge base for SDR excellence:
- **8 Categories**: Email Templates, Subject Lines, Objection Handling, Industry Guides, Cold Outreach, Follow-up Strategies, Meeting Booking, Video Tutorials
- **Content Types**: Templates (with subject/body/variables), Guides (markdown), Articles, Videos
- **Features**: Search, category filtering, difficulty levels (beginner/intermediate/advanced)
- **Template Usage**: One-click copy to clipboard, usage tracking
- **Rating System**: 5-star ratings with feedback collection
- **Frontend**: `/best-practices` page with category cards, search, and detail modal
- **Routes**: `/api/best-practices/categories`, `/api/best-practices`, `/api/best-practices/:slug`, `/api/best-practices/:id/use`, `/api/best-practices/:id/rate`, `/api/best-practices/seed`
- **Schema**: `best_practice_categories`, `best_practices`, `best_practice_ratings` tables

### FR-U32: AE Handoff Workflow
SDR-to-AE prospect handoff with qualification tracking:
- **Qualification Frameworks**: BANT (Budget, Authority, Need, Timeline) and MEDDIC (Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion)
- **Automatic Scoring**: 0-100 quality score based on completed qualification fields
- **Status Workflow**: pending_review → accepted/rejected → converted/lost
- **AE Feedback**: Rating (1-5 stars) and written feedback on handoff quality
- **Activity Timeline**: Full history of status changes, notes, and feedback
- **Pipeline Metrics**: Total handoffs, conversion rate, average quality score, pipeline value
- **Frontend**: `/ae-handoff` page with stats cards, handoff list, and detail drawer
- **Routes**: `/api/handoffs`, `/api/handoffs/:id`, `/api/handoffs/:id/activity`, `/api/handoffs/stats/conversion`, `/api/team/ae-users`
- **Schema**: `ae_handoffs`, `handoff_activities` tables

### Navigation
All three features accessible from main sidebar:
- Trophy icon → Leaderboard
- BookOpen icon → Best Practices
- ArrowRightLeft icon → AE Handoff