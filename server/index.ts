import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { doubleCsrf } from "csrf-csrf";
import path from "path";
import { registerRoutes } from "./routes";

// Inline log helper — avoids importing server/vite.ts (which imports the "vite"
// package) in production where vite is not installed.
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
import { emailQueueService } from "./services/email-queue.service";
import { mailboxService } from "./services/mailbox.service";
import { initSentry, Sentry, isSentryEnabled } from "./sentry";
import { db } from "./db";
import { sql, eq } from "drizzle-orm";
import { superAdmins, users, accountLockouts } from "@shared/schema";
import bcrypt from "bcrypt";

// Global error handlers for production debugging
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

console.log('🚀 Starting server...');
console.log('📍 NODE_ENV:', process.env.NODE_ENV);
console.log('📍 DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('📍 PORT:', process.env.PORT);
console.log('📍 SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('📍 LUSHA_API_KEY exists:', !!process.env.LUSHA_API_KEY);

// ============================================
// CRITICAL SECURITY CHECK: ENCRYPTION_KEY
// ============================================
const encryptionKey = process.env.ENCRYPTION_KEY;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !encryptionKey) {
  console.error('❌ FATAL SECURITY ERROR: ENCRYPTION_KEY is required in production.');
  console.error('   Mailbox credentials cannot be stored securely without this key.');
  console.error('   Generate a key with: openssl rand -hex 32');
  console.error('   Then set it in your environment variables.');
  process.exit(1);
}

if (encryptionKey && encryptionKey.length < 32) {
  console.error(`❌ FATAL SECURITY ERROR: ENCRYPTION_KEY must be at least 32 characters (currently ${encryptionKey.length}).`);
  console.error('   A weak encryption key puts all mailbox credentials at risk.');
  console.error('   Generate a secure key with: openssl rand -hex 32');
  process.exit(1);
}

if (!encryptionKey) {
  console.warn('⚠️  WARNING: ENCRYPTION_KEY not set. Mailbox features will be unavailable.');
  console.warn('   Generate a key with: openssl rand -hex 32');
} else {
  console.log('✅ ENCRYPTION_KEY validated (length:', encryptionKey.length, ')');
}

try {
  initSentry();
  console.log('✅ Sentry initialized');
} catch (error) {
  console.error('❌ Sentry init failed:', error);
}

const app = express();

// Configure trust proxy for proper IP extraction behind proxies (Heroku, Vercel, etc.)
app.set('trust proxy', true);

const csrfProtection = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || "default-csrf-secret-change-in-production",
  cookieName: "x-csrf-token",
  cookieOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getSessionIdentifier: (req) => {
    // Use session ID if available, otherwise use a placeholder
    // This is required for csrf-csrf v4
    return req.sessionId || req.ip || 'anonymous';
  },
});

const { generateCsrfToken, doubleCsrfProtection } = csrfProtection;

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

if (isSentryEnabled()) {
  // Sentry v8 uses middleware setup in sentry.ts (expressIntegration)
  // No need for Handlers.requestHandler() anymore
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "https://api.apollo.io",
        "https://api.lusha.io",
        "https://api.openai.com",
        "https://api.anthropic.com",
        "https://openrouter.ai",
        "https://api.stripe.com",
        "https://sentry.io",
        "https://*.sentry.io",
        "wss:"
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cookieParser());
app.use(express.json({
  limit: '10mb', // Increased limit to handle bulk operations (e.g., deleting 48k+ prospects)
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.get("/api/csrf-token", (req, res) => {
  try {
    // Use the csrf-csrf library's token generation
    const token = generateCsrfToken(req, res);
    
    // Return token to client
    res.json({ csrfToken: token });
  } catch (error) {
    log(`CSRF token generation error: ${error}`);
    res.status(500).json({ error: "CSRF token generation failed" });
  }
});

const csrfExcludedPaths = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/signup',
  '/api/auth/change-password',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
  '/api/auth/invitations/accept',
  '/api/auth/magic-link',
  '/api/auth/magic-link/verify',
  '/api/csrf-token',
  '/api/import/csv',
  '/api/import/validate-csv',
  '/api/personalization/analyze',
  '/api/personalization/advanced-analyze',
  '/api/personalization/generate-email',
  '/api/personalization/batch-analyze',
  '/api/test/email-queue-simulation',
  '/api/test/e2e-login',
];

const csrfExcludedPrefixes = [
  '/api/super-admin',
];

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.DEMO_MODE === 'true' || process.env.E2E_TESTING === 'true';
}

app.use((req, res, next) => {
  if (csrfExcludedPaths.includes(req.path) || 
      req.path.startsWith('/api/csrf-token') ||
      csrfExcludedPrefixes.some(prefix => req.path.startsWith(prefix))) {
    return next();
  }
  
  const hasTestHeader = req.headers['x-test-bypass'] === 'true';
  const hasBearerToken = req.headers.authorization?.startsWith('Bearer ');

  // In test env, skip CSRF for all requests that carry a Bearer token
  if (hasBearerToken && isTestEnv()) {
    return next();
  }

  if (hasTestHeader && hasBearerToken) {
    return next();
  }
  
  return doubleCsrfProtection(req, res, next);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run schema migrations at startup
  try {
    // BUG-006: Enforce atomic email deduplication via unique index
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS email_queue_idempotency_idx
      ON email_queue(idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
    // BUG-020: Composite index for email queue processing hot path
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS email_queue_processing_idx
      ON email_queue (status, scheduled_for, user_id)
    `);
    // BUG-003: Add expired_at column for soft session expiry
    await db.execute(sql`
      ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS expired_at timestamp
    `);
    // BUG-008/BUG-009: Add new enum values for email queue status
    await db.execute(sql`
      ALTER TYPE email_queue_status ADD VALUE IF NOT EXISTS 'paused_failed'
    `);
    await db.execute(sql`
      ALTER TYPE email_queue_status ADD VALUE IF NOT EXISTS 'simulated'
    `);
    // Add super_admin to user_role enum (needed for super-admin test users)
    await db.execute(sql`
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'
    `);
    // Audit fix: prevent duplicate prospects per user (by email)
    try {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS prospects_user_email_unique_idx
        ON prospects (user_id, primary_email)
        WHERE primary_email IS NOT NULL
      `);
    } catch (idxErr) {
      console.error('⚠️ prospects_user_email_unique_idx creation error (non-fatal):', idxErr);
    }
    // Audit fix: prevent duplicate sequences/campaigns per user (by name)
    try {
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS sequences_user_name_unique_idx
        ON sequences (user_id, name)
        WHERE name IS NOT NULL
      `);
    } catch (idxErr) {
      console.error('⚠️ sequences_user_name_unique_idx creation error (non-fatal):', idxErr);
    }
    // FIX-1: Add timezone column to prospects for timezone-aware delivery
    await db.execute(sql`
      ALTER TABLE prospects ADD COLUMN IF NOT EXISTS timezone text
    `);
    // FIX-4: Add IMAP settings to email_mailboxes for non-Gmail reply detection
    await db.execute(sql`
      ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_host text
    `);
    await db.execute(sql`
      ALTER TABLE email_mailboxes ADD COLUMN IF NOT EXISTS imap_port integer
    `);
    console.log('✅ Schema migrations applied');
  } catch (err) {
    console.error('⚠️ Schema migration error (non-fatal):', err);
  }

  // ── Seed default super admin (idempotent — skipped if email already exists) ──
  try {
    const SEED_EMAIL = 'ayush@gmail.com';
    const SEED_PASSWORD = 'Ayush@114988';
    const [existing] = await db
      .select({ id: superAdmins.id })
      .from(superAdmins)
      .where(eq(superAdmins.email, SEED_EMAIL))
      .limit(1);

    // Clear any lockout for the super admin email
    await db.delete(accountLockouts).where(eq(accountLockouts.email, SEED_EMAIL)).catch(() => {});

    if (!existing) {
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
      await db.insert(superAdmins).values({
        email: SEED_EMAIL,
        passwordHash,
        firstName: 'Ayush',
        lastName: '',
        status: 'active',
        isMasterAdmin: true,
        permissions: {
          canProvisionTenants: true,
          canManageBilling: true,
          canImpersonateManagers: true,
          canSuspendTenants: true,
          canDeleteTenants: true,
          canViewAllData: true,
        },
      });
      console.log(`✅ Seeded super admin: ${SEED_EMAIL}`);
    } else {
      console.log(`ℹ️  Super admin ${SEED_EMAIL} already exists, skipping seed`);
    }
  } catch (seedErr) {
    console.error('⚠️ Super admin seed error (non-fatal):', seedErr);
  }

  // ── Seed SDR user ayushsri.17@gmail.com (idempotent) ──
  try {
    const SDR_EMAIL = 'ayushsri.17@gmail.com';
    const SDR_PASSWORD = 'Ayush@12345';
    const [existingSdr] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, SDR_EMAIL))
      .limit(1);

    // Always clear any lockout for this email (in case of failed pre-deploy attempts)
    await db.delete(accountLockouts).where(eq(accountLockouts.email, SDR_EMAIL)).catch(() => {});

    if (!existingSdr) {
      const passwordHash = await bcrypt.hash(SDR_PASSWORD, 12);
      await db.insert(users).values({
        email: SDR_EMAIL,
        passwordHash,
        authProvider: 'password',
        passwordLoginEnabled: true,
        firstName: 'Ayush',
        lastName: 'Srivastava',
        role: 'user',
        status: 'active',
        isActive: true,
        emailVerified: true,
      });
      console.log(`✅ Seeded SDR user: ${SDR_EMAIL}`);
    } else {
      console.log(`ℹ️  SDR user ${SDR_EMAIL} already exists, skipping seed`);
    }
  } catch (sdrSeedErr) {
    console.error('⚠️ SDR user seed error (non-fatal):', sdrSeedErr);
  }

  console.log('📋 Registering routes...');
  const server = await registerRoutes(app);
  console.log('✅ Routes registered');

  // Sentry v8 error handling - expressIntegration handles it automatically
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    if (isSentryEnabled()) {
      Sentry.captureException(err);
    }
    
    res.status(status).json({ message });
  });

  // API 404: any /api/ path that fell through every registered API route
  // must return JSON 404 rather than falling into Vite's SPA handler.
  // This must live AFTER all route registrations and BEFORE setupVite/serveStatic.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: `API route not found: ${_req.method} ${_req.originalUrl}` });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  console.log('📁 Setting up static/vite server, env:', app.get("env"));
  if (app.get("env") === "development") {
    // Dynamic import so "vite" package is never required at module load time
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
    console.log('✅ Vite setup complete');
  } else if (app.get("env") === "test") {
    // In test mode skip static file serving — only the API routes are needed
    console.log('🧪 Test mode: skipping static file serving');
  } else {
    // Production: serve the pre-built client bundle directly via express.static
    // (avoids importing the "vite" package which is not installed in production)
    console.log('📁 Serving static files from production build...');
    const distPath = path.resolve(process.cwd(), "dist/public");
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
      }
      next();
    });
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
    console.log('✅ Static files setup complete');
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.env.NODE_ENV !== "test" && process.env.E2E_TESTING !== "true" ? { reusePort: true } : {}),
  }, async () => {
    log(`serving on port ${port}`);
    
    // Initialize default ICP templates (with extra safety layer)
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      await icpTemplateService.initializeDefaultTemplates();
      log(`✅ ICP templates initialized`);
    } catch (error) {
      console.warn('⚠️ ICP template initialization skipped:', error instanceof Error ? error.message : error);
    }
    
    // Start email queue processor
    // Architecture: Adaptive poller is always the reliable backbone (exponential backoff,
    // 10s → 5 min when idle). BullMQ/Redis adds event-driven speed on top when available.
    // If Redis is unavailable or rate-limited, the poller handles everything automatically.
    log(`📧 Starting email queue processor...`);
    const { initEmailQueueWorker } = await import("./queue/email-queue-bullmq");
    const { emailQueuePoller } = await import("./queue/email-queue-poller");

    // Always start adaptive poller first (reliable backbone)
    emailQueuePoller.start(async () => {
      try {
        return await emailQueueService.processPendingEmails();
      } catch (error) {
        console.error("Email queue processor error:", error);
        return 0;
      }
    });
    log(`✅ Email queue: adaptive poller started (10s → 5min backoff when idle)`);

    // Attempt BullMQ for instant triggering when a job is added (speed layer)
    await initEmailQueueWorker();
    log(`✅ Email queue: BullMQ event-driven layer initialized (fallback to poller if Redis unavailable)`);

    // Start reply detection polling — every 3 minutes (email is not real-time)
    const { replyDetectionService } = await import("./services/reply-detection.service");
    replyDetectionService.startPolling(180); // Check every 3 minutes
    
    // Start sequence executor for follow-up emails
    log(`⏰ Starting sequence executor...`);
    const { sequenceExecutorService } = await import("./services/sequence-executor.service");
    sequenceExecutorService.startExecutor(5); // Check every 5 minutes
    log(`✅ Sequence executor started`);

    // Start scheduler monitoring
    log(`🔍 Starting scheduler monitoring...`);
    const { schedulerMonitoringService } = await import("./services/scheduler-monitoring.service");
    schedulerMonitoringService.startMonitoring();
    log(`✅ Scheduler monitoring started`);
    
    // Reset daily mailbox counters every 24 hours
    log(`🔄 Starting daily mailbox counter reset scheduler...`);
    setInterval(async () => {
      try {
        await mailboxService.resetDailyCounters();
        log("✅ Daily mailbox counters reset successfully");
      } catch (error) {
        console.error("❌ Failed to reset daily counters:", error);
      }
    }, 24 * 60 * 60 * 1000); // Reset every 24 hours
    log(`✅ Daily reset scheduler started`);
    
    // Start automation worker (BullMQ)
    log(`🔧 Starting automation worker...`);
    await import("./queue/automation-worker");
    log(`✅ Automation worker started`);
  });
})().catch((error) => {
  console.error('❌ FATAL: Server startup failed:', error);
  process.exit(1);
});
