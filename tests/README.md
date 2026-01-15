# AiSDR Test Suite

Comprehensive automated test suite for the AiSDR platform.

## Quick Start

```bash
# Run all tests
./tests/run-tests.sh all

# Run critical tests (deployment blockers)
./tests/run-tests.sh critical

# Run tests in watch mode
./tests/run-tests.sh watch

# Run with coverage
./tests/run-tests.sh coverage
```

## Test Categories

| Category | Command | Description | Deployment Blocker |
|----------|---------|-------------|-------------------|
| Auth | `./tests/run-tests.sh auth` | Authentication & session tests | ✅ |
| Data Isolation | `./tests/run-tests.sh data-isolation` | Cross-tenant access prevention | ✅ |
| Security | `./tests/run-tests.sh security` | Prompt injection, PII, XSS, SQL injection | ✅ |
| User | `./tests/run-tests.sh user` | SDR user role, onboarding, campaigns | |
| Manager | `./tests/run-tests.sh manager` | Manager role, approvals, metrics | |
| Super Admin | `./tests/run-tests.sh super-admin` | Platform governance, audit logs | |
| AI | `./tests/run-tests.sh ai` | AI generation, timeout, guardrails | |
| Email | `./tests/run-tests.sh email` | Email execution, retries, batches | |
| Chaos | `./tests/run-tests.sh chaos` | DB failures, rate limits, recovery | |
| UX | `./tests/run-tests.sh ux` | Silent failures, false success | |
| Performance | `./tests/run-tests.sh performance` | Response time benchmarks | |

## Test Structure

```
tests/
├── fixtures/           # Shared utilities and mocks
│   ├── test-utils.ts   # User/org creation, auth helpers
│   ├── api-client.ts   # HTTP request helpers
│   ├── mock-services.ts # AI, Email, DB mocks
│   └── setup.ts        # Global test setup
├── auth/               # TC-AUTH-*, TC-LOGIN-*
├── data-isolation/     # TC-DATA-*
├── user/               # TC-USER-ONB-*, TC-CAMP-*
├── ai/                 # TC-AI-*
├── email/              # TC-SEND-*
├── manager/            # TC-MGR-*
├── super-admin/        # TC-SA-*
├── security/           # TC-SEC-*
├── chaos/              # TC-CHAOS-*
├── ux/                 # TC-UX-*
└── performance/        # Performance benchmarks
```

## CI/CD Integration

### Deployment Blocking

Tests in these categories block deployment if they fail:
- Auth tests (TC-AUTH-*)
- Data isolation tests (TC-DATA-*)
- Security tests (TC-SEC-*)
- AI context guardrail (TC-AI-03)
- Super admin audit logs (TC-SA-02)

### GitHub Actions

See `ci/github-actions.yml` for the complete CI pipeline.

```yaml
# Critical tests run first
- name: Run Critical Tests
  run: ./tests/run-tests.sh critical

# Deployment gate enforces pass/fail
- name: Deployment Gate
  if: needs.critical-tests.result == 'failure'
  run: exit 1
```

## Load Testing with k6

```bash
# Install k6
# macOS: brew install k6
# Linux: See https://k6.io/docs/getting-started/installation

# Run load tests
k6 run k6/load-test.js \
  --env BASE_URL=http://localhost:5000 \
  --env AUTH_TOKEN=your-token
```

## API Testing with Postman/Newman

```bash
# Install Newman
npm install -g newman newman-reporter-htmlextra

# Run API tests
newman run postman/aisdr-api-tests.json \
  --environment postman/test-environment.json \
  --reporters cli,htmlextra
```

## Test Coverage Thresholds

| Metric | Threshold |
|--------|-----------|
| Statements | 70% |
| Branches | 60% |
| Functions | 70% |
| Lines | 70% |

## Writing New Tests

### Test File Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  createTestUser,
  createTestOrganization,
  loginTestUser,
  cleanupTestUser,
  cleanupTestOrg,
  API_BASE,
  authHeader,
  TestUser,
  TestOrg,
} from "../fixtures/test-utils";

describe("TC-XXX: Feature Name", () => {
  let testOrg: TestOrg;
  let testUser: TestUser;
  
  beforeAll(async () => {
    testOrg = await createTestOrganization("feature-test-org");
    testUser = await createTestUser({ role: "user", organizationId: testOrg.id });
    testUser = await loginTestUser(testUser);
  });
  
  afterAll(async () => {
    await cleanupTestUser(testUser.id);
    await cleanupTestOrg(testOrg.id);
  });

  it("should do something specific", async () => {
    const response = await request(API_BASE)
      .get("/api/endpoint")
      .set(authHeader(testUser.token!));
    
    expect(response.status).toBe(200);
  });
});
```

### Test Naming Convention

- `TC-AUTH-*` - Authentication tests
- `TC-DATA-*` - Data isolation tests
- `TC-LOGIN-*` - Login flow tests
- `TC-USER-ONB-*` - User onboarding tests
- `TC-CAMP-*` - Campaign tests
- `TC-AI-*` - AI generation tests
- `TC-SEND-*` - Email sending tests
- `TC-MGR-*` - Manager role tests
- `TC-SA-*` - Super admin tests
- `TC-SEC-*` - Security tests
- `TC-CHAOS-*` - Chaos/failure tests
- `TC-UX-*` - UX failure tests
- `TC-LOAD-*` - Load/performance tests

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-key

# Optional for AI tests
OPENAI_API_KEY=sk-...

# Test-specific
TEST_EMAIL=test@example.com
TEST_PASSWORD=TestPassword123!
STAGING_URL=https://staging.example.com
```

## Troubleshooting

### Tests timing out
- Increase `testTimeout` in `vitest.config.ts`
- Check database connection

### Auth tests failing
- Ensure `SESSION_SECRET` is set
- Check database has test user data

### AI tests failing
- Set `OPENAI_API_KEY` or tests will use fallback mode
- Check rate limits haven't been hit
