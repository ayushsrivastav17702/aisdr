# Background Process Testing Limitations

## Processes That Cannot Be Load Tested via HTTP API

The following processes run as background jobs and cannot be directly invoked via HTTP:

### 1. Email Send Queue Processing
- **Location**: `email-queue.service.ts:processPendingEmails()`
- **Trigger**: Polling interval or BullMQ worker
- **Bottleneck**: Sequential processing of 50-email batches with 3 dedup queries each
- **What we CAN test**: Queue ADD rate (POST /api/email-queue)
- **What we CANNOT test**: Actual SMTP sending throughput

### 2. Reply Ingestion (IMAP Polling)
- **Location**: `reply-detection.service.ts:checkForReplies()`
- **Trigger**: 20-second polling interval via setInterval
- **Bottleneck**: Sequential mailbox processing (10 mailboxes × 5s = 50s > 20s interval)
- **What we CAN test**: Reply list query performance (GET /api/replies)
- **What we CANNOT test**: IMAP connection/parsing throughput

### 3. Automation Worker
- **Location**: `automation-worker.ts:processAutomationJob()`
- **Trigger**: BullMQ job queue
- **Bottleneck**: 3 concurrent workers, sequential prospect enrollment per job
- **What we CAN test**: Automation RUN creation (POST /api/automations)
- **What we CANNOT test**: Actual worker processing throughput

## How to Test Background Processes

### Option 1: Database Metrics
Monitor PostgreSQL during load tests:
```sql
-- Query count per table during test
SELECT schemaname, relname, seq_scan, seq_tup_read, idx_scan, idx_tup_fetch
FROM pg_stat_user_tables
WHERE relname IN ('email_queue', 'email_replies', 'automation_runs');
```

### Option 2: Application Logs
Grep server logs for processing timing:
```bash
grep -E "(processPendingEmails|checkForReplies|processAutomation)" server.log
```

### Option 3: Custom Instrumentation
Add timing metrics to services:
```typescript
console.time('processPendingEmails');
// ... processing
console.timeEnd('processPendingEmails');
```

### Option 4: Queue Depth Monitoring (Redis)
If using Redis/BullMQ:
```bash
redis-cli LLEN bull:automation:wait
redis-cli LLEN bull:import:wait
redis-cli LLEN bull:enrichment:wait
```

## Recommended Capacity Testing Strategy

1. **API Layer**: Use autocannon scripts (tests/load/*.js)
2. **Background Layer**: Monitor queue depth + processing logs during API load
3. **Database Layer**: Track pg_stat_statements query counts
4. **End-to-End**: Seed data → Run automations → Monitor until completion

## Risk Assessment for Background Processes

| Process | Current Limit | Breaking Point | Failure Mode |
|---------|---------------|----------------|--------------|
| Email Queue | 50 emails/batch | Queue depth > 1000 | Delayed sends |
| Reply Ingestion | 20s interval | >10 mailboxes | Missed poll cycles |
| Automation | 3 workers | Queue depth grows | Job backlog |
| AI Personalization | 10 concurrent | Rate limit (429) | Fallback to template |
