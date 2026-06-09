# Test Traceability Matrix

Baseline: 1,511 passing tests across `tests/{auth,user,manager,data-isolation,security,super-admin,resilience,chaos,ai,email,performance,ux,load}`.

Legend — COVERAGE is an estimate based on grepping existing `*.test.ts` files for the route/table/service names below.

---

## 1. Authentication
UI: Login/Magic-link page → `POST /api/auth/magic-link/request`, `POST /api/auth/magic-link/verify`, `POST /api/auth/login`, `POST /api/auth/logout`
Service: `auth.service.ts`, `magic-link.service.ts` → Tables: `users`, `userSessions`, `magicLinks`
Jobs: session cleanup cron · External: Resend (magic-link email)
Expected: JWT cookie set, session row created, role resolved correctly
Edge cases: expired/tampered JWT, expired magic link, unknown email (no enumeration), inactive user, concurrent sessions
**COVERAGE: ~75%** (`tests/auth/auth.test.ts`, `login-role-resolution.test.ts`, `bug-fixes.test.ts` BUG-001/002)
**GAPS:** tampered-JWT-payload case, magic-link single-use enforcement, Resend-down fallback path
**RISK: P1**

## 2. Campaigns
UI: Campaigns tab → `GET/POST /api/campaigns`, `GET /api/campaigns/:id`, `POST /api/campaigns/:id/launch`
Service: `campaigns.routes.ts` → Tables: `sequences` (campaigns reuse sequence rows), `emailMailboxes`, `automationRuns`
Jobs: launch orchestration → External: none direct
Expected: 201 on create, 409 on duplicate name, launch validates mailbox + steps
Edge cases: launch w/o mailbox, launch w/o steps, launch w/o prospects, duplicate name
**COVERAGE: ~40%** (BUG-004 covers "no mailbox → 400"; create/duplicate/launch-happy-path largely untested)
**GAPS:** POST happy path assertions, duplicate-name 409, no-steps launch guard, no-prospects launch guard
**RISK: P0** (revenue-path; launch failures are user-visible)

## 3. Sequences
UI: Sequences tab → `GET/POST /api/sequences`, `POST /api/sequences/:id/steps`, `POST /api/sequences/:id/prospects`, `POST /api/sequences/:id/activate`
Service: `sequences-routes.ts` → Tables: `sequences`, `sequenceSteps`, `sequenceProspects`, `emailQueue`
Jobs: `email-queue.service.ts` (enrollment → queue), `ai-followup-scheduler.service.ts`
Expected: draft→active transitions, steps ordered, enrollment creates `sequenceProspects` + `emailQueue` rows
Edge cases: empty prospectIds, wrong owner, non-existent sequence, manager role 403, activate w/ no steps
**COVERAGE: ~55%** (`sequence-enrollment-single.test.ts`, `manager-role.test.ts` cover enroll + forbidManager; activation/steps lifecycle thin)
**GAPS:** POST /steps ordering, activate-with-no-steps guard, full draft→active→enroll→send lifecycle chain
**RISK: P0**

## 4. Find Leads / Prospects
UI: Find Leads tab → `GET/POST /api/prospects`, `PATCH/DELETE /api/prospects/:id`, `POST /api/prospects/bulk-delete`
Service: `routes.ts` (inline), `apollo.service.ts` (enrichment) → Tables: `prospects`
Jobs: enrichment pipeline → External: Apollo API
Expected: 201 create w/ `enrichmentStatus: 'new'`, workflow-stage gate (`assertStage(userId,'upload')`), tenant-pause guard
Edge cases: missing email, invalid email, XSS in name, duplicate email, Apollo returns 0 results
**COVERAGE: ~35%** (data-isolation covers cross-org; CRUD validation/XSS-encoding/duplicate-email largely absent)
**GAPS:** POST validation matrix (missing/invalid/XSS/duplicate), Apollo-empty-result handling
**RISK: P0** (core data-entry path)

## 5. Inbox / Reply Detection
UI: Inbox tab → `GET /api/inbox/replies`
Service: `inbox-routes.ts`, reply-classification service → Tables: `emailReplies`, `leadEvents`
Jobs: IMAP/webhook reply poller → External: mailbox providers (Gmail/Outlook API)
Expected: replies linked to prospect+sequence, sentiment/intent classification populated
Edge cases: reply with no matching prospect, malformed inbound payload, duplicate reply ingestion
**COVERAGE: ~15%** (no dedicated inbox test file found)
**GAPS:** entire module — list endpoint shape, classification fields, dedup of inbound messages
**RISK: P1**

## 6. AE Handoff
UI: Handoffs panel → `POST/GET /api/handoffs`
Service: `ae-handoff.routes.ts` → Tables: `handoffs` (or equivalent), `prospects`
Jobs: notification on handoff creation → External: Slack/email notification
Expected: status defaults to `pending`, notes persisted, linked prospect valid
Edge cases: handoff for non-existent prospect, duplicate handoff, cross-org handoff attempt
**COVERAGE: ~10%** (no dedicated handoff test file found)
**GAPS:** entire create/list/status-transition flow
**RISK: P1**

## 7. Signals
UI: Signals tab → `GET /api/intent-signals`
Service: signal-ingestion service → Tables: `leadEvents`, signals table
Jobs: signal scoring/ingestion cron → External: signal-data providers
Expected: signals scoped to org, scored/ranked correctly
Edge cases: no signals available, stale signal data, cross-org signal leakage
**COVERAGE: ~10%**
**GAPS:** list endpoint shape/auth, scoring correctness, isolation
**RISK: P2**

## 8. Manage AI
UI: Manage AI tab → `ai-generation.routes.ts`, `safe-to-send.routes.ts`
Service: `ai.service.ts`, `ai-email-generator.service.ts`, `safe-to-send.service.ts` → Tables: `aiGenerations`, `emailSendAudit`
Jobs: generation queue → External: OpenAI, Anthropic, OpenRouter, Perplexity
Expected: tier credit deduction (3/6/12), provider fallback chain, banned-phrase filtering, hallucination guard
Edge cases: all providers fail (fail-open), missing prospect fields, KB-empty deep-tier request
**COVERAGE: ~50%** (`tests/ai/ai-generation.test.ts`, `security.test.ts` prompt-injection)
**GAPS:** explicit per-tier credit-deduction assertions, full fallback-chain (OpenAI→Anthropic→OpenRouter→template) sequencing, missing-data token-rendering
**RISK: P1**

## 9. Analytics
UI: Analytics tab → `GET /api/analytics/overview`
Service: `analytics.routes.ts` → Tables: `emailQueue`, `emailSendLog`, `leadEvents`, `aiGenerations`
Jobs: aggregation cron/materialized view refresh
Expected: counts exclude `simulated` emails, scoped per-org
Edge cases: zero-data org, simulated-vs-real email exclusion, date-range filters
**COVERAGE: ~20%** (`performance.test.ts` touches load only)
**GAPS:** overview shape assertions, simulated-email exclusion, org scoping
**RISK: P2**

## 10. Mailboxes
UI: Mailboxes tab → `GET/POST /api/mailboxes`
Service: `mailbox-routes.ts`, `mailbox.service.ts` → Tables: `emailMailboxes`
Jobs: OAuth token refresh → External: Gmail/Outlook OAuth, SMTP
Expected: credential encryption, active/inactive states, token refresh on expiry
Edge cases: invalid SMTP creds, OAuth token expiry mid-send, duplicate mailbox connection
**COVERAGE: ~15%**
**GAPS:** connection validation, token-refresh flow, duplicate-connection handling
**RISK: P1** (send pipeline depends on this)

## 11. Knowledge Base
UI: Company Knowledge tab → `GET/POST /api/company-knowledge`
Service: routes embedded in personalization/ai-generation → Tables: `companyKnowledge` / `contentLibrary`
Expected: entries referenced in deep-tier AI prompts
Edge cases: empty KB, very large KB entries (token limits), XSS in KB content rendered into emails
**COVERAGE: ~10%**
**GAPS:** CRUD, prompt-inclusion verification, content sanitization
**RISK: P2**

## 12. Super Admin / Vault
UI: Super Admin panel → `super-admin.routes.ts` (api-keys, org management, vault)
Service: `super-admin.routes.ts`, vault/secrets service → Tables: `users`, `organizations`, secrets store
Expected: requires super-admin cookie (separate from user JWT), audit-logged actions
Edge cases: regular user accessing super-admin routes (401), manager/admin escalation attempts
**COVERAGE: ~70%** (`tests/super-admin/super-admin.test.ts`)
**GAPS:** vault-specific secret rotation/access-control assertions
**RISK: P0** (privilege-escalation surface)

## 13. Email Pipeline
UI: (background) → `email-execution.routes.ts`, `email-settings.routes.ts`
Service: `email-queue.service.ts`, `email-queue-bullmq.ts`, `email-queue-poller.ts`, `email-sending.service.ts`, `safe-to-send.service.ts` → Tables: `emailQueue`, `emails`, `emailSendLog`, `emailSendAudit`
Jobs: BullMQ workers + fallback poller → External: Resend/SMTP/Gmail/Outlook send APIs
Expected: status machine `pending→scheduled→pending→sent|failed|paused_failed|simulated`, idempotency via `ON CONFLICT DO NOTHING`, approval gates hold before send
Edge cases: idempotency-key collision, paused-vs-permanent failure distinction, simulated-email exclusion from analytics, retry-after-DB-failure
**COVERAGE: ~45%** (`tests/email/email-execution.test.ts`, BUG-006 idempotency)
**GAPS:** full status-transition matrix, approval-flow (approve/reject/enter-queue), paused_failed vs failed semantics
**RISK: P0** (core send-path correctness)

## 14. AI Generation
(See Module 8 — Manage AI; same services/tables. Listed separately per audit doc for prompt-template and merge-field correctness.)
UI: composer "Generate" button → `POST /api/sequences/ai-generate-email`, `/ai-generate-variants`
Service: `ai-prompt-templates.ts`, `ai-tracking.service.ts`
Expected: merge fields HTML-encoded (BUG-007 verified), banned phrases stripped, token usage tracked
Edge cases: undefined merge tokens, very long generated content, non-English prospect names
**COVERAGE: ~50%** (overlaps module 8; BUG-007 covers encoding)
**GAPS:** banned-phrase filter assertions, undefined-token guard
**RISK: P1**

---

## Summary — P0 gaps to close first
1. Prospects POST validation matrix (module 4)
2. Campaign launch guards: no-steps / no-prospects / duplicate-name (module 2)
3. Sequence lifecycle chain: create→steps→activate→enroll→queue (module 3)
4. Email pipeline status-transition + approval-flow matrix (module 13)
5. Master E2E 20-step workflow (cross-cutting)
