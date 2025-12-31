# User Role Load Tests

Autocannon-based load tests for capacity discovery of User (SDR) role API endpoints.

## Prerequisites

1. **Install autocannon** (already in package.json):
   ```bash
   npm install autocannon
   ```

2. **Get auth cookie**:
   - Log in to the app in browser
   - Open DevTools → Application → Cookies
   - Copy the `connect.sid` cookie value
   - Export it: `export AUTH_COOKIE='connect.sid=s%3A...'`

3. **Set test parameters**:
   ```bash
   export BASE_URL='http://localhost:5000'  # Default
   export TEST_SEQUENCE_ID='your-sequence-uuid'  # For enrollment test
   ```

## Test Configurations

Each test supports 4 configurations:

| Config | Concurrency | Duration | Purpose |
|--------|-------------|----------|---------|
| `baseline` | 1 | 30s | Normal operation |
| `medium` | 3-10 | 60s | Moderate load |
| `stress` | 5-25 | 60s | High load |
| `breakpoint` | 10-50 | 120s | Find limits |

## Running Tests

### Individual Tests

```bash
cd tests/load

# Baseline
node 01-prospect-upload.js baseline

# Medium load
node 04-prospect-enrollment.js medium

# Stress test
node 05-email-send.js stress

# Find breakpoint
node 08-analytics.js breakpoint
```

### All Tests

```bash
chmod +x run-all.sh
./run-all.sh baseline
./run-all.sh medium
./run-all.sh stress
```

## Test Matrix

| # | Test | Endpoint | Key Metric |
|---|------|----------|------------|
| 01 | Prospect Upload | POST /api/prospects/import | Prospects/request |
| 02 | AI Enrichment | POST /api/enrich | Batch enrichment rate |
| 03 | Sequence Creation | POST /api/sequences | Sequences/user |
| 04 | Prospect Enrollment | POST /api/sequences/:id/enroll | Prospects/sequence |
| 05 | Email Queue Add | POST /api/email-queue (or GET analytics fallback) | Queue add rate |
| 06 | AI Personalization | POST /api/ai/personalize | Full flow latency |
| 07 | Reply List Query | GET /api/replies | Query response time |
| 08 | Analytics Overview | GET /api/analytics/overview | Aggregation speed |

## Important Notes

- **Tests require real data**: For meaningful results, set env vars with real IDs
- **Background processes**: Email sending and reply ingestion run via BullMQ/polling, not API
- **Rate limits**: Some tests hit actual rate-limited services (AI, SMTP)

## Pass/Fail Criteria

| Test | p95 Latency | Error Rate | Notes |
|------|-------------|------------|-------|
| Prospect Upload | < 5s | 0% | Returns 202 (async) |
| AI Enrichment | < 30s | < 5% | External API dependent |
| Sequence Creation | < 1s | 0% | Simple DB insert |
| Prospect Enrollment | < 5s | < 1% | P0-optimized (5 queries) |
| Email Queue Add | < 2s | < 5% | Dedup checks add latency |
| AI Personalization | < 30s | > 80% success | AI timeout is 30s |
| Reply List Query | < 2s | < 5% | Read-only DB query |
| Analytics Overview | < 3s | 0% | Aggregation queries |

## Interpreting Results

### Key Metrics

- **p50/p95/p99 latency**: Response time percentiles
- **Requests/sec**: Throughput
- **Errors**: Connection failures
- **Timeouts**: Requests exceeding timeout
- **2xx/Non-2xx**: HTTP response codes

### Red Flags

- p95 > expected → bottleneck found
- Errors increasing with concurrency → resource exhaustion
- Timeouts → deadlocks or infinite loops
- Non-2xx codes → API failures under load

## Known Limits (from Code Review)

| Resource | Limit | Source |
|----------|-------|--------|
| Automation workers | 3 concurrent | automation-worker.ts:9 |
| Email batch size | 50 | email-queue.service.ts:319 |
| Reply poll interval | 20s | reply-detection.service.ts:33 |
| AI timeout | 30s | email-volume.config.ts |
| Daily email limit | 5000 | email-volume.config.ts:63 |
| Enrichment delay | 200ms | enrichment-waterfall.service.ts:213 |

## Phase 3: Capacity Discovery

After running tests, document findings in `docs/CAPACITY-RESULTS.md`:

```markdown
| Test | Baseline | Medium | Stress | Breakpoint |
|------|----------|--------|--------|------------|
| Prospect Upload | p95: Xms | p95: Xms | p95: Xms | FAILS AT: X concurrent |
| ... | ... | ... | ... | ... |
```
