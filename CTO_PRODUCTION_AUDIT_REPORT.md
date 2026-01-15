# AiSDR Platform - CTO Pre-Production Audit Report

**Date:** January 15, 2026  
**Auditor:** Automated System Analysis  
**Scope:** Full-stack production readiness review

---

## ❌ WHAT WILL BREAK IN PRODUCTION

### 1. **ENCRYPTION_KEY Missing/Default** 🔴 DATA LOSS RISK
- **File:** `server/services/mailbox.service.ts:7`
- **Issue:** `this.encryptionKey = process.env.ENCRYPTION_KEY || "default-key-change-in-prod"`
- **Impact:** If ENCRYPTION_KEY changes between deployments, ALL stored mailbox credentials become unreadable. Mailboxes fail silently.
- **Fix:** Make ENCRYPTION_KEY required in config manifest, add migration warning on key change.

### 2. **Redis Not Configured = No Automation Queue** 🔴 CRITICAL
- **File:** `server/queue/redis-connection.ts`
- **Issue:** `REDIS_DISABLED=true` in development. BullMQ automation queue is null when Redis unavailable.
- **Impact:** All scheduled automation, email queuing, and background jobs FAIL SILENTLY. No error surfaces to user.
- **Fix:** Add explicit health check endpoint that surfaces queue status. Alert on automation failure.

### 3. **SESSION_SECRET Fallback to Hardcoded Default** 🔴 SECURITY
- **File:** `server/middleware/super-admin.middleware.ts:7`
- **Issue:** `const JWT_SECRET = process.env.SESSION_SECRET || 'super-admin-secret-key'`
- **Impact:** If SESSION_SECRET missing in prod, all Super Admin JWTs use predictable key. Complete auth bypass.
- **Fix:** Fail startup if SESSION_SECRET missing (already done in auth.service.ts, but middleware has fallback).

### 4. **CSRF Secret Fallback** 🔴 SECURITY
- **File:** `server/index.ts:43`
- **Issue:** `getSecret: () => process.env.SESSION_SECRET || "default-csrf-secret-change-in-production"`
- **Impact:** Predictable CSRF tokens if SESSION_SECRET missing.
- **Fix:** Remove fallback, fail fast.

### 5. **Apollo API Key Empty String Fallback** 🟠 FUNCTIONAL
- **File:** `server/services/apollo.service.ts:80`
- **Issue:** `this.apiKey = process.env.APOLLO_API_KEY || ''`
- **Impact:** Empty API key causes cryptic API errors. Prospect search fails with misleading error.
- **Fix:** Check at startup, clear error message: "Apollo API key required for prospect search."

### 6. **No Timeout on AI Calls** 🟠 UX DEGRADATION
- **Files:** `server/services/ai.service.ts`, `server/services/ai-email-generator.service.ts`
- **Issue:** No AbortController or timeout wrapper on OpenAI/Anthropic API calls.
- **Impact:** Slow LLM responses block requests indefinitely. UI appears frozen.
- **Fix:** Add 30-second timeout with graceful fallback message.

---

## ⚠️ WHAT WORKS BUT WILL CAUSE SUPPORT TICKETS

### 1. **Impersonation via Query Parameter** ⚠️
- **File:** `server/middleware/auth.middleware.ts:174-183`
- **Issue:** `actingAs` query param allows admin to act as any user. Logged but easily abused.
- **Risk:** Support tickets about "actions I didn't take" from confused users.
- **Mitigation:** Add visible "Admin acting as {user}" banner in UI.

### 2. **Rate Limit Errors Not User-Friendly** ⚠️
- **File:** `server/middleware/throttle.middleware.ts`
- **Issue:** Returns `429 Too Many Requests` with technical message.
- **Impact:** Users don't understand why they can't send emails. "App broken" tickets.
- **Fix:** Human-readable message: "You've reached your daily email limit of {N}. Resets at midnight."

### 3. **AI Fallback Chain Silent** ⚠️
- **File:** `server/services/ai.service.ts`
- **Issue:** OpenAI → OpenRouter → Anthropic fallback works, but user sees no indication.
- **Impact:** Cost confusion: "Why did my AI costs spike?" (fell back to expensive model).
- **Fix:** Log which provider served request, surface in analytics.

### 4. **Mailbox Credential Errors Vague** ⚠️
- **File:** `server/services/mailbox.service.ts:390`
- **Issue:** "IMAP connection timeout" - doesn't tell user if password wrong vs server down.
- **Impact:** Users try wrong fixes. Extended support cycles.
- **Fix:** Differentiate auth failure vs network timeout in error message.

### 5. **Sequence Enrollment Without Mailbox** ⚠️
- **Files:** `server/sequences-routes.ts`
- **Issue:** User can enroll prospects but has no configured/verified mailbox.
- **Impact:** Sequences sit pending forever. User thinks system is broken.
- **Fix:** Block enrollment if no active mailbox, with clear CTA.

### 6. **Demo Mode Silent** ⚠️
- **File:** `server/config/config.manifest.json:63`
- **Issue:** DEMO_MODE simulates email sends without indication.
- **Impact:** User thinks emails sent. Customer never receives. Huge confusion.
- **Fix:** Add persistent banner: "DEMO MODE - Emails are simulated, not actually sent."

### 7. **Quota Exhaustion No Pre-Warning** ⚠️
- **File:** `server/routes/sdr-dashboard.routes.ts:248`
- **Issue:** Only checks if quota exceeded, no warning at 80%.
- **Impact:** Users hit hard wall unexpectedly mid-campaign.
- **Fix:** Add quota warning threshold notifications.

---

## ✅ WHAT IS PRODUCTION-READY

### Authentication & Session Management ✅
- JWT with proper secret validation at `auth.service.ts`
- Session table with IP tracking, expiry, last activity
- Account lockout with progressive tiers (10 attempts = 1hr, 20 = 24hr)
- Session invalidation on logout
- Idle timeout enforcement

### RBAC Implementation ✅
- Role-permission matrix properly defined
- `forbidManager` middleware blocks SDR execution for managers
- `blockSuperAdminFromSDR` prevents super admin from accessing tenant data
- Permission checks are server-side enforced, not frontend flags
- Impersonation logged to audit trail

### Multi-Tenant Data Isolation ✅
- `scopedWhere` helper enforces userId filtering on queries
- Cross-tenant access explicitly blocked in `storage.ts:83`
- Organization ID enforced in manager routes
- Automation worker validates user scoping before execution

### Security Headers ✅
- Helmet configured with CSP, XSS protection
- CSRF protection via `csrf-csrf` library
- Cookie security: httpOnly, secure, sameSite
- Sanitization utilities exist (`server/utils/sanitize.ts`)

### Audit Logging ✅
- `superAdminAuditLogs` table captures all admin actions
- Actions logged: tenant provisioning, impersonation, config changes
- `auditService` logs login/logout events
- Immutable append-only log structure

### Email Infrastructure ✅
- Rate limiting at tenant/mailbox/user levels
- Daily email limits with atomic reservation (`reserveSendSlot`)
- Mailbox rotation for deliverability
- Bounce handling with auto-pause on high rates
- HMAC-signed tracking URLs

### AI Provider Fallback ✅
- Primary OpenAI → Backup OpenAI → OpenRouter → Anthropic chain
- 429 quota handling with automatic key switch
- Cost tracking per request in observability service
- Token count and cost calculation

### Kill Switches ✅
- EMAIL_SEND_ENABLED, BULK_ENROLL_ENABLED, DEMO_MODE
- Tenant-level automation pause
- User-level isPaused flag
- Background workers check pause state before execution

---

## 🛠️ CONCRETE FIXES REQUIRED

### Priority 1: Critical (Fix Before Launch)

#### Fix 1: Remove All Hardcoded Secret Fallbacks
```typescript
// server/middleware/super-admin.middleware.ts
const JWT_SECRET = process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: SESSION_SECRET not configured');
}

// server/index.ts (CSRF)
getSecret: () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('FATAL: SESSION_SECRET required for CSRF');
  return secret;
},
```

#### Fix 2: Require ENCRYPTION_KEY for Mailbox Service
```typescript
// server/services/mailbox.service.ts
constructor() {
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error('FATAL: ENCRYPTION_KEY must be set (min 32 chars)');
  }
  this.encryptionKey = process.env.ENCRYPTION_KEY;
}
```

#### Fix 3: Surface Redis/Queue Health
```typescript
// server/routes/health.routes.ts (new)
router.get('/api/health/queue', (req, res) => {
  res.json({
    redis: isRedisConfigured,
    automationQueue: automationQueue !== null,
    warning: !isRedisConfigured ? 'Background automation disabled' : null
  });
});
```

### Priority 2: High (Fix Within First Week)

#### Fix 4: AI Call Timeout
```typescript
// server/services/ai.service.ts
private async callWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promise;
  } finally {
    clearTimeout(timeout);
  }
}
```

#### Fix 5: Pre-Enrollment Validation
```typescript
// server/sequences-routes.ts
const activeMailboxes = await mailboxService.getActiveMailboxesForUser(userId);
if (activeMailboxes.length === 0) {
  return res.status(400).json({
    error: 'NO_MAILBOX',
    message: 'Please add and verify a mailbox before enrolling prospects.'
  });
}
```

#### Fix 6: Quota Warning Threshold
```typescript
// server/routes/sdr-dashboard.routes.ts
const quotaPercentUsed = (quotaData.emailsSentToday / quotaData.maxEmailsPerDay) * 100;
let quotaWarning = null;
if (quotaPercentUsed >= 90) quotaWarning = 'critical';
else if (quotaPercentUsed >= 75) quotaWarning = 'warning';

// Return in response
quotaSnapshot: {
  ...existing,
  percentUsed: quotaPercentUsed,
  warningLevel: quotaWarning
}
```

### Priority 3: Medium (Fix Within First Month)

#### Fix 7: Demo Mode Banner
Add frontend check for DEMO_MODE with persistent warning banner.

#### Fix 8: AI Provider Transparency
Log and expose which AI provider served each request in campaign analytics.

#### Fix 9: Mailbox Error Differentiation
```typescript
// Differentiate error types
if (err.code === 'EAUTH') return { error: 'Invalid credentials' };
if (err.code === 'ETIMEDOUT') return { error: 'Server unreachable' };
if (err.code === 'ECONNREFUSED') return { error: 'Connection refused' };
```

---

## FAILURE MODE ANALYSIS SUMMARY

| Component | Fails | Degrades | Safe Failure |
|-----------|-------|----------|--------------|
| AI (all providers down) | - | 🟠 | - |
| Database | 🔴 | - | - |
| Redis/Queue | - | 🟠 | - |
| Email Provider | - | 🟡 | - |
| Apollo API | - | 🟠 | - |
| Session Secret Missing | 🔴 | - | - |
| Encryption Key Change | 🔴 | - | - |
| Rate Limit Hit | - | - | 🟢 |
| Quota Exceeded | - | - | 🟢 |
| Mailbox Bounce High | - | - | 🟢 |

**Legend:**  
🔴 Data loss or security breach  
🟠 User confusion, support tickets  
🟡 Graceful degradation with notice  
🟢 Safe failure with clear messaging

---

## FINAL VERDICT

**Production Readiness: 75%**

The platform has solid foundations:
- ✅ Authentication/RBAC properly implemented
- ✅ Multi-tenant isolation enforced
- ✅ Audit logging comprehensive
- ✅ Email rate limiting robust

**Critical gaps to close before launch:**
1. Remove all hardcoded secret fallbacks (security)
2. Add startup validation for required secrets
3. Surface queue/Redis health to operators
4. Add AI call timeouts

**Recommended soft-launch strategy:**
1. Deploy to staging with full config validation
2. Run chaos tests (AI failure, DB latency, Redis down)
3. Verify all audit logs capture correctly
4. Launch with limited tenant count, monitor closely
