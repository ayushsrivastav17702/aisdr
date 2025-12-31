# Phase 1: Code Risk Review - Capacity Hotspots

**Date:** December 31, 2025  
**Scope:** User Role Backend API - Load Testing Preparation  
**Status:** P0 FIXES COMPLETED - Ready for Load Testing

---

## P0 Fixes Applied

| Fix | Before | After | File |
|-----|--------|-------|------|
| CSV Upload | Sync blocking request | HTTP 202, async setImmediate | routes.ts:1421-1470 |
| Prospect Enrollment | 5000+ queries (1000 prospects) | 5 queries total | storage.ts:790-878 |

---

## Summary Table

| Module | Hard Limits Found | Key Risk | Severity | Status |
|--------|-------------------|----------|----------|--------|
| 1. Prospect Upload | 50MB file, 1000 batch | ~~Sync blocking~~ | ~~HIGH~~ | ✅ FIXED |
| 2. AI Enrichment | 3 workers, batch=10 | Serial processing, 200ms delay | MEDIUM | Pending |
| 3. Sequence Creation | No limit | Unbounded DB growth | LOW | Pending |
| 4. Prospect Enrollment | ~~N+1 queries~~ | ~~5 queries/prospect~~ | ~~HIGH~~ | ✅ FIXED |
| 5. Email Send Queue | 50 emails/poll | Sequential processing in loop | HIGH | Pending |
| 6. Reply Ingestion | 20s poll, sequential | IMAP blocking, no parallelism | HIGH | Pending |
| 7. AI Personalization | 30s timeout, fallback | External API dependency, no throttling | HIGH | Pending |

---

## 1. PROSPECT UPLOAD

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| Max file size | 50MB | `server/routes.ts` | 52 |
| Batch insert size | 1000 | `server/routes.ts` | 1541 |
| Duplicate check | IN query with all emails | `server/routes.ts` | 1494-1503 |

### Risk Hotspots

**1.1 Synchronous Processing Without Redis**
- **File:** `server/routes.ts`
- **Lines:** 1445-1591
- **Issue:** Without Redis, entire CSV is processed synchronously in HTTP request
- **Impact:** Request timeout for large files, blocks event loop
- **Red Flag:** 🚨 50MB file = ~100k+ rows processed in single request

**1.2 Full File Read Into Memory**
- **File:** `server/routes.ts`
- **Lines:** 1453-1464
- **Issue:** `readFileSync` loads entire CSV into memory before parsing
- **Impact:** Memory spike proportional to file size

**1.3 Duplicate Check - Single Large Query**
- **File:** `server/routes.ts`  
- **Lines:** 1494-1503
- **Issue:** `storage.checkDuplicateProspects(ctx, allEmails)` with potentially 100k emails
- **Impact:** Query performance degrades with array size

### Missing Indexes
- `prospects.primaryEmail` - INDEX EXISTS ✅
- `prospects.userId` - INDEX EXISTS ✅

---

## 2. AI ENRICHMENT

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| BullMQ workers | 3 concurrent | `server/queue/automation-worker.ts` | 9 |
| Apollo batch size | 10 | `server/services/job.service.ts` | 202 |
| Rate limit delay | 200ms between prospects | `server/services/enrichment-waterfall.service.ts` | 213 |

### Risk Hotspots

**2.1 Serial Batch Processing**
- **File:** `server/services/job.service.ts`
- **Lines:** 218-295
- **Issue:** Processes batches sequentially with await in loop
- **Impact:** 1000 prospects = 100 batches × API latency

**2.2 Individual Prospect Updates in Batch**
- **File:** `server/services/job.service.ts`
- **Lines:** 235-270
- **Issue:** Each prospect updated individually after enrichment
- **Impact:** N DB writes per batch (N+1 pattern)

**2.3 Waterfall Enrichment - Serial Provider Calls**
- **File:** `server/services/enrichment-waterfall.service.ts`
- **Lines:** 25-63
- **Issue:** Apollo → Lusha → Web Search called sequentially per prospect
- **Impact:** Worst case: 3 API calls × latency per prospect

**2.4 Rate Limiting Delay**
- **File:** `server/services/enrichment-waterfall.service.ts`
- **Lines:** 211-214
- **Issue:** Fixed 200ms delay between enrichments
- **Impact:** 1000 prospects = 200 seconds minimum (3+ minutes)

---

## 3. SEQUENCE CREATION

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| Max sequences | None | N/A | N/A |
| Max steps per sequence | None | N/A | N/A |

### Risk Hotspots

**3.1 No Sequence Count Limit**
- **File:** `shared/schema.ts`
- **Lines:** 213-227
- **Issue:** No constraint on sequences per user
- **Impact:** Unbounded DB growth, slow list queries

**3.2 No Step Count Limit**
- **File:** `shared/schema.ts`
- **Lines:** 230-242
- **Issue:** No constraint on steps per sequence
- **Impact:** Large sequences slow to load/edit

### Missing Indexes
- `sequences.userId` - INDEX MISSING ⚠️
- `sequenceSteps.sequenceId` - INDEX MISSING ⚠️

---

## 4. PROSPECT ENROLLMENT (CRITICAL N+1)

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| Batch enrollment | None (one-by-one) | `server/storage.ts` | 793 |

### Risk Hotspots

**4.1 N+1 Query Pattern - Prospect Validation**
- **File:** `server/storage.ts`
- **Lines:** 793-798
- **Issue:** `getProspect()` called for EACH prospectId in loop
- **Impact:** 1000 prospects = 1000 DB queries just for validation

**4.2 N+1 Query Pattern - Previous Enrollment Check**
- **File:** `server/storage.ts`
- **Lines:** 807-814
- **Issue:** Query for previous enrollments per prospect
- **Impact:** Additional query per prospect

**4.3 N+1 Query Pattern - Supersede Updates**
- **File:** `server/storage.ts`
- **Lines:** 839-849
- **Issue:** Individual UPDATE for each previous enrollment
- **Impact:** Variable queries per prospect (0-N previous enrollments)

**4.4 Unbounded Loop - Automation Service**
- **File:** `server/services/automation.service.ts`
- **Lines:** 275-410
- **Issue:** Enrollment loop processes prospects sequentially
- **Impact:** Each prospect: check → insert → schedule email = 3+ operations

**Total Queries Per Prospect Enrolled:**
1. `getProspect()` validation = 1 query
2. Check existing enrollment = 1 query  
3. Find previous enrollments = 1 query
4. Cancel pending emails = 1 query
5. Update previous enrollments = N queries
6. Insert new enrollment = 1 query
**Minimum:** 5 queries per prospect  
**1000 prospects = 5000+ queries** 🚨

### Missing Indexes
- `sequenceProspects.prospectId` - INDEX MISSING ⚠️
- `sequenceProspects.sequenceId` - INDEX MISSING ⚠️
- `sequenceProspects.status` - INDEX MISSING ⚠️
- `emailQueue.prospectId` - INDEX MISSING ⚠️

---

## 5. EMAIL SEND QUEUE

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| Poll interval | 10 seconds | `server/index.ts` | 248 |
| Emails per poll | 50 | `server/services/email-queue.service.ts` | 319 |
| Daily limit (conservative) | 100 | `server/config/email-volume.config.ts` | 48 |
| Daily limit (medium) | 5000 | `server/config/email-volume.config.ts` | 63 |
| Delay between emails | 10-60 seconds | `server/config/email-volume.config.ts` | 49,64 |
| BullMQ automation workers | 3 | `server/queue/automation-worker.ts` | 9 |

### Risk Hotspots

**5.1 Sequential Email Processing**
- **File:** `server/services/email-queue.service.ts`
- **Lines:** 323-430
- **Issue:** `for (const email of pendingEmails)` - sequential await loop
- **Impact:** 50 emails × send latency = blocking

**5.2 Rate Limit Lookup Per Email**
- **File:** `server/services/email-queue.service.ts`
- **Lines:** 337-380
- **Issue:** For each email, queries `sequenceProspects` then `reserveSendSlot`
- **Impact:** 2+ queries per email in send loop

**5.3 Email Volume Presets**
- **File:** `server/config/email-volume.config.ts`
- **Lines:** 38-99
- **Presets:**
  - Conservative: 100/day, 1/min delay
  - Medium: 5000/day, 10s delay
  - High: 10000/day, 3s delay
  - Enterprise: 50000/day, 1s delay

### Missing Indexes
- `emailQueue.status + scheduledFor` - INDEX EXISTS ✅
- `emailQueue.userId + status` - INDEX EXISTS ✅

---

## 6. REPLY INGESTION

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| Poll interval | 20 seconds | `server/services/reply-detection.service.ts` | 33 |
| Concurrent processing | 1 (isProcessing flag) | `server/services/reply-detection.service.ts` | 31,59 |

### Risk Hotspots

**6.1 Sequential Mailbox Processing**
- **File:** `server/services/reply-detection.service.ts`
- **Lines:** 72-76
- **Issue:** `for (const mailbox of mailboxes)` processes mailboxes one at a time
- **Impact:** 10 mailboxes × IMAP connection time = slow polling

**6.2 IMAP Blocking**
- **File:** `server/services/reply-detection.service.ts`
- **Lines:** 89-200
- **Issue:** IMAP is callback-based wrapped in Promise, no timeout
- **Impact:** Stuck IMAP connection blocks all reply detection

**6.3 Single Instance Lock**
- **File:** `server/services/reply-detection.service.ts`
- **Lines:** 58-61
- **Issue:** `isProcessing` flag prevents concurrent polls
- **Impact:** Long-running poll delays next check

**6.4 No Message Limit on IMAP Fetch**
- **File:** `server/services/reply-detection.service.ts`
- **Lines:** 142-145
- **Issue:** `imap.fetch(results, ...)` fetches ALL unread
- **Impact:** 1000 unread emails = memory spike, slow processing

---

## 7. AI PERSONALIZATION PIPELINE

### Hard Limits
| Limit | Value | File | Line |
|-------|-------|------|------|
| AI timeout | 30 seconds | `server/config/email-volume.config.ts` | 47 |
| AI concurrent requests | 3-50 (by preset) | `server/config/email-volume.config.ts` | 46,61,76,91 |
| GPT-4 rate | ~500 req/min | `server/config/email-volume.config.ts` | 12 |
| GPT-3.5 rate | ~3500 req/min | `server/config/email-volume.config.ts` | 13 |

### Risk Hotspots

**7.1 Fallback Chain Latency**
- **File:** `server/services/openai-helper.ts`
- **Lines:** 66-130
- **Issue:** OpenAI → OpenRouter → Anthropic fallback on failure
- **Impact:** Worst case: 3 API calls × timeout = 90 seconds

**7.2 Single Prospect AI Generation**
- **File:** `server/services/enhanced-personalization.service.ts`
- **Lines:** 28-89
- **Issue:** Each call generates for 1 prospect, no batching
- **Impact:** 100 prospects × 2s/call = 200+ seconds

**7.3 Content Library Fetch Per Request**
- **File:** `server/services/enhanced-personalization.service.ts`
- **Lines:** 43-44
- **Issue:** `storage.getContentLibraryItems()` called per personalization
- **Impact:** Redundant DB queries, no caching

---

## Priority Action Items for Load Testing

### Immediate Concerns (Test First)
1. **Prospect Enrollment N+1** - Test with 1000+ prospects
2. **CSV Upload Without Redis** - Test with 10MB, 25MB, 50MB files
3. **Email Queue Sequential Processing** - Test 50+ emails/cycle

### Indexes to Add Before Testing
```sql
CREATE INDEX IF NOT EXISTS sequence_prospects_prospect_id_idx ON sequence_prospects(prospect_id);
CREATE INDEX IF NOT EXISTS sequence_prospects_sequence_id_idx ON sequence_prospects(sequence_id);
CREATE INDEX IF NOT EXISTS sequence_prospects_status_idx ON sequence_prospects(status);
CREATE INDEX IF NOT EXISTS sequences_user_id_idx ON sequences(user_id);
CREATE INDEX IF NOT EXISTS sequence_steps_sequence_id_idx ON sequence_steps(sequence_id);
CREATE INDEX IF NOT EXISTS email_queue_prospect_id_idx ON email_queue(prospect_id);
```

### Bottleneck Summary

| Operation | Theoretical Max | Likely Bottleneck |
|-----------|-----------------|-------------------|
| CSV Import | 50MB/100k rows | Memory + sync processing |
| Enrichment | 1000/batch | 200ms delay + API limits |
| Enrollment | No limit | 5000+ queries for 1000 prospects |
| Email Send | 5000/day (medium) | 10s delay + sequential loop |
| Reply Check | 1/20s | Sequential mailboxes + IMAP blocking |
| AI Personalization | 500 req/min | Single-prospect calls + fallback chain |

---

## Next Steps: Phase 2 Automated Load Tests

Create autocannon scripts targeting:
1. `POST /api/import/csv` - File size limits
2. `POST /api/jobs/enrichment` - Concurrent enrichment
3. `POST /api/sequences` - Sequence creation rate
4. `POST /api/sequences/:id/enroll` - Enrollment throughput
5. Email queue processor - Send rate verification
6. Reply detection - Ingestion SLA (30s target)
7. AI personalization endpoint - Full flow timing
