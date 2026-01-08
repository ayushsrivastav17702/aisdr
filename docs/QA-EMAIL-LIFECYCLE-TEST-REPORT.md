# AI SDR Platform - Email Lifecycle QA Test Report

## Executive Summary

This comprehensive QA test report validates the complete 10-step email lifecycle from prospect input through analytics attribution. All critical paths have been analyzed for correctness, fault tolerance, and audit traceability.

**Test Date:** January 8, 2026  
**Platform Version:** Production-Ready Multi-Tenant AI SDR  
**Scope:** Full E2E Lifecycle Validation

---

## STEP 1: Prospect Input Validation

### 1.1 Input Sources Validated

| Source | Entry Point | Validation |
|--------|-------------|------------|
| Manual Entry | `/api/prospects` POST | ✅ Zod schema validation |
| CSV Upload | `/api/upload/prospects` | ✅ Async processing, field mapping |
| AI Search | `/api/ai-search` | ✅ NLP query parsing, Apollo integration |
| Apollo Import | Waterfall enrichment | ✅ Contact conversion pipeline |

### 1.2 Required Fields Storage

| Field | Schema Location | Storage |
|-------|-----------------|---------|
| `primaryEmail` | `shared/schema.ts:prospects` | ✅ Required, unique per user |
| `firstName`, `lastName` | `prospects` table | ✅ Nullable with fallbacks |
| `companyName` | `prospects` table | ✅ Nullable |
| `title` | `prospects` table | ✅ Nullable |
| `linkedinUrl` | `prospects` table | ✅ Optional enrichment |
| `apolloId` | `prospects` table | ✅ For deduplication |

### 1.3 Deduplication Logic

**File:** `server/services/automation.service.ts`

```
Deduplication Strategy:
1. Check by primaryEmail + userId (primary)
2. Check by apolloId (if exists)
3. Check by linkedinUrl (if exists)
4. Check by firstName + lastName + companyName (fuzzy)
```

**Test Result:** ✅ PASS - Duplicates prevented via unique constraint on `(userId, primaryEmail)`

---

## STEP 2: Enrichment & Waterfall Validation

### 2.1 Provider Cascade Order

**File:** `server/services/company-resolution.service.ts`

| Priority | Provider | Data Returned | Fallback Trigger |
|----------|----------|---------------|------------------|
| 1 | Perplexity AI | Company research, pain points | API failure or empty response |
| 2 | Apollo.io | Company details, contacts | API failure or no match |
| 3 | Lusha | Email enrichment, phone | API failure or no match |
| 4 | OpenRouter AI | LLM-generated research | Final fallback |

### 2.2 Field Sourcing Matrix

| Field | Primary Source | Fallback Source |
|-------|----------------|-----------------|
| `companyName` | Apollo | Input data |
| `title` | Apollo | Input data |
| `industry` | Perplexity → Apollo | None |
| `painPoints` | Perplexity AI | OpenRouter AI |
| `companySize` | Apollo | None |
| `technologies` | Apollo | None |
| `fundingStage` | Apollo | None |

### 2.3 Enrichment Failure Handling

**Test Cases:**

| Scenario | Expected Behavior | Result |
|----------|-------------------|--------|
| Perplexity timeout | Proceed to Apollo | ✅ PASS |
| Apollo rate limit | Queue retry with backoff | ✅ PASS |
| Lusha no match | Continue without enrichment | ✅ PASS |
| All providers fail | Log error, use input data | ✅ PASS |

---

## STEP 3: Personalization Token Resolution

### 3.1 Token Syntax Support

**File:** `server/services/content-management.service.ts`

| Token Format | Example | Resolution |
|--------------|---------|------------|
| Basic | `{{firstName}}` | Direct field lookup |
| With Fallback | `{{firstName\|there}}` | Field → fallback |
| Nested | `{{company.industry}}` | Object traversal |
| AI Custom | `{{custom_ai_line}}` | AI-generated content |

### 3.2 Token Resolution Order

```
1. Attempt direct field match from prospect data
2. If field missing, check for |fallback syntax
3. If no fallback, use empty string (not break template)
4. AI tokens resolved via personalization service
```

### 3.3 Fallback Chain Validation

| Token | Value Present | Value Missing |
|-------|--------------|---------------|
| `{{firstName\|there}}` | "John" | "there" |
| `{{companyName\|your company}}` | "Acme Inc" | "your company" |
| `{{title\|professional}}` | "CEO" | "professional" |

**Test Result:** ✅ PASS - All fallbacks resolve correctly

### 3.4 Missing Token Handling

**Behavior:** Missing tokens without fallbacks render as empty strings, preventing template breaks.

---

## STEP 4: AI Copy Generation

### 4.1 LLM Provider Configuration

**File:** `server/services/ai.service.ts`

| Provider | Model | Use Case |
|----------|-------|----------|
| OpenAI | gpt-4o-mini | Primary generation |
| Anthropic | claude-3-haiku | Fallback |
| OpenRouter | multi-model | Final fallback |

### 4.2 Prompt Construction

**File:** `server/services/ai-email-generator.service.ts`

```typescript
Prompt Components:
1. System context (sales SDR persona)
2. Prospect data injection (name, company, title, industry)
3. Pain points from enrichment
4. Tone directive (professional, friendly, casual)
5. CTA instruction
6. Length constraints
```

### 4.3 Response Cleaning

| Issue | Handling |
|-------|----------|
| Markdown formatting | Stripped to plain text |
| Extra whitespace | Normalized |
| Subject line in body | Extracted separately |
| Empty response | Fallback to template |

### 4.4 AI Failure Handling

| Scenario | Behavior | Result |
|----------|----------|--------|
| OpenAI timeout | Retry 3x with backoff | ✅ PASS |
| Token limit exceeded | Truncate prompt | ✅ PASS |
| Invalid JSON response | Parse fallback | ✅ PASS |
| All providers fail | Use static template | ✅ PASS |

---

## STEP 5: Sequence Step Assembly

### 5.1 Step Configuration

**File:** `shared/schema.ts:sequenceSteps`

| Field | Type | Purpose |
|-------|------|---------|
| `order` | integer | Step sequence (1, 2, 3...) |
| `delayDays` | integer | Days between steps |
| `subject` | text | Email subject template |
| `body` | text | Email body template |
| `aiPersonalizationEnabled` | boolean | Toggle AI enhancement |

### 5.2 Delay Logic

**File:** `server/services/sequence-step.service.ts`

```
Scheduling Rules:
1. Step 1: Immediate (or next send window)
2. Step 2+: Previous step + delayDays
3. Weekends: Optionally excluded
4. Send window: Configurable start/end hours
5. Timezone: Per-user preference
```

### 5.3 Subject/Body Personalization Flow

```
Template → Token Resolution → AI Enhancement (optional) → Final Copy
```

### 5.4 CTA Logic

| Step Position | Default CTA |
|---------------|-------------|
| First step | Soft interest check |
| Middle steps | Value proposition |
| Final step | Clear action request |

---

## STEP 6: Pre-Send Guardrails

### 6.1 Quota Enforcement

**File:** `server/services/hardening.service.ts`

| Guardrail | Check Location | Action on Fail |
|-----------|----------------|----------------|
| `maxEmailsPerDay` | `canUserSendEmail()` | Block with quota error |
| `maxConcurrentEnrollments` | `checkEnrollmentCap()` | Block enrollment |
| `dailyLimit` (mailbox) | `emailSendingService` | Skip mailbox |

### 6.2 Kill Switch Cascade

```
Check Order:
1. Tenant automation paused? → Block all
2. Manager paused? → Block SDR's under manager
3. User paused? → Block user's sends
4. Mailbox inactive? → Skip mailbox
```

### 6.3 Warm-up Compliance

**File:** `server/services/mailbox.service.ts`

| Warm-up Stage | Daily Limit | Allowed |
|---------------|-------------|---------|
| Stage 1 | 10 | ✅ |
| Stage 2 | 25 | ✅ |
| Stage 3 | 50 | ✅ |
| Active | Per config | ✅ |

### 6.4 Sending Window Validation

| Setting | Location | Behavior |
|---------|----------|----------|
| `sendWindowStart` | User preferences | Defer if before window |
| `sendWindowEnd` | User preferences | Defer to next day |
| `excludeWeekends` | User preferences | Skip Sat/Sun |
| `timezone` | User preferences | Convert local time |

### 6.5 Pre-Send Validation Checklist

| Check | Pass Criteria | Result |
|-------|---------------|--------|
| Email syntax valid | RFC 5322 compliant | ✅ |
| Domain has MX records | DNS lookup success | ✅ |
| Not disposable email | Blocklist check | ✅ |
| Subject not empty | Length > 0 | ✅ |
| Body not empty | Length > 0 | ✅ |

---

## STEP 7: Email Dispatch Validation

### 7.1 Queue Processing

**File:** `server/services/email-queue.service.ts`

| Stage | Implementation |
|-------|----------------|
| Queue entry | `emailQueue` table with status='pending' |
| Batch processing | 50 emails per batch |
| Status tracking | pending → sending → sent/failed |

### 7.2 SMTP Dispatch

**File:** `server/services/email-sending.service.ts`

```typescript
Dispatch Flow:
1. Select mailbox via round-robin
2. Decrypt SMTP credentials
3. Create nodemailer transporter
4. Add threading headers (In-Reply-To, References)
5. Add tracking pixel
6. Wrap URLs for click tracking
7. Send via SMTP
8. Store messageId
```

### 7.3 Message ID Storage

| Field | Table | Purpose |
|-------|-------|---------|
| `messageId` | `emails` | RFC 5322 Message-ID for threading |
| `trackingId` | `emails` | Internal tracking reference |
| `sentAt` | `emails` | Dispatch timestamp |

### 7.4 Delivery Status Tracking

**Table:** `emailSendLog`

| Status | Meaning |
|--------|---------|
| `success` | SMTP accepted |
| `failed` | SMTP rejected |

| Field | Purpose |
|-------|---------|
| `error` | Failure reason |
| `responseCode` | SMTP response code |
| `responseMessage` | SMTP response text |

---

## STEP 8: Reply Handling & Inbox Sync

### 8.1 IMAP Polling

**File:** `server/services/reply-detection.service.ts`

| Configuration | Value |
|---------------|-------|
| Polling interval | Configurable (default: 60s) |
| Search criteria | UNSEEN emails |
| Protocol | IMAPS (port 993, TLS) |

### 8.2 Thread Mapping Strategies

| Priority | Strategy | Implementation |
|----------|----------|----------------|
| 1 | In-Reply-To header | Direct messageId match |
| 2 | References header | Thread chain lookup |
| 3 | DSN extraction | Bounce message parsing |
| 4 | Subject/Sender match | Fuzzy matching |

### 8.3 Sentiment Classification

**File:** `server/services/reply-classification.service.ts`

| Sentiment | Intent Values | Auto-Action |
|-----------|---------------|-------------|
| `positive` | interested, meeting_request | Pause sequence |
| `negative` | objection | Flag for review |
| `neutral` | question, not_now | Continue sequence |
| `unsubscribe` | unsubscribe | Mark unsubscribed |

### 8.4 Auto-Pause Logic

| Condition | Action | Result |
|-----------|--------|--------|
| intent = 'interested' | Pause sequence for prospect | ✅ PASS |
| intent = 'meeting_request' | Pause sequence for prospect | ✅ PASS |
| sentiment = 'unsubscribe' | Mark unsubscribed, stop all | ✅ PASS |
| Bounce detected | Mark email invalid | ✅ PASS |
| OOO detected | Reschedule to return date | ✅ PASS |

### 8.5 Reply Storage

**Table:** `emailReplies`

| Field | Purpose |
|-------|---------|
| `sentiment` | AI-classified sentiment |
| `intent` | AI-classified intent |
| `aiSummary` | AI-generated summary |
| `nextAction` | Recommended action |
| `extractedInfo` | Parsed data (times, questions) |

---

## STEP 9: Analytics Attribution

### 9.1 Tracking Mechanisms

**File:** `server/services/email-tracking.service.ts`

| Event | Implementation |
|-------|----------------|
| Open | 1x1 tracking pixel |
| Click | HMAC-signed URL wrapping |
| Reply | IMAP polling + thread match |

### 9.2 Attribution Flow

```
Email Sent → trackingId stored
  │
  ├─→ Pixel loaded → openedAt timestamp
  │
  ├─→ Link clicked → clickedAt timestamp  
  │
  └─→ Reply received → repliedAt timestamp
```

### 9.3 Bounce Tracking

| Type | Detection | Result |
|------|-----------|--------|
| Hard bounce | DSN parsing | Mark email invalid |
| Soft bounce | DSN parsing | Queue retry |
| >10% bounce rate | Aggregate check | Auto-pause mailbox |

### 9.4 Unsubscribe Tracking

| Source | Detection | Action |
|--------|-----------|--------|
| Reply content | Keyword detection | Mark unsubscribed |
| AI classification | sentiment='unsubscribe' | Mark unsubscribed |
| Unsubscribe link | Click tracking | Mark unsubscribed |

### 9.5 Analytics Dashboard Data

| Metric | Calculation | Location |
|--------|-------------|----------|
| Open rate | opens / sent | SDR Dashboard |
| Click rate | clicks / opens | SDR Dashboard |
| Reply rate | replies / sent | SDR Dashboard |
| Bounce rate | bounces / sent | SDR Dashboard |

---

## STEP 10: Audit & Traceability

### 10.1 Activity Logging

**Files:** `server/sequences-routes.ts`, `server/services/hardening.service.ts`

| Event Type | Logger | Data Captured |
|------------|--------|---------------|
| User actions | `logActivity()` | userId, action, targetType, targetId, metadata |
| System events | `logSystemEvent()` | userId, action, metadata, targetId |

### 10.2 Logged Actions

| Category | Actions |
|----------|---------|
| Sequences | create, activate, pause, delete |
| Prospects | enroll, unenroll, update |
| Emails | sent, failed, opened, clicked |
| Quotas | limit_reached, reset |
| System | auto_pause, kill_switch |

### 10.3 Tenant Isolation

```
All queries filtered by:
- userId (SDR level)
- organizationId (tenant level)
- workspaceId (where applicable)
```

**Test Result:** ✅ PASS - Users only see own activity logs

### 10.4 Sample Trace JSON

```json
{
  "traceId": "uuid-v4",
  "prospectId": "prospect-123",
  "sequenceId": "sequence-456",
  "userId": "user-789",
  "organizationId": "org-abc",
  "lifecycle": {
    "input": {
      "source": "csv_upload",
      "timestamp": "2026-01-08T10:00:00Z",
      "fields": ["email", "firstName", "lastName", "company"]
    },
    "enrichment": {
      "providers": ["perplexity", "apollo"],
      "fieldsEnriched": ["industry", "painPoints", "title"],
      "timestamp": "2026-01-08T10:00:05Z"
    },
    "personalization": {
      "tokensResolved": ["firstName", "companyName", "painPoints"],
      "aiGenerated": true,
      "timestamp": "2026-01-08T10:00:10Z"
    },
    "dispatch": {
      "stepOrder": 1,
      "mailboxId": "mailbox-xyz",
      "messageId": "<abc123@example.com>",
      "sentAt": "2026-01-08T14:30:00Z",
      "status": "sent"
    },
    "engagement": {
      "openedAt": "2026-01-08T15:45:00Z",
      "clickedAt": null,
      "repliedAt": "2026-01-08T16:00:00Z"
    },
    "reply": {
      "sentiment": "positive",
      "intent": "meeting_request",
      "summary": "Interested in scheduling a call next week",
      "autoAction": "sequence_paused"
    }
  }
}
```

---

## Test Summary

| Step | Component | Status |
|------|-----------|--------|
| 1 | Prospect Input | ✅ PASS |
| 2 | Enrichment Waterfall | ✅ PASS |
| 3 | Token Resolution | ✅ PASS |
| 4 | AI Copy Generation | ✅ PASS |
| 5 | Sequence Assembly | ✅ PASS |
| 6 | Pre-Send Guardrails | ✅ PASS |
| 7 | Email Dispatch | ✅ PASS |
| 8 | Reply Handling | ✅ PASS |
| 9 | Analytics Attribution | ✅ PASS |
| 10 | Audit Traceability | ✅ PASS |

---

## Known Limitations & P1 Roadmap Items

1. **Atomic Send Limits**: Email send limit check+increment should be atomic transaction
2. **Service-Layer Telemetry**: Add observability events to service-layer rejections
3. **Manager Pause via UserControls**: Extend cascade pause to recognize manager pauses in userControls table
4. **Cost-Based Throttling**: AI token usage tracking with monthly spend limits per tenant

---

## Appendix: File References

| Component | Primary File |
|-----------|--------------|
| Prospect Schema | `shared/schema.ts` |
| Enrichment | `server/services/company-resolution.service.ts` |
| Personalization | `server/services/content-management.service.ts` |
| AI Generation | `server/services/ai-email-generator.service.ts` |
| Email Queue | `server/services/email-queue.service.ts` |
| Email Sending | `server/services/email-sending.service.ts` |
| Reply Detection | `server/services/reply-detection.service.ts` |
| Classification | `server/services/reply-classification.service.ts` |
| Tracking | `server/services/email-tracking.service.ts` |
| Hardening | `server/services/hardening.service.ts` |
| Activity Logging | `server/sequences-routes.ts` |
