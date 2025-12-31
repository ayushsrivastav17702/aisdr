# Capacity Test Results - Phase 3

**Date**: 2025-12-31  
**Environment**: Development (Replit)  
**Database**: PostgreSQL (Neon)  
**Auth User**: shyama.gupta@global.increff.com  
**Tool**: autocannon v8.0.0  

---

## Executive Summary

| Endpoint | Concurrency | Req/sec | p50 (ms) | p97.5 (ms) | p99 (ms) | Status |
|----------|-------------|---------|----------|------------|----------|--------|
| GET /api/analytics/overview | 1 | 4.6 | 207 | 257 | 284 | ✅ PASS |
| GET /api/analytics/overview | 10 | 46.0 | 203 | 318 | 419 | ✅ PASS |
| GET /api/analytics/overview | 25 | 53.4 | 251 | 2331 | 3044 | ⚠️ DEGRADE |
| GET /api/replies | 1 | 97.6 | 6 | 41 | 54 | ✅ PASS |
| GET /api/replies | 10 | 187.2 | 45 | 118 | 138 | ✅ PASS |
| GET /api/replies | 25 | 206.8 | 111 | 214 | 241 | ✅ PASS |
| GET /api/prospects | 10 | 58.7 | 116 | 736 | 805 | ⚠️ DEGRADE |
| GET /api/sequences | 10 | 43.1 | 117 | 1106 | 1253 | ⚠️ DEGRADE |
| GET /api/email-analytics/performance | 10 | 26.6 | 231 | 1654 | 2229 | ⚠️ DEGRADE |

### Key Findings

1. **Reply List is the fastest endpoint**: 206 req/s at 25 concurrent, p99 < 250ms
2. **Analytics Overview degrades at 25+ concurrent**: p97.5 jumps from 318ms to 2331ms
3. **Sequences List has high variability**: p99 > 1s at 10 concurrent
4. **Email Analytics is slowest**: 26.6 req/s, p99 > 2s at 10 concurrent

---

## Detailed Test Results

### Test 08: Analytics Overview (GET /api/analytics/overview)

#### Baseline (1 concurrent, 30s)
- **Requests/sec**: 4.64
- **Latency p50**: 207ms
- **Latency p97.5**: 257ms
- **Latency p99**: 284ms
- **2xx responses**: 139/139 (100%)
- **Result**: ✅ PASS

#### Medium (10 concurrent, 60s)
- **Requests/sec**: 46.04
- **Latency p50**: 203ms
- **Latency p97.5**: 318ms
- **Latency p99**: 419ms
- **2xx responses**: 2762/2762 (100%)
- **Result**: ✅ PASS

#### Stress (25 concurrent, 60s)
- **Requests/sec**: 53.39
- **Latency p50**: 251ms
- **Latency p97.5**: 2331ms ⚠️
- **Latency p99**: 3044ms ⚠️
- **2xx responses**: 3203/3203 (100%)
- **Result**: ⚠️ DEGRADED (p99 > 3s)

---

### Test 07: Reply List (GET /api/replies?limit=50)

#### Baseline (1 concurrent, 30s)
- **Requests/sec**: 97.60
- **Latency p50**: 6ms
- **Latency p97.5**: 41ms
- **Latency p99**: 54ms
- **2xx responses**: 2928/2928 (100%)
- **Throughput**: 4.5 MB/s
- **Result**: ✅ PASS

#### Medium (10 concurrent, 60s)
- **Requests/sec**: 187.22
- **Latency p50**: 45ms
- **Latency p97.5**: 118ms
- **Latency p99**: 138ms
- **2xx responses**: 11233/11233 (100%)
- **Throughput**: 8.7 MB/s
- **Result**: ✅ PASS

#### Stress (25 concurrent, 60s)
- **Requests/sec**: 206.77
- **Latency p50**: 111ms
- **Latency p97.5**: 214ms
- **Latency p99**: 241ms
- **2xx responses**: 12406/12406 (100%)
- **Throughput**: 9.6 MB/s
- **Result**: ✅ PASS

---

### Additional Endpoints (Medium Load - 10 concurrent, 30s)

#### Prospects List (GET /api/prospects)
- **Requests/sec**: 58.67
- **Latency p50**: 116ms
- **Latency p97.5**: 736ms
- **Latency p99**: 805ms
- **Total requests**: 2k
- **Result**: ⚠️ DEGRADED (p97.5 > 500ms)

#### Sequences List (GET /api/sequences)
- **Requests/sec**: 43.10
- **Latency p50**: 117ms
- **Latency p97.5**: 1106ms
- **Latency p99**: 1253ms
- **Total requests**: 1k
- **Result**: ⚠️ DEGRADED (p97.5 > 1s)

#### Email Analytics Performance (GET /api/email-analytics/performance)
- **Requests/sec**: 26.64
- **Latency p50**: 231ms
- **Latency p97.5**: 1654ms
- **Latency p99**: 2229ms
- **Total requests**: 809
- **Result**: ⚠️ DEGRADED (p99 > 2s)

---

## Bottleneck Analysis

### Identified Bottlenecks (Ranked by Severity)

| Rank | Bottleneck | Endpoint | Evidence | Root Cause |
|------|------------|----------|----------|------------|
| 1 | **Email Analytics Aggregation** | GET /api/email-analytics/performance | 26 req/s, p99 2.2s | Complex JOINs + aggregations |
| 2 | **Sequences List Query** | GET /api/sequences | 43 req/s, p99 1.2s | N+1 or missing indexes |
| 3 | **Analytics Overview at Scale** | GET /api/analytics/overview | p99 jumps 10x at 25 concurrent | Connection pool saturation |
| 4 | **Prospects List** | GET /api/prospects | p97.5 736ms | Large response payload |

### POST Endpoints (Not Tested - CSRF Protected)

The following write endpoints require CSRF tokens and could not be load tested via autocannon:

- POST /api/sequences (create)
- POST /api/sequences/:id/enroll
- POST /api/enrich
- POST /api/email-queue
- POST /api/prospects/import

**Recommendation**: Add CSRF bypass for load testing environment or test via integration tests.

### Background Processes (Not Testable via HTTP)

As documented in `tests/load/BACKGROUND_PROCESSES.md`:

- **Email Send Queue**: Sequential 50-email batches, 3 dedup queries each
- **Reply Ingestion**: Sequential IMAP polling, 20s interval
- **Automation Workers**: 3 concurrent BullMQ workers

---

## Capacity Limits (Observed)

| Resource | Safe Limit | Breaking Point | Recommendation |
|----------|------------|----------------|----------------|
| Concurrent API requests | 10 | 25+ | Add caching for analytics |
| Reply list queries/sec | 200 | Unknown | No action needed |
| Analytics queries | 5/sec | 50/sec (degraded) | Add result caching |
| Email analytics | 3/sec | 25/sec (> 2s) | Pre-compute aggregates |

---

## Recommended Optimizations (Priority Order)

1. **Add indexes** (from CAPACITY-RISK-REVIEW.md):
   - `sequence_prospects(prospect_id, sequence_id, status)`
   - `email_queue(prospect_id, sequence_id, step_order, status)`
   - `sequences(user_id)`

2. **Cache analytics results**: 30-60s TTL for dashboard aggregations

3. **Paginate prospects/sequences**: Reduce payload size

4. **Pre-compute email analytics**: Daily aggregation job

---

## Test Configuration Details

```bash
# Environment Variables
AUTH_TOKEN="Bearer <jwt>"
BASE_URL="http://localhost:5000"

# Test Progression
- Baseline: 1 concurrent, 30s
- Medium: 10 concurrent, 60s
- Stress: 25 concurrent, 60s
- Breakpoint: 50 concurrent, 120s (not executed due to degradation at 25)
```
