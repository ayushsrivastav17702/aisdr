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
