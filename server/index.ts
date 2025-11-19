import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { doubleCsrf } from "csrf-csrf";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { emailQueueService } from "./services/email-queue.service";
import { mailboxService } from "./services/mailbox.service";
import { initSentry, Sentry, isSentryEnabled } from "./sentry";

initSentry();

const app = express();

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
});

const { generateCsrfToken, doubleCsrfProtection } = csrfProtection;

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

if (isSentryEnabled()) {
  app.use(Sentry.Handlers.requestHandler());
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
    // Generate token and set cookie manually
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('x-csrf-token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
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
  '/api/csrf-token'
];

app.use((req, res, next) => {
  if (csrfExcludedPaths.includes(req.path) || req.path.startsWith('/api/csrf-token')) {
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
  const server = await registerRoutes(app);

  if (isSentryEnabled()) {
    app.use(Sentry.Handlers.errorHandler());
  }

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
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
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
    
    // Initialize default ICP templates
    const { icpTemplateService } = await import("./services/icp-template.service");
    await icpTemplateService.initializeDefaultTemplates();
    log(`✅ ICP templates initialized`);
    
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
})();
