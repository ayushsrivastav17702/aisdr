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
    - **AI Search Fallback**: When AI providers fail, uses keyword-based extraction that retains company names, job titles, locations, and industries while filtering common stop-words.
    - **Apollo Industry Filter Fix**: Industries are included in keyword search (`q_keywords`) instead of `organization_industry_tag_ids` to prevent 422 errors from invalid industry tag IDs.
    - **Email Sequence Management**: Supports multi-step sequences, prospect enrollment, tracking, and AI-powered personalization based on prospect data.
    - **AI Email Generation**: One-click generation of personalized emails, A/B test variants, and sentiment analysis.
    - **Multi-Mailbox Sending**: Securely manages multiple email accounts with round-robin rotation, encryption, and an email warmup system.
    - **Bulk Operations**: Efficiently enriches multiple prospects simultaneously using Apollo's bulk match API.
    - **Data Security**: Secure credential encryption (AES-256-CBC with random IV) for email mailboxes.
    - **API Key Management**: Automatic fallback from primary to backup OpenAI API key when quota is exhausted.
    - **CSV Import Resilience**: 50MB file size limit, comprehensive logging for debugging large imports, detailed error tracking with row numbers.
    - **Reply Detection System**: IMAP-based polling that automatically detects prospect replies, matches them to sent emails, and stores them with proper error handling. Includes intelligent reply content cleanup.
    - **AI Follow-up Generation**: Uses actual reply content from the database for contextual follow-ups.
    - **Content Library Auto-Selection**: Automatically selects all content library items for compliance validation in AI-generated emails, ensuring brand guidelines are followed.
    - **Content Library Validation with Auto-Retry**: Enforces content library compliance by automatically retrying AI email generation up to 3 times if violations are detected, ensuring only approved content is used.
    - **Auto-Enrollment from AI Personalization**: Prospects are automatically enrolled in a sequence when an AI personalized email is created for them.
    - **Performance Optimizations**: Prospects table page size reduced to 25 items with animated skeleton loading, and URL parameter synchronization for state management.
    - **Sequence Management**: Complete sequence deletion feature with CASCADE delete constraints ensures clean removal of sequences and all related data.
    - **High-Speed Email Sending**: Email queue processor runs every 10 seconds for near-instant email delivery.
    - **Email Formatting for HTML Clients**: AI-generated emails use HTML `<p>` tags with specific styling for proper paragraph spacing in email clients.
    - **AI Reply Composer**: Fully functional reply dialog allows users to generate AI follow-ups and send replies directly through the platform.
    - **Email Analytics Tracking**: Email analytics (sent, delivered, opened, replied counts) properly track all sent emails.
    - **Email Signatures**: Mailboxes support customizable email signatures automatically appended to all outgoing emails.
    - **Contextual AI Follow-ups**: AI-generated follow-up emails properly reference and build upon previous email conversations, enforcing contextual continuity and proper conversation flow.
    - **Sequence Builder Performance**: Lazy loading optimization for sequence details, prospects, and replies to eliminate UI lag.
    - **Email Threading**: Follow-up emails in the same sequence properly thread with previous emails using RFC 5322 Message-ID headers.
    - **Apollo.io Enrichment Fix**: Removed `reveal_phone_number=true` parameter to resolve "webhook_url required" errors, enabling reliable enrichment with personal email revelation.
    - **Automation Layer**: Complete background automation system for autonomous prospect imports and sequence enrollment from Apollo.io or existing database prospects.
    - **Reply Classification System**: Automated sentiment analysis classifies incoming replies as positive, negative, unsubscribe, or neutral, with automatic unsubscribe processing.
    - **ICP Templates**: Pre-configured Ideal Customer Profile templates for rapid prospect targeting.
    - **Lead Scoring**: Automated 0-100 scoring algorithm calculates prospect quality based on seniority, data completeness, email quality, phone availability, and LinkedIn presence.
    - **Duplicate Detection**: Intelligent duplicate prevention checks prospects by email, Apollo ID, LinkedIn URL, and name+company combinations.
    - **API Rate Limiting**: Enforced rate limits on Apollo API calls to manage usage and credit consumption.
    - **Advanced Apollo Filters**: Extended search capabilities include revenue range filtering, technology stack identification, and funding stage targeting.
    - **Smart Search Fallback**: Multi-strategy Apollo search system automatically tries alternative approaches when initial search returns zero results. Falls back from strict filter matching → keyword search → seniority-only search, maximizing prospect discovery while maintaining relevance. Provides user feedback on which strategy successfully found results.

## External Dependencies
- **Apollo.io**: Primary API for prospect search, data enrichment, and bulk matching.
- **OpenAI**: Provides AI capabilities for natural language processing, email generation, and LinkedIn personalization.
- **Anthropic**: Alternative AI provider for natural language processing.
- **Lusha.io**: Used for email enrichment, serving as a fallback.
- **PostgreSQL (Neon)**: Cloud-hosted relational database for all application data.
- **Redis/Upstash**: Required for BullMQ to enable background job processing.