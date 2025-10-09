# AI-Powered SDR Platform

## Overview
An AI-powered Sales Development Representative (SDR) platform designed to streamline prospect discovery, enrichment, and outreach. It converts natural language queries into structured Apollo.io searches, enriches prospect data, and automates multi-step email sequences with AI-generated, personalized content. The platform aims to enhance sales efficiency by providing a comprehensive solution for lead generation and engagement, from initial search to automated email follow-ups and reply tracking.

## User Preferences
- I prefer clear and concise explanations.
- I value iterative development and prefer to be involved in major architectural decisions.
- Please ask for confirmation before making significant changes to core functionalities or database schemas.
- Ensure all new features are backward-compatible and do not break existing workflows.
- I prefer to maintain a high level of code quality, with a focus on maintainability and scalability.

## System Architecture
The platform is built with a modern web stack:
- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui for a responsive and intuitive user interface.
- **Backend**: Express.js with TypeScript for robust API services.
- **Database**: PostgreSQL (managed by Neon) with Drizzle ORM for data persistence, storing prospects, searches, jobs, and comprehensive email sequence data including mailboxes, queues, and send logs.
- **AI Integration**: Leverages OpenAI (GPT-4o, GPT-5) or Anthropic (Claude Sonnet 4) for natural language processing, personalized email generation, LinkedIn analysis, and sentiment analysis.
- **Job Queue**: Utilizes BullMQ (requires Redis/Upstash) for background processing of tasks like enrichment, CSV imports, and email sending.
- **UI/UX Decisions**: Employs a clean, modern design with a focus on user-friendly workflows for AI search, prospect management, and campaign creation. Key features include a detailed email sequence builder with real-time reply detection, AI-powered email generation with customizable tones, and multi-mailbox email sending with warmup and round-robin capabilities.
- **Technical Implementations**:
    - **Natural Language Processing**: Converts user queries into structured Apollo.io filters with intelligent AI and fallback processing.
    - **AI Search Fallback**: When AI providers fail, uses keyword-based extraction that retains company names (including short/digit-leading like IBM, Gap, 3M, 23andMe), job titles (including merchandising roles), locations, and industries while filtering common stop-words and avoiding false positives from locations or sentence starters.
    - **Email Sequence Management**: Supports multi-step sequences, prospect enrollment, tracking, and AI-powered personalization based on prospect data.
    - **AI Email Generation**: One-click generation of personalized emails, A/B test variants, and sentiment analysis.
    - **Multi-Mailbox Sending**: Securely manages multiple email accounts (Gmail, Outlook, SMTP, SendGrid) with round-robin rotation, encryption, and an email warmup system.
    - **Bulk Operations**: Efficiently enriches multiple prospects simultaneously using Apollo's bulk match API.
    - **Data Security**: Secure credential encryption (AES-256-CBC with random IV) for email mailboxes.
    - **API Key Management**: Automatic fallback from primary to backup OpenAI API key when quota is exhausted (429 errors).
    - **CSV Import Resilience**: 50MB file size limit, comprehensive logging for debugging large imports (15k+ prospects), detailed error tracking with row numbers.

## External Dependencies
- **Apollo.io**: Primary API for prospect search, data enrichment, and bulk matching.
- **OpenAI**: Provides AI capabilities for natural language processing, email generation (GPT-4o, GPT-5), and LinkedIn personalization.
- **Anthropic**: Alternative AI provider (Claude Sonnet 4) for natural language processing.
- **Lusha.io**: Used for email enrichment, serving as a fallback when Apollo.io data is unavailable or locked.
- **PostgreSQL (Neon)**: Cloud-hosted relational database for all application data.
- **Redis/Upstash**: Required for BullMQ to enable background job processing and asynchronous task management.