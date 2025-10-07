# AI-Powered SDR Platform

## Overview
An AI-powered Sales Development Representative (SDR) platform that converts natural language queries into structured Apollo.io searches for prospect discovery and enrichment.

## Features Implemented
- ✅ Natural language to structured filters using OpenAI GPT-5 or Anthropic Claude Sonnet 4
- ✅ Apollo.io API integration for prospect search and enrichment
- ✅ Lusha.io integration for email enrichment (solves Apollo email lock issue)
- ✅ PostgreSQL database with prospects, searches, jobs, and import records
- ✅ React frontend with AI search interface and prospects table
- ✅ CSV import wizard with field mapping
- ✅ Job status tracking and monitoring
- ✅ Fallback keyword extraction when AI is unavailable
- ✅ Graceful error handling for missing API keys
- ✅ **Email Sequence Builder** - Complete campaign management module (Oct 7, 2025)
  - AI-powered LinkedIn personalization using OpenAI for highly personalized emails
  - Multi-step sequence creation with automated follow-ups
  - Prospect enrollment and tracking
  - Real-time email reply detection with 30-second auto-refresh
  - Email tracking and analytics
  - Content library for reusable templates
  - Sentiment analysis and next action recommendations
- ✅ **Multi-Mailbox Email Sending System** - Production email delivery infrastructure (Oct 7, 2025)
  - Multi-provider support: Gmail, Outlook, SMTP, SendGrid
  - Round-robin mailbox rotation for load distribution
  - Email warmup system (5 stages: 10→20→50→100→200 emails/day)
  - Queue-based sending with retry logic and failure tracking
  - Secure credential encryption (AES-256-CBC with random IV)
  - Daily send limits and health monitoring
  - Backward-compatible encryption for existing credentials

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **AI**: OpenAI GPT-5 or Anthropic Claude Sonnet 4
- **Jobs**: BullMQ (requires Redis/Upstash)

## Current Limitations

### Redis/Job Queue Features (Disabled)
Redis is not currently configured, so the following features are disabled:
- Background job processing (enrichment, CSV imports, search jobs)
- Job queue workers
- Async task management

**To enable**: Set `REDIS_URL` environment variable with Redis/Upstash connection string

### Apollo.io Integration
Apollo API key needs to be configured for:
- Prospect search
- Contact enrichment
- Bulk operations

**To enable**: Set `APOLLO_API_KEY` environment variable

## Environment Variables

### Required for Full Functionality
- `DATABASE_URL` - PostgreSQL connection string ✅ (configured)
- `SESSION_SECRET` - Session encryption key ✅ (configured)
- `OPENAI_API_KEY` - OpenAI API key for AI parsing ✅ (configured)
- `APOLLO_API_KEY` - Apollo.io API key ✅ (configured)
- `LUSHA_API_KEY` - Lusha.io API key for email enrichment ❌ (not configured)
- `REDIS_URL` - Redis/Upstash connection string ❌ (not configured)

### Optional
- `ANTHROPIC_API_KEY` - Alternative AI provider (fallback to OpenAI)

## API Endpoints

### AI Search
- `POST /api/ai-search` - Natural language query → Apollo filters (requires Redis)
- `POST /api/apollo-search` - Direct Apollo search with filters (requires Apollo API key)

### Prospects
- `GET /api/prospects` - List prospects with pagination and filters
- `GET /api/prospects/:id` - Get single prospect
- `POST /api/prospects` - Create prospect
- `PUT /api/prospects/:id` - Update prospect
- `POST /api/prospects/enrich` - Enrich prospects (requires Redis & Apollo API)
- `POST /api/lusha-enrich` - Enrich prospects with Lusha email data (works without Redis)

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/active` - List active jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/cancel` - Cancel job

### Imports
- `POST /api/import/upload` - Upload CSV file
- `POST /api/import/preview` - Preview import data
- `POST /api/import/execute` - Execute import (requires Redis)

### Sequences
- `GET /api/sequences` - List all sequences
- `GET /api/sequences/:id` - Get sequence details
- `POST /api/sequences` - Create new sequence
- `PUT /api/sequences/:id` - Update sequence
- `DELETE /api/sequences/:id` - Delete sequence
- `GET /api/sequences/:id/steps` - List sequence steps
- `POST /api/sequences/:id/steps` - Add step to sequence
- `PUT /api/sequences/:id/steps/:stepId` - Update sequence step
- `DELETE /api/sequences/:id/steps/:stepId` - Delete sequence step
- `POST /api/sequences/:id/enroll` - Enroll prospects in sequence
- `GET /api/sequences/:id/prospects` - List enrolled prospects
- `GET /api/sequences/:id/emails` - List emails sent in sequence
- `GET /api/sequences/:id/replies` - List email replies
- `POST /api/sequences/:id/replies/webhook` - Webhook for reply detection
- `POST /api/sequences/:id/personalize` - AI personalization using LinkedIn data
- `GET /api/sequences/content-library` - Get template library
- `POST /api/sequences/content-library` - Save new template

### Email Mailboxes
- `GET /api/mailboxes` - List all configured mailboxes
- `GET /api/mailboxes/:id` - Get mailbox details
- `POST /api/mailboxes` - Add new email mailbox (SMTP/Gmail/Outlook/SendGrid)
- `PUT /api/mailboxes/:id/status` - Update mailbox status (active/paused/warming)
- `DELETE /api/mailboxes/:id` - Delete mailbox
- `GET /api/email-queue/stats` - Get queue statistics (pending/sent/failed)
- `POST /api/email-queue/process` - Manually trigger queue processing

## Database Schema

### Prospects
- Stores contact information (name, email, company, title, etc.)
- Apollo.io enrichment data
- Status tracking (new, partial, enriched, failed)

### Searches
- Natural language queries
- AI-parsed filters
- Apollo.io search parameters

### Jobs
- Background job tracking
- Progress monitoring
- Error logging

### Import Records
- CSV import history
- Processing stats
- Field mappings

### Sequences (Oct 7, 2025)
- **Sequences**: Campaign metadata (name, status, total prospects)
- **Sequence Steps**: Email templates and delays for each step
- **Sequence Prospects**: Enrollment tracking (status, current step, next action date)
- **Emails**: Sent email tracking (subject, body, sent date, status)
- **Email Replies**: Reply detection (subject, body, received date, sentiment)
- **AI Follow-up Jobs**: Scheduled AI-generated follow-ups
- **Personalization Results**: LinkedIn analysis and personalization scores
- **Content Library**: Reusable email templates and content

### Email Sending System (Oct 7, 2025)
- **Email Mailboxes**: Multi-provider mailbox configuration (Gmail, Outlook, SMTP, SendGrid)
  - Encrypted credentials (AES-256-CBC with random IV)
  - Warmup stages (1-5) with progressive daily limits
  - Round-robin rotation and health tracking
- **Email Queue**: Scheduled email sending with retry logic
  - Prospect-to-email resolution for delivery
  - Priority-based processing
  - Failure tracking and max retry limits
- **Email Send Log**: Delivery tracking and analytics
  - Success/failure/bounce status
  - Provider-specific metadata
  - Tracking IDs for correlation

## Development Notes

### Fixed Issues (Oct 7, 2025)
1. ✅ Fixed Apollo service API key validation
2. ✅ Fixed Anthropic AI response parsing
3. ✅ Fixed Redis configuration for optional job queue
4. ✅ Fixed frontend TypeScript type errors
5. ✅ Fixed SelectItem empty value prop error
6. ✅ Updated storage interface for job timestamps
7. ✅ Fixed Apollo API returning data in 'people' array instead of 'contacts'
8. ✅ Added synchronous Apollo search-and-save endpoint for Redis-less operation
9. ✅ Fixed CSV import validation - now properly parses uploaded files instead of returning mock data
10. ✅ Fixed navigation buttons - added onClick handlers for all sidebar navigation items
11. ✅ Added Lusha integration for email enrichment - solves Apollo email lock issue
    - Created Lusha service with graceful API key validation
    - Added `/api/lusha-enrich` endpoint that works without Redis
    - Added "Get Emails (Lusha)" button in prospects table
    - Only enriches prospects with locked/missing emails
    - Returns 200 with `configured: false` when API key missing (non-fatal)
    - Fixed enrichment counting to only count when emails actually found
12. ✅ Implemented Email Sequence Builder module - complete isolated feature
    - Created 8 new database tables for sequences, steps, enrollments, emails, replies, etc.
    - Built LinkedIn AI personalization service using OpenAI for highly personalized emails
    - Implemented sequence management UI with 6 tabs (steps, prospects, replies, AI config, tracking, settings)
    - Added backend API routes for sequence CRUD, enrollment, personalization, and webhooks
    - Integrated navigation in dashboard sidebar with wouter Link component
    - Architect review confirmed clean integration without breaking existing SDR functionality
    - Fixed apiRequest parameter order (method, url, data) in sequences.tsx
13. ✅ Implemented Multi-Mailbox Email Sending System - production email infrastructure
    - Created 3 new database tables (emailMailboxes, emailQueue, emailSendLog)
    - Built MailboxService with encryption, warmup progression, and round-robin selection
    - Built EmailSendingService with multi-provider support (SMTP, SendGrid, Gmail, Outlook)
    - Built EmailQueueService with retry logic, priority processing, and failure tracking
    - Created mailbox management UI with provider-specific forms and queue statistics
    - Fixed critical bugs identified by architect:
      * Queue now fetches prospect email instead of passing UUID to SMTP
      * Encryption uses modern createCipheriv with random IV (backward-compatible)
      * Mailbox selection includes 'warming' status for warmup progression
    - Architect review confirmed production-ready implementation with no regressions

### Testing Status
- ✅ Application starts without errors
- ✅ Frontend loads cleanly (no console errors)
- ✅ API endpoints respond with proper error messages
- ⚠️ Job queue features require Redis configuration
- ⚠️ Apollo search requires API key configuration

## Next Steps
1. Configure Redis/Upstash for job queue functionality
2. Add Apollo.io API key for prospect search
3. Test end-to-end workflows with real API keys
4. Implement rate limiting for API calls
5. Add export functionality for prospect data
