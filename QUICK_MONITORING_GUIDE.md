# Quick Monitoring Setup Guide (No Sentry)

**Tasks:** UptimeRobot + K6 Load Test + Email Deliverability  
**Time:** ~45 minutes total

---

## ✅ TASK 1: UptimeRobot Setup (10 minutes)

### Create Account
1. Go to https://uptimerobot.com
2. Click "Free Sign Up"
3. Verify email and login

### Create Monitor #1: Health Check
1. Click "+ Add New Monitor"
2. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** SDR Platform - Health Check
   - **URL:** `https://YOUR-APP-URL.replit.app/healthz`
   - **Monitoring Interval:** 5 minutes
3. Click "Advanced Settings"
   - **Keyword Type:** Keyword Exists
   - **Keyword Value:** `"status":"ok"` (include the quotes!)
4. Click "Create Monitor"

### Create Monitor #2: Main App
1. Click "+ Add New Monitor"
2. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** SDR Platform - Web App
   - **URL:** `https://YOUR-APP-URL.replit.app`
   - **Monitoring Interval:** 5 minutes
3. Click "Create Monitor"

### Verify
- Wait 5 minutes
- Both monitors should show **"Up"** (green checkmark)
- You'll receive "Monitor is UP" confirmation email

**✅ Done! You'll now get alerts if your app goes down.**

---

## ✅ TASK 2: K6 Load Test (15 minutes)

### Install K6

**macOS:**
```bash
brew install k6
```

**Ubuntu/Debian:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows (PowerShell as Admin):**
```powershell
choco install k6
```

**Docker (any OS, no installation needed):**
```bash
docker run --rm -i grafana/k6 run - < k6-load-test.js
```

### Run Load Test

**Get your credentials:**
- App URL: `https://YOUR-APP-URL.replit.app`
- Admin email: (your admin account email)
- Admin password: (your admin password)

**Run the test:**

```bash
k6 run \
  -e BASE_URL=https://YOUR-APP-URL.replit.app \
  -e TEST_EMAIL=your-admin@example.com \
  -e TEST_PASSWORD=yourpassword \
  k6-load-test.js
```

**For Windows PowerShell:**
```powershell
$env:BASE_URL="https://YOUR-APP-URL.replit.app"
$env:TEST_EMAIL="your-admin@example.com"
$env:TEST_PASSWORD="yourpassword"
k6 run k6-load-test.js
```

### Analyze Results

**✅ GOOD (Pass):**
```
http_req_duration...: avg=450ms  p(95)=1200ms  p(99)=2000ms
http_req_failed.....: 0.12% (very low failure rate)
checks..............: 95.00% pass rate
```

**⚠️ WARNING (Needs optimization):**
```
http_req_duration...: avg=2500ms  p(95)=5000ms
http_req_failed.....: 5-10%
checks..............: 85-90%
```

**🚨 CRITICAL (Must fix before launch):**
```
http_req_duration...: avg=10000ms  p(95)=30000ms
http_req_failed.....: >10%
checks..............: <85%
```

### Save Baseline

Create a file called `PERFORMANCE_BASELINE.txt`:

```
=== Performance Baseline ===
Date: [Today's Date]
Concurrent Users: 20
Test Duration: 4 minutes

Results:
- Avg Response Time: XXXms
- P95 Response Time: XXXms
- Failure Rate: X.XX%
- Throughput: XXX req/min

Notes:
- [Any issues observed]
- [Bottlenecks identified]
```

**✅ Done! You now know your app's performance limits.**

---

## ✅ TASK 3: Email Deliverability (30 minutes)

### Prerequisites
- Domain name (e.g., `yourdomain.com`)
- Access to DNS settings (via Namecheap, GoDaddy, Cloudflare, etc.)
- Email provider account (Resend, Gmail Workspace, etc.)

### Step 1: Get DNS Records from Email Provider

**For Resend:**
1. Login to https://resend.com/domains
2. Click "Add Domain"
3. Enter your domain: `yourdomain.com`
4. Copy the 3 DNS records shown (DKIM, SPF, DMARC)

**For Gmail Workspace:**
1. Admin console → Apps → Gmail → Authenticate email
2. Click "Generate new record"
3. Copy the DKIM TXT record

### Step 2: Add DNS Records

**Login to your domain registrar:**
- Namecheap: Domain List → Manage → Advanced DNS
- GoDaddy: My Products → DNS
- Cloudflare: Select Domain → DNS

**Add 3 TXT records:**

**Record 1 - DKIM:**
```
Name: resend._domainkey
Type: TXT
Value: v=DKIM1; k=rsa; p=MIGfMA0GCS... [long key from provider]
TTL: 3600
```

**Record 2 - SPF:**
```
Name: @ (or leave blank)
Type: TXT
Value: v=spf1 include:_spf.resend.com ~all
TTL: 3600
```

**Record 3 - DMARC:**
```
Name: _dmarc
Type: TXT
Value: v=DMARC1; p=none; rua=mailto:postmaster@yourdomain.com; pct=100
TTL: 3600
```

### Step 3: Wait for DNS Propagation

**Time required:** 15 minutes to 2 hours

**Check if propagated:**
```bash
# Check DKIM
dig resend._domainkey.yourdomain.com TXT

# Check SPF
dig yourdomain.com TXT

# Check DMARC
dig _dmarc.yourdomain.com TXT
```

### Step 4: Verify in Email Provider

**Resend:**
1. Go back to Resend dashboard
2. Click "Verify" next to each DNS record
3. All should show green checkmarks ✅

**Gmail:**
1. Go back to admin console
2. Click "Start Authentication"
3. Should show "DKIM is active"

### Step 5: Test Email Deliverability

**Test 1: Mail Tester**
1. Go to https://www.mail-tester.com
2. Copy the test email address (e.g., `test-abc123@mail-tester.com`)
3. Send a test email from your app to that address
4. Click "Then check your score"
5. **Target: 9/10 or 10/10**

**Test 2: Gmail Check**
1. Send test email to your Gmail account
2. Open email → Click ⋮ → "Show original"
3. Verify all PASS:
   - `SPF: PASS`
   - `DKIM: PASS`
   - `DMARC: PASS`

**✅ Done! Your emails will now reach inbox, not spam.**

---

## 📊 COMPLETION CHECKLIST

- [ ] UptimeRobot account created
- [ ] Health check monitor created (`/healthz`)
- [ ] Web app monitor created
- [ ] Email alerts configured
- [ ] K6 installed
- [ ] Load test executed successfully
- [ ] Performance baseline documented
- [ ] DKIM record added to DNS
- [ ] SPF record added to DNS
- [ ] DMARC record added to DNS
- [ ] Email deliverability score: 9/10+

---

## 🆘 Common Issues

### UptimeRobot Monitor Shows "Down"
**Problem:** Monitor reports down but app is running  
**Fix:** Check keyword is exactly `"status":"ok"` with quotes

### K6 Authentication Fails
**Problem:** High failure rate on login  
**Fix:** Verify email/password are correct, check CSRF token

### Emails Going to Spam
**Problem:** Low mail-tester score  
**Fix:** Verify DNS records are correct, wait for propagation

### DNS Not Verifying
**Problem:** Provider can't verify DNS records  
**Fix:** Wait 1-2 hours, check for typos in record names

---

**END OF GUIDE**
