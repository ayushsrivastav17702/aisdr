# Production Monitoring Quick Start Checklist

**Estimated Time:** 60 minutes total  
**Date:** November 19, 2025

---

## ✅ TASK 1: Configure Sentry DSN (5 minutes)

### Step 1: Create Sentry Account
1. Go to https://sentry.io
2. Click **"Sign Up"** (free tier is sufficient)
3. Verify your email

### Step 2: Create Backend Project
1. Click **"Create Project"**
2. Select platform: **Node.js**
3. Project name: `AI SDR Platform - Backend`
4. Alert frequency: **On every new issue**
5. Click **"Create Project"**
6. **COPY THE DSN** (looks like: `https://abc123@o456789.ingest.sentry.io/123456`)

### Step 3: Create Frontend Project
1. Click **"Create Project"** again
2. Select platform: **React**
3. Project name: `AI SDR Platform - Frontend`
4. Alert frequency: **On every new issue**
5. Click **"Create Project"**
6. **COPY THE DSN** (different from backend DSN)

### Step 4: Add DSNs to Replit Secrets
1. In your Replit project, click **Tools** → **Secrets**
2. Add the following secrets:

```
SENTRY_DSN=https://abc123@o456789.ingest.sentry.io/123456
VITE_SENTRY_DSN=https://def456@o456789.ingest.sentry.io/654321
RELEASE=sdr-platform@1.0.0
```

3. Click **Save** for each secret

### Step 5: Restart Your App
1. Stop the current workflow
2. Start the workflow again
3. Check backend logs for: `✅ Sentry initialized for backend error monitoring`
4. Check browser console for: `✅ Sentry initialized for frontend error monitoring`

### Step 6: Test Error Reporting
1. Trigger a test error (e.g., try to access non-existent endpoint)
2. Go to Sentry dashboard
3. Verify error appears within 1-2 minutes

### Step 7: Configure Alerts
1. In Sentry, go to **Alerts** → **Create Alert Rule**
2. Create alert:
   - Name: `High Error Rate`
   - Condition: `Number of errors is more than 10 in 5 minutes`
   - Action: **Send notification to your email**
3. Click **Save Rule**

**✅ SENTRY CONFIGURED!** You'll now receive email alerts for errors.

---

## ✅ TASK 2: Set Up UptimeRobot (10 minutes)

### Step 1: Create UptimeRobot Account
1. Go to https://uptimerobot.com
2. Click **"Free Sign Up"**
3. Verify your email
4. Login to dashboard

### Step 2: Get Your App URL
Your app URL is: `https://[your-replit-username]-[project-name].replit.app`

Example: `https://johnsmith-sdr-platform.replit.app`

### Step 3: Create Health Check Monitor
1. Click **"+ Add New Monitor"**
2. Configure:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `SDR Platform - Health Check`
   - URL: `https://your-app.replit.app/healthz`
   - Monitoring Interval: **5 minutes** (free tier)
3. Click **"Advanced Settings"**
   - Keyword: Type **Keyword Exists**
   - Keyword: `"status":"ok"` (exactly as shown)
4. Click **"Create Monitor"**

### Step 4: Create Main App Monitor
1. Click **"+ Add New Monitor"** again
2. Configure:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `SDR Platform - Web App`
   - URL: `https://your-app.replit.app`
   - Monitoring Interval: **5 minutes**
3. Click **"Create Monitor"**

### Step 5: Configure Alert Contacts
1. Go to **My Settings** → **Alert Contacts**
2. Your email is already added (verified during signup)
3. (Optional) Add Slack:
   - Click **"Add Alert Contact"**
   - Select **Slack**
   - Follow integration steps
   - Test notification

### Step 6: Test Monitors
1. Wait 5 minutes for first check
2. Verify both monitors show **"Up"** (green)
3. Check your email for "Monitor is UP" confirmation

### Step 7: Create Status Page (Optional but Recommended)
1. Go to **Public Status Pages**
2. Click **"Add New Status Page"**
3. Name: `AI SDR Platform Status`
4. Select monitors to display (both monitors)
5. Click **"Create Status Page"**
6. Share the URL with customers: `https://stats.uptimerobot.com/xxxxx`

**✅ UPTIMEROBOT CONFIGURED!** You'll get alerts if your app goes down.

---

## ✅ TASK 3: Run K6 Load Test (15 minutes)

### Step 1: Install K6

**On macOS:**
```bash
brew install k6
```

**On Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**On Windows:**
```powershell
choco install k6
```

**Or use Docker (all platforms):**
```bash
# No installation needed, just run:
docker run --rm -i grafana/k6 run - < k6-load-test.js
```

### Step 2: Verify K6 Installation
```bash
k6 version
# Should output: k6 v0.xx.x
```

### Step 3: Get Your Test Credentials
You need:
- Your app URL: `https://your-app.replit.app`
- Admin email: `admin@example.com`
- Admin password: `yourpassword`

### Step 4: Run the Load Test

**Open terminal/command prompt in your project directory:**

```bash
k6 run \
  -e BASE_URL=https://your-app.replit.app \
  -e TEST_EMAIL=admin@example.com \
  -e TEST_PASSWORD=yourpassword \
  k6-load-test.js
```

**Windows users:**
```powershell
$env:BASE_URL="https://your-app.replit.app"; $env:TEST_EMAIL="admin@example.com"; $env:TEST_PASSWORD="yourpassword"; k6 run k6-load-test.js
```

### Step 5: Analyze Results

**Look for these key metrics:**

**✅ GOOD PERFORMANCE:**
```
http_req_duration...........: avg=450ms  p(95)=1200ms
http_req_failed.............: 0.12%
checks......................: 95.00%
```

**⚠️ WARNING:**
```
http_req_duration...........: avg=2500ms  p(95)=5000ms
http_req_failed.............: 8.5%
checks......................: 85.00%
```

**🚨 CRITICAL:**
```
http_req_duration...........: avg=10000ms  p(95)=30000ms
http_req_failed.............: 25%
checks......................: 60.00%
```

### Step 6: Document Baseline Performance

**Create a file to track baselines:**

```bash
# Save this to a file called PERFORMANCE_BASELINE.txt

=== Performance Baseline (Nov 19, 2025) ===

Test Configuration:
- Concurrent Users: 10 → 20 → 0
- Duration: 4 minutes
- Endpoint Mix: 20% health, 30% auth, 50% search

Results:
- Average Response Time: XXXms
- P95 Response Time: XXXms
- P99 Response Time: XXXms
- Failure Rate: X.XX%
- Throughput: XXX req/min
- CPU Usage During Test: XX%
- Memory Usage During Test: XX%

Notes:
- [Any bottlenecks observed]
- [Errors encountered]
- [Optimization opportunities]
```

### Step 7: Monitor Resources During Test

**While k6 is running:**
1. Open Replit Dashboard
2. Go to **Resources** tab
3. Watch:
   - CPU usage (should stay < 80%)
   - Memory usage (should stay < 85%)
   - Network I/O

**✅ K6 LOAD TEST COMPLETE!** You now have performance baselines.

---

## ✅ TASK 4: Configure DKIM/SPF/DMARC (30 minutes)

### Prerequisites
- Your domain name (e.g., `yourdomain.com`)
- Access to DNS settings (via domain registrar: Namecheap, GoDaddy, Cloudflare, etc.)
- Email sending service configured (Resend, Gmail, Sendgrid)

### Step 1: Get DKIM Keys from Email Provider

**For Resend (Recommended):**
1. Login to https://resend.com/domains
2. Click **"Add Domain"**
3. Enter your domain: `yourdomain.com`
4. Click **"Add"**
5. Resend will show you 3 DNS records:
   - DKIM record (long TXT record)
   - SPF record
   - DMARC record
6. **Keep this page open** - you'll need these values

**For Gmail/Google Workspace:**
1. Admin console → Apps → Google Workspace → Gmail
2. Click **"Authenticate email"**
3. Click **"Generate new record"**
4. Copy the TXT record value
5. **Keep this page open**

### Step 2: Access Your DNS Settings

**Common Providers:**
- **Namecheap:** Login → Domain List → Manage → Advanced DNS
- **GoDaddy:** Login → My Products → DNS
- **Cloudflare:** Login → Select Domain → DNS
- **Google Domains:** Login → Manage → DNS

### Step 3: Add DKIM Record

**Add a new TXT record:**

```
Name/Host: resend._domainkey
Type: TXT
Value: v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC... [LONG KEY]
TTL: 3600 (or Auto)
```

**IMPORTANT:**
- Copy the EXACT value from your email provider
- Do NOT add quotes around the value
- Some DNS providers auto-add the domain, so just use `resend._domainkey` not `resend._domainkey.yourdomain.com`

### Step 4: Add SPF Record

**Add a new TXT record:**

```
Name/Host: @ (or leave blank)
Type: TXT
Value: v=spf1 include:_spf.google.com include:_spf.resend.com ~all
TTL: 3600
```

**Customize for your provider:**
- **Gmail only:** `v=spf1 include:_spf.google.com ~all`
- **Resend only:** `v=spf1 include:_spf.resend.com ~all`
- **Both:** `v=spf1 include:_spf.google.com include:_spf.resend.com ~all`

**IMPORTANT:**
- Only ONE SPF record per domain
- If you already have an SPF record, ADD to it, don't replace it
- Use `~all` (soft fail) initially, then change to `-all` (hard fail) after testing

### Step 5: Add DMARC Record

**Add a new TXT record:**

```
Name/Host: _dmarc
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com; pct=100
TTL: 3600
```

**Explanation:**
- `p=none` - Monitor only (start here)
- `p=quarantine` - Send suspicious emails to spam (use after 1 week)
- `p=reject` - Reject suspicious emails (use after 1 month)
- `rua=` - Where to send aggregate reports

### Step 6: Wait for DNS Propagation

**DNS changes take time:**
- Minimum: 15 minutes
- Typical: 1-2 hours
- Maximum: 24-48 hours

**Check propagation:**
```bash
# Check DKIM
dig resend._domainkey.yourdomain.com TXT

# Check SPF
dig yourdomain.com TXT | grep spf

# Check DMARC
dig _dmarc.yourdomain.com TXT
```

### Step 7: Verify in Email Provider

**Resend:**
1. Go back to Resend dashboard
2. Click **"Verify"** next to each DNS record
3. All should show ✅ green checkmarks

**Gmail:**
1. Go back to Google Workspace admin
2. Click **"Start Authentication"**
3. Should show **"DKIM is active"**

### Step 8: Test Email Deliverability

**Test 1: Mail Tester**
1. Go to https://www.mail-tester.com
2. Copy the test email address shown (e.g., `test-abc123@mail-tester.com`)
3. Send a test email from your app to that address
4. Click **"Then check your score"**
5. **Target: 9/10 or 10/10**

**If score is low:**
- 5/10 → DKIM/SPF not configured properly
- 7/10 → DMARC missing or content issues
- 8/10 → Minor issues (acceptable)
- 10/10 → Perfect! ✅

**Test 2: Gmail Authentication**
1. Send test email to your Gmail account
2. Open the email
3. Click **⋮** (three dots) → **"Show original"**
4. Verify:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`

**Test 3: Reply Detection**
1. Send email from your app
2. Reply to it from external email account
3. Wait 30 seconds
4. Check app database for the reply

### Step 9: Gradually Tighten DMARC Policy

**Week 1:** `p=none` (monitoring only)
- Collect DMARC reports
- Verify no legitimate emails are failing

**Week 2-3:** `p=quarantine`
- Failed emails go to spam
- Monitor impact

**Week 4+:** `p=reject`
- Failed emails are rejected
- Maximum protection

**Update DMARC record:**
```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@yourdomain.com; pct=100
```

**✅ EMAIL DELIVERABILITY CONFIGURED!** Your emails will now reach inboxes, not spam.

---

## 📊 FINAL CHECKLIST

Mark each as complete:

- [ ] Sentry DSN configured for backend
- [ ] Sentry DSN configured for frontend
- [ ] Sentry alerts set up
- [ ] UptimeRobot health check monitor created
- [ ] UptimeRobot web app monitor created
- [ ] UptimeRobot email alerts configured
- [ ] K6 installed and load test run
- [ ] Performance baseline documented
- [ ] DKIM record added to DNS
- [ ] SPF record added to DNS
- [ ] DMARC record added to DNS
- [ ] Email deliverability verified (9/10+ score)

---

## 🆘 TROUBLESHOOTING

### Sentry Not Working
- **Problem:** No errors showing in Sentry
- **Solution:** Check that `SENTRY_DSN` is set correctly in Replit Secrets, restart app

### UptimeRobot Shows "Down"
- **Problem:** Monitor reports app is down but it's actually running
- **Solution:** Check keyword is exactly `"status":"ok"` with quotes included

### K6 Authentication Failing
- **Problem:** Test shows high failure rate on auth endpoints
- **Solution:** Verify TEST_EMAIL and TEST_PASSWORD are correct, check if account is locked

### Email Going to Spam
- **Problem:** Test emails land in spam folder
- **Solution:** Verify DKIM/SPF/DMARC records are correct, use mail-tester.com to diagnose

### DNS Records Not Verifying
- **Problem:** Email provider shows DNS records not found
- **Solution:** Wait 1-2 hours for DNS propagation, check for typos in record names

---

## 📞 NEED HELP?

If you encounter issues:
1. Check the comprehensive guide: `PRODUCTION_MONITORING_SETUP.md`
2. Review server logs for errors
3. Verify all environment variables are set
4. Ensure DNS changes have propagated (wait 2 hours)

---

**END OF QUICK START CHECKLIST**
