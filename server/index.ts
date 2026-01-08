import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { doubleCsrf } from "csrf-csrf";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { emailQueueService } from "./services/email-queue.service";
import { mailboxService } from "./services/mailbox.service";
import { initSentry, Sentry, isSentryEnabled } from "./sentry";

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

try {
  initSentry();
  console.log('✅ Sentry initialized');
} catch (error) {
  console.error('❌ Sentry init failed:', error);
}

const app = express();

// Configure trust proxy for proper IP extraction behind proxies (Heroku, Vercel, etc.)
app.set('trust proxy', true);

const isProduction = process.env.NODE_ENV === "production";

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
  '/api/test/email-queue-simulation'
];

app.use((req, res, next) => {
  if (csrfExcludedPaths.includes(req.path) || 
      req.path.startsWith('/api/csrf-token') ||
      req.path.startsWith('/api/super-admin')) {
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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  console.log('📁 Setting up static/vite server, env:', app.get("env"));
  if (app.get("env") === "development") {
    await setupVite(app, server);
    console.log('✅ Vite setup complete');
  } else {
    console.log('📁 Serving static files from production build...');
    serveStatic(app);
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
    reusePort: true,
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
    log(`📧 Starting email queue processor...`);
    setInterval(async () => {
      try {
        await emailQueueService.processPendingEmails();
      } catch (error) {
        console.error("Email queue processor error:", error);
      }
    }, 10000); // Process every 10 seconds
    
    // Process immediately on startup
    emailQueueService.processPendingEmails().catch(console.error);
    
    // Start reply detection polling
    const { replyDetectionService } = await import("./services/reply-detection.service");
    replyDetectionService.startPolling(20); // Check every 20 seconds
    
    // Start sequence executor for follow-up emails
    log(`⏰ Starting sequence executor...`);
    const { sequenceExecutorService } = await import("./services/sequence-executor.service");
    sequenceExecutorService.startExecutor(5); // Check every 5 minutes
    log(`✅ Sequence executor started`);
    
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
