# Production Monitoring Setup Guide

**Last Updated:** November 19, 2025  
**Platform:** AI-Powered SDR Platform  
**Monitoring Stack:** Sentry + UptimeRobot + K6

---

## 🎯 Overview

This guide walks you through setting up production-grade monitoring for the AI-Powered SDR Platform, including:

1. **Error Tracking** - Sentry for backend/frontend error monitoring
2. **Uptime Monitoring** - UptimeRobot for availability checks
3. **Load Testing** - K6 for performance validation
4. **Email Deliverability** - DKIM/SPF/DMARC configuration

---

## 1️⃣ SENTRY SETUP (Error Tracking)

### Prerequisites
- Sentry account (free tier available at https://sentry.io)
- Access to Replit Secrets

### Steps

#### **Step 1: Create Sentry Project**

1. Go to https://sentry.io and sign up/login
2. Create a new project:
   - Platform: **Node.js**
   - Project name: **AI SDR Platform - Backend**
3. Copy the **DSN** (looks like: `https://xxxxx@o123456.ingest.sentry.io/123456`)

#### **Step 2: Add Sentry DSN to Replit Secrets**

1. In Replit, open your project
2. Click **Tools** → **Secrets**
3. Add the following secrets:

```bash
# Backend Sentry DSN
SENTRY_DSN=https://xxxxx@o123456.ingest.sentry.io/123456

# Frontend Sentry DSN (create separate project for frontend)
VITE_SENTRY_DSN=https://yyyyy@o123456.ingest.sentry.io/654321

# Optional: Release version for tracking
RELEASE=sdr-platform@1.0.0
```

#### **Step 3: Verify Installation**

The Sentry code is already integrated. After adding the DSN, restart your app:

```bash
# Check backend logs for:
✅ Sentry initialized for backend error monitoring

# Check browser console for:
✅ Sentry initialized for frontend error monitoring
```

If you see `⚠️ Sentry DSN not configured`, double-check your secrets.

#### **Step 4: Configure Alerts**

1. In Sentry dashboard, go to **Alerts** → **Create Alert Rule**
2. Create the following alerts:

**Alert 1: Error Rate > 1%**
- Condition: `error.rate > 1%` in 5 minutes
- Actions: Email + Slack notification
- Severity: High

**Alert 2: New Issue Detected**
- Condition: New issue first seen
- Actions: Email + Slack notification
- Severity: Medium

**Alert 3: Unhandled Errors**
- Condition: `error.handled == false`
- Actions: Email + Slack notification
- Severity: Critical

#### **Step 5: Slack Integration (Optional)**

1. In Sentry, go to **Settings** → **Integrations**
2. Search for **Slack** and click **Install**
3. Authorize Sentry to access your Slack workspace
4. Choose channel (e.g., `#engineering-alerts`)
5. Test the integration

---

## 2️⃣ UPTIMEROBOT SETUP (Uptime Monitoring)

### Prerequisites
- UptimeRobot account (free tier: https://uptimerobot.com)
- Your app URL (e.g., `https://your-app.replit.app`)

### Steps

#### **Step 1: Create Monitors**

1. Login to UptimeRobot
2. Click **+ Add New Monitor**

**Monitor 1: Health Check Endpoint**
- Monitor Type: **HTTP(s)**
- Friendly Name: `SDR Platform - Health Check`
- URL: `https://your-app.replit.app/healthz`
- Monitoring Interval: **5 minutes** (free tier) or **1 minute** (paid)
- Monitor Timeout: 30 seconds
- HTTP Method: GET
- Keyword:
  - Type: **Keyword Exists**
  - Value: `"status":"ok"`
- Alert Contacts: Add your email/Slack

**Monitor 2: Main Application**
- Monitor Type: **HTTP(s)**
- Friendly Name: `SDR Platform - Web App`
- URL: `https://your-app.replit.app`
- Monitoring Interval: **5 minutes**
- HTTP Method: GET
- Expected Status Code: 200
- Alert Contacts: Add your email/Slack

**Monitor 3: API Endpoint (Optional)**
- Monitor Type: **HTTP(s)**
- Friendly Name: `SDR Platform - API`
- URL: `https://your-app.replit.app/api/csrf-token`
- Monitoring Interval: **5 minutes**
- HTTP Method: GET
- Expected Status Code: 200

#### **Step 2: Configure Alert Contacts**

1. Go to **My Settings** → **Alert Contacts**
2. Add contacts:

**Email Alert**
- Type: Email
- Email: `your-email@example.com`
- Friendly Name: Engineering Team

**Slack Alert** (Recommended)
- Type: Slack
- Webhook URL: (Get from Slack Incoming Webhooks app)
- Friendly Name: #engineering-alerts

#### **Step 3: Set Up Status Page (Optional)**

1. Go to **Public Status Pages**
2. Click **Create Status Page**
3. Choose monitors to display
4. Customize domain (e.g., `status.yourdomain.com`)
5. Share URL with customers

---

## 3️⃣ LOAD TESTING WITH K6

### Prerequisites
- k6 installed (`brew install k6` on Mac, or use https://k6.io/docs/get-started/installation/)
- Test credentials (admin account)

### Steps

#### **Step 1: Review Test Script**

The k6 script is already created at `k6-load-test.js`. It tests:
- Health checks
- Authentication
- AI search
- Concurrent users: 10 → 20 → 0

#### **Step 2: Run Load Test (Staging)**

```bash
k6 run \
  -e BASE_URL=https://your-staging-app.replit.app \
  -e TEST_EMAIL=admin@example.com \
  -e TEST_PASSWORD=yourpassword \
  k6-load-test.js
```

#### **Step 3: Analyze Results**

Look for these key metrics:

**✅ Good Performance:**
```
http_req_duration..............: avg=450ms  p(95)=1200ms
http_req_failed................: 0.12%
http_reqs......................: 2400/min
```

**⚠️ Warning Signs:**
```
http_req_duration..............: avg=2500ms  p(95)=5000ms  ← TOO SLOW
http_req_failed................: 8.5%  ← TOO MANY FAILURES
```

**🚨 Critical Issues:**
```
http_req_duration..............: avg=10000ms  p(95)=30000ms  ← UNACCEPTABLE
http_req_failed................: 25%  ← SYSTEM FAILING
```

#### **Step 4: Monitor Resources During Test**

While k6 is running, monitor:
- CPU usage (should stay < 80%)
- Memory usage (should stay < 85%)
- Database connections (check for leaks)
- Redis queue length (if using BullMQ)

**Tools:**
- Replit Dashboard: Resources tab
- Database: Check active connections
- Logs: Watch for errors

#### **Step 5: Document Baselines**

After a successful test, record your baselines:

```markdown
## Performance Baselines (Nov 19, 2025)

- **20 concurrent users**
- **Average response time:** 450ms
- **P95 response time:** 1200ms
- **Failure rate:** 0.12%
- **Throughput:** 2400 requests/min
- **CPU usage:** 45%
- **Memory usage:** 60%
```

---

## 4️⃣ EMAIL DELIVERABILITY (DKIM/SPF/DMARC)

### Prerequisites
- Domain name (e.g., `yourdomain.com`)
- Access to DNS settings
- Email sending service (Gmail/Sendgrid/Resend)

### DKIM Setup

**What is DKIM?**
DomainKeys Identified Mail (DKIM) cryptographically signs your emails to prove they came from your domain.

**Steps:**

1. **Get DKIM keys from your email provider:**

   **For Resend:**
   - Login to Resend dashboard
   - Go to **Domains** → **Add Domain**
   - Enter your domain (`yourdomain.com`)
   - Resend will generate DKIM, SPF, and DMARC records

   **For Gmail/Google Workspace:**
   - Admin console → Apps → Google Workspace → Gmail → Authenticate email
   - Click **Generate new record**
   - Copy the TXT record

2. **Add DNS TXT records:**

   Go to your domain registrar (Namecheap, GoDaddy, Cloudflare, etc.):

   ```
   Name: resend._domainkey
   Type: TXT
   Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNA... (long key)
   TTL: 3600
   ```

3. **Verify DKIM:**
   ```bash
   dig resend._domainkey.yourdomain.com TXT
   ```

---

### SPF Setup

**What is SPF?**
Sender Policy Framework (SPF) specifies which mail servers can send email on behalf of your domain.

**Steps:**

1. **Create SPF record** in DNS:

   ```
   Name: @ (or leave blank)
   Type: TXT
   Value: v=spf1 include:_spf.google.com include:sendgrid.net include:_spf.resend.com ~all
   TTL: 3600
   ```

   **Explanation:**
   - `v=spf1` - SPF version
   - `include:_spf.google.com` - Allow Gmail
   - `include:_spf.resend.com` - Allow Resend
   - `~all` - Soft fail for others (recommended for testing)
   - `-all` - Hard fail (use after testing)

2. **Verify SPF:**
   ```bash
   dig yourdomain.com TXT | grep spf
   ```

---

### DMARC Setup

**What is DMARC?**
Domain-based Message Authentication, Reporting & Conformance (DMARC) tells receiving mail servers what to do if SPF/DKIM checks fail.

**Steps:**

1. **Create DMARC record** in DNS:

   ```
   Name: _dmarc
   Type: TXT
   Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-failures@yourdomain.com; pct=100
   TTL: 3600
   ```

   **Explanation:**
   - `v=DMARC1` - Version
   - `p=none` - Policy (start with `none`, then `quarantine`, finally `reject`)
   - `rua=` - Aggregate reports email
   - `ruf=` - Forensic reports email
   - `pct=100` - Apply policy to 100% of messages

2. **Verify DMARC:**
   ```bash
   dig _dmarc.yourdomain.com TXT
   ```

---

### Testing Email Deliverability

#### **Test 1: Mail Tester**

1. Go to https://www.mail-tester.com
2. Copy the test email address (e.g., `test-abc123@mail-tester.com`)
3. Send a test email from your app to that address
4. Click **"Then check your score"**
5. Review results (aim for **9/10 or higher**)

**Common Issues:**
- **Low score (5/10):** DKIM/SPF not configured
- **Medium score (7/10):** DMARC missing or content issues
- **High score (10/10):** Perfect! ✅

#### **Test 2: Gmail Deliverability**

1. Send test email to your Gmail account
2. Open the email
3. Click **⋮** (three dots) → **Show original**
4. Check for:
   - ✅ `SPF: PASS`
   - ✅ `DKIM: PASS`
   - ✅ `DMARC: PASS`

#### **Test 3: Reply Detection**

1. Send email from your app to external email (Gmail/Outlook)
2. Reply to the email from external account
3. Wait 30 seconds
4. Check your app's database for the reply:
   ```sql
   SELECT * FROM replies ORDER BY created_at DESC LIMIT 5;
   ```
5. Verify:
   - Reply was detected
   - Message-ID matched correctly
   - Content was extracted properly

---

## 5️⃣ MONITORING CHECKLIST

### Daily Checks
- [ ] Check Sentry for new errors
- [ ] Review UptimeRobot status (should be 100% uptime)
- [ ] Monitor email bounce rates
- [ ] Check system resource usage (CPU/memory)

### Weekly Checks
- [ ] Review Sentry trends (is error rate increasing?)
- [ ] Test email deliverability (mail-tester.com)
- [ ] Review application logs for warnings
- [ ] Check database performance (slow queries)

### Monthly Checks
- [ ] Run full load test (k6)
- [ ] Review and update alert thresholds
- [ ] Security audit (OWASP ZAP scan)
- [ ] Update dependencies (npm audit)

### Quarterly Checks
- [ ] Full disaster recovery drill
- [ ] Review and update monitoring strategy
- [ ] Performance optimization review
- [ ] Penetration testing (if critical)

---

## 6️⃣ TROUBLESHOOTING

### Sentry Not Receiving Errors

**Problem:** Sentry dashboard shows no events

**Solutions:**
1. Check if DSN is correctly set in Secrets
2. Verify environment variable is loaded:
   ```bash
   echo $SENTRY_DSN
   ```
3. Manually trigger an error to test:
   ```bash
   curl https://your-app.replit.app/api/trigger-error
   ```
4. Check Sentry project settings (is it paused?)

---

### UptimeRobot False Positives

**Problem:** UptimeRobot reports "Down" but app is running

**Solutions:**
1. Check if `/healthz` endpoint is accessible:
   ```bash
   curl https://your-app.replit.app/healthz
   ```
2. Verify keyword check: response must contain `"status":"ok"`
3. Increase timeout (30s → 60s)
4. Check if Replit is blocking UptimeRobot IPs (unlikely)

---

### Load Test Failures

**Problem:** k6 test shows high failure rate or timeouts

**Solutions:**
1. **Too Many Failures (>5%):**
   - Check application logs for errors
   - Verify authentication credentials
   - Reduce concurrent users (20 → 10)

2. **Slow Response Times (>3s):**
   - Check database performance
   - Review slow queries (enable logging)
   - Implement caching (Redis)
   - Add database indexes

3. **Connection Errors:**
   - Verify BASE_URL is correct
   - Check if authentication is working
   - Ensure CSRF tokens are handled properly

---

### Email Deliverability Issues

**Problem:** Emails going to spam or bouncing

**Solutions:**
1. **SPF Failures:**
   - Verify SPF record includes sending service
   - Use `dig yourdomain.com TXT` to check
   - Ensure `-all` or `~all` at the end

2. **DKIM Failures:**
   - Verify DKIM record is published
   - Check if DKIM key matches provider's key
   - Resend/regenerate keys if needed

3. **DMARC Failures:**
   - Start with `p=none` (monitoring only)
   - Review DMARC reports sent to `rua=` email
   - Gradually tighten to `p=quarantine` then `p=reject`

4. **High Spam Score:**
   - Avoid spam trigger words (FREE, URGENT, CLICK HERE)
   - Include proper unsubscribe link
   - Authenticate domain properly
   - Warm up domain gradually (50 emails/day → 500/day → 5000/day)

---

## 7️⃣ NEXT STEPS

### Week 1: Basic Monitoring
- [x] Configure Sentry DSN
- [x] Set up UptimeRobot monitors
- [x] Run initial load test
- [ ] Configure email authentication (DKIM/SPF/DMARC)

### Week 2: Advanced Monitoring
- [ ] Set up Slack alerts for Sentry
- [ ] Create public status page
- [ ] Implement custom Sentry breadcrumbs
- [ ] Set up performance monitoring (APM)

### Week 3: Optimization
- [ ] Analyze Sentry performance traces
- [ ] Optimize slow database queries
- [ ] Implement Redis caching
- [ ] Run load test with 50 concurrent users

### Week 4: Production Readiness
- [ ] Full disaster recovery drill
- [ ] Penetration testing
- [ ] Final load test with 100 concurrent users
- [ ] Document all monitoring procedures

---

## 📞 SUPPORT

**Questions or Issues?**
- Review `COMPREHENSIVE_TESTING_REPORT.md` for additional context
- Check Replit Community forums
- Review Sentry documentation: https://docs.sentry.io
- Review K6 documentation: https://k6.io/docs

---

**END OF PRODUCTION MONITORING SETUP GUIDE**
