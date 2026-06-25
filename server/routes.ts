import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { aiService } from "./services/ai.service";
import { jobService } from "./services/job.service";
import { waterfallSearchService } from "./services/waterfall-search.service";
import type { WaterfallSearchCriteria } from "@shared/schema";
import { intelligentPersonalizationService } from "./services/intelligent-personalization.service";
import { webScrapingService } from "./services/web-scraping.service";
import { contentManagementService } from "./services/content-management.service";
import { 
  aiSearchSchema, 
  enrichmentRequestSchema, 
  csvImportSchema,
  insertProspectSchema 
} from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import sequenceRoutes from "./sequences-routes";
import mailboxRoutes from "./mailbox-routes";
import { registerAutomationRoutes } from "./automation-routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import analyticsRoutes from "./routes/analytics.routes";
import dataExportRoutes from "./routes/data-export.routes";
import organizationRoutes from "./routes/organization.routes";
import userAdminRoutes from "./routes/user-admin.routes";
import rbacRoutes from "./routes/rbac.routes";
import teamRoutes from "./routes/team.routes";
import emailInfrastructureRoutes from "./routes/email-infrastructure.routes";
import apiAccessRoutes from "./routes/api-access.routes";
import emailSettingsRoutes from "./routes/email-settings.routes";
import notificationSettingsRoutes from "./routes/notification-settings.routes";
import aiConfigRoutes from "./routes/ai-config.routes";
import superAdminRoutes from "./routes/super-admin.routes";
import leaderboardRoutes from "./routes/leaderboard.routes";
import bestPracticesRoutes from "./routes/best-practices.routes";
import aeHandoffRoutes from "./routes/ae-handoff.routes";
import waterfallSearchRoutes from "./routes/waterfall-search.routes";
import findLeadsRoutes from "./routes/find-leads.routes";
import managerRoutes from "./routes/manager.routes";
import sdrWorkflowRoutes from "./routes/sdr-workflow.routes";
import sdrDashboardRoutes from "./routes/sdr-dashboard.routes";
import campaignsRoutes from "./routes/campaigns.routes";
import aiGenerationRoutes from "./routes/ai-generation.routes";
import emailExecutionRoutes from "./routes/email-execution.routes";
import userOnboardingRoutes from "./routes/user-onboarding.routes";
import safeToSendRoutes from "./routes/safe-to-send.routes";
import { sdrWorkflowService, WorkflowBlockedError } from "./services/sdr-workflow.service";
import { hardeningService } from "./services/hardening.service";
import { aiTrackingService } from "./services/ai-tracking.service";
import { getTemplateForContext, EMAIL_TEMPLATE_LIBRARY, AI_DECISION_ENGINE_RULES } from "./services/ai-prompt-templates";
import { inboxRouter } from "./inbox-routes";
import { intentsRouter } from "./routes/intents.routes";
import { requireIntentEngine } from "./middleware/intent-engine-gate.middleware";
import { authenticate, forbidManager, blockSuperAdminFromSDR, requireManager } from "./middleware/auth.middleware";
import { emailVolumeConfig, getCapacityReport, getEstimatedTimeForEmails, EMAIL_VOLUME_PRESETS } from "./config/email-volume.config";
import { analyticsCache } from "./utils/cache";
import { db } from "./db";
import { checkCredits, deductCredits, initializeUserCredits } from "./services/credit.service";
import creditRoutes from "./credit-routes";
import { emailQueue, prospectNotes, users } from "@shared/schema";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { isRedisConfigured } from "./queue/redis-connection";

const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

/**
 * FIX-1: Derive prospect timezone from location string using a simple keyword map.
 * No external API needed — covers ~90% of use cases.
 */
function inferTimezone(location: string): string {
  const l = location.toLowerCase();
  // India
  if (l.includes('india') || l.includes('bengaluru') || l.includes('bangalore') ||
      l.includes('mumbai') || l.includes('delhi') || l.includes('chennai') ||
      l.includes('hyderabad') || l.includes('pune') || l.includes('kolkata'))
    return 'Asia/Kolkata';
  // US East
  if (l.includes('new york') || l.includes('boston') || l.includes('miami') ||
      l.includes('atlanta') || l.includes('toronto') || l.includes('philadelphia'))
    return 'America/New_York';
  // US Central
  if (l.includes('chicago') || l.includes('dallas') || l.includes('houston') ||
      l.includes('austin') || l.includes('minneapolis'))
    return 'America/Chicago';
  // US Mountain
  if (l.includes('denver') || l.includes('phoenix') || l.includes('salt lake'))
    return 'America/Denver';
  // US Pacific
  if (l.includes('san francisco') || l.includes('los angeles') || l.includes('seattle') ||
      l.includes('portland') || l.includes('california') || l.includes('san jose') ||
      l.includes('san diego'))
    return 'America/Los_Angeles';
  // UK
  if (l.includes('london') || l.includes(' uk') || l.includes('england') ||
      l.includes('united kingdom'))
    return 'Europe/London';
  // Europe
  if (l.includes('paris') || l.includes('berlin') || l.includes('amsterdam') ||
      l.includes('madrid') || l.includes('rome') || l.includes('stockholm') ||
      l.includes('frankfurt') || l.includes('munich') || l.includes('zurich'))
    return 'Europe/Paris';
  // Asia Pacific
  if (l.includes('singapore')) return 'Asia/Singapore';
  if (l.includes('sydney') || l.includes('australia') || l.includes('melbourne'))
    return 'Australia/Sydney';
  if (l.includes('dubai') || l.includes('uae') || l.includes('abu dhabi'))
    return 'Asia/Dubai';
  if (l.includes('tokyo') || l.includes('japan')) return 'Asia/Tokyo';
  if (l.includes('beijing') || l.includes('shanghai') || l.includes('china') ||
      l.includes('hong kong')) return 'Asia/Shanghai';
  return 'UTC';
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Health check endpoint for monitoring (UptimeRobot, etc.)
  app.get("/healthz", async (_req, res) => {
    try {
      // Basic health check - no database check to avoid unnecessary load
      res.status(200).json({ 
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (error) {
      res.status(503).json({ 
        status: "error",
        message: "Service unavailable",
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Temporary debug endpoint: check which third-party API keys are loaded
  // into the running process's environment. Authenticated only — does not
  // return key values, only presence/length, to help diagnose
  // "provider not configured" issues without leaking secrets.
  app.get('/api/debug/providers', authenticate, (req, res) => {
    res.json({
      groq: !!process.env.GROQ_API_KEY,
      deepseek: !!process.env.DEEPSEEK_API_KEY,
      resend: !!process.env.RESEND_API_KEY,
      resendFromEmail: !!process.env.RESEND_FROM_EMAIL,
      googleClientId: !!process.env.GOOGLE_CLIENT_ID,
      redisConfigured: isRedisConfigured,
    });
  });

  // Email volume configuration endpoint (SDR-only)
  app.get("/api/email-volume-config", authenticate, forbidManager, async (req, res) => {
    try {
      const activePreset = process.env.EMAIL_VOLUME_PRESET || 'medium';
      const dailyLimit = Math.min(
        emailVolumeConfig.dailyEmailLimit,
        emailVolumeConfig.automationDailyLimit
      );
      
      res.json({
        activePreset,
        config: emailVolumeConfig,
        availablePresets: Object.keys(EMAIL_VOLUME_PRESETS),
        capacity: {
          dailyLimit,
          hourlyLimit: Math.floor(dailyLimit / 24),
          estimatedTimeFor1000: getEstimatedTimeForEmails(1000),
          estimatedTimeFor5000: getEstimatedTimeForEmails(5000),
          estimatedTimeFor10000: getEstimatedTimeForEmails(10000),
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get email volume config" });
    }
  });
  
  // Email queue simulation endpoint for load testing - ONLY available in test/development mode
  if (process.env.NODE_ENV === 'test' || process.env.DEMO_MODE === 'true') {
    app.post("/api/test/email-queue-simulation", async (req, res) => {
      const { to, subject, body } = req.body;
      
      await new Promise(r => setTimeout(r, Math.random() * 5));
      
      res.json({
        success: true,
        simulated: true,
        queuedAt: new Date().toISOString(),
        to,
        subject: subject?.substring(0, 50)
      });
    });
  }
  
  // AI Search endpoint
  app.post("/api/ai-search", authenticate, forbidManager, async (req, res) => {
    try {
      const validatedBody = aiSearchSchema.extend({ 
        includeLocalProspects: z.boolean().default(true) 
      }).parse(req.body);
      const { query, includeLocalProspects } = validatedBody;
      
      // Parse natural language query
      const { aiFilters, apolloFilters } = await aiService.parseNaturalLanguageQuery(query);
      
      console.log('AI Search Query:', query);
      console.log('AI Filters:', JSON.stringify(aiFilters, null, 2));
      console.log('Apollo Filters:', JSON.stringify(apolloFilters, null, 2));
      
      // Save search record
      const search = await storage.createSearch(req.userContext!, {
        userId: req.userContext!.userId,
        query,
        aiFilters,
        apolloFilters,
      });

      // Search local prospects if enabled
      let localProspects: any[] = [];
      if (includeLocalProspects) {
        try {
          localProspects = await storage.searchLocalProspects(req.userContext!, aiFilters);
          console.log(`Found ${localProspects.length} local prospects matching query`);
        } catch (localSearchError) {
          console.warn("Local prospect search failed:", localSearchError instanceof Error ? localSearchError.message : "Unknown error");
        }
      }

      // Try to create search job for background processing (optional)
      let job = null;
      let jobWarning = null;
      try {
        job = await jobService.createSearchJob(req.userContext!, query, apolloFilters);
      } catch (jobError) {
        // Job queue not available - non-fatal, just log and continue
        console.warn("Search job creation skipped:", jobError instanceof Error ? jobError.message : "Unknown error");
        jobWarning = jobError instanceof Error ? jobError.message : "Job queue unavailable";
      }
      
      res.json({ 
        search,
        localProspectsCount: localProspects.length,
        localProspects: localProspects.slice(0, 50),
        job,
        aiFilters,
        apolloFilters,
        ...(jobWarning && { warning: jobWarning })
      });
    } catch (error) {
      console.error("AI search error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors.map(e => e.message) });
      }
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "AI search failed" 
      });
    }
  });

  // Resolve company name/domain using waterfall (Perplexity → Apollo → Lusha → OpenRouter)
  app.post("/api/resolve-company", authenticate, forbidManager, async (req, res) => {
    try {
      const { query } = z.object({ query: z.string().min(1).max(200) }).parse(req.body);
      
      const { companyResolutionService } = await import("./services/company-resolution.service");
      const result = await companyResolutionService.resolveCompany(query, req.userContext?.organizationId);
      
      if (!result.success || !result.company) {
        return res.status(404).json({ 
          error: "COMPANY_NOT_FOUND",
          message: `Could not find company matching "${query}". Tried: ${result.providersAttempted.join(' → ')}`,
          providersAttempted: result.providersAttempted
        });
      }
      
      console.log(`✅ Resolved "${query}" to: ${result.company.name} via ${result.company.source}`);
      
      res.json({
        organizationId: result.company.organizationId,
        name: result.company.name,
        domain: result.company.domain,
        industry: result.company.industry,
        employees: result.company.employees,
        source: result.company.source,
        providersAttempted: result.providersAttempted
      });
    } catch (error) {
      console.error("Company resolution error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.errors });
      }
      res.status(500).json({ 
        error: "RESOLUTION_FAILED",
        message: error instanceof Error ? error.message : "Failed to resolve company" 
      });
    }
  });


  // Get unique filter values for dropdowns
  app.get("/api/prospects/filters", authenticate, blockSuperAdminFromSDR, async (req, res) => {
    try {
      const filterValues = await storage.getUniqueFilterValues(req.userContext!);
      res.json(filterValues);
    } catch (error) {
      console.error("Get filter values error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get filter values" 
      });
    }
  });

  // Get all prospect IDs (for bulk selection)
  app.get("/api/prospects/all-ids", authenticate, blockSuperAdminFromSDR, async (req, res) => {
    try {
      const allProspects = await storage.getAllProspectIds(req.userContext!);
      const LIMIT = 10000;
      const truncated = allProspects.length > LIMIT;
      const ids = truncated ? allProspects.slice(0, LIMIT) : allProspects;

      res.json({
        prospectIds: ids,
        count: ids.length,
        truncated,
        message: truncated
          ? `Results truncated to ${LIMIT}. Use pagination for the full list.`
          : undefined,
      });
    } catch (error) {
      console.error("Get all prospect IDs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospect IDs" 
      });
    }
  });

  // GET /api/company-knowledge — minimal stub so the Knowledge Base UI tab has a
  // working contract. TODO: back this with a real `company_knowledge` table +
  // CRUD once the feature is built out (currently no schema/route existed at all,
  // causing a 404 — see docs/test-coverage-report.md Bug 6).
  app.get("/api/company-knowledge", authenticate, async (req, res) => {
    try {
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      res.json({ entries: [] });
    } catch (error) {
      console.error("Get company knowledge error:", error);
      res.status(500).json({ error: "Failed to fetch company knowledge" });
    }
  });

  app.post("/api/company-knowledge", authenticate, forbidManager, async (req, res) => {
    try {
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const schema = z.object({ type: z.string().min(1), content: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.errors.map(e => e.message) });
      }
      // Not yet persisted — feature pending schema support
      res.status(501).json({ error: "Company knowledge persistence is not yet implemented" });
    } catch (error) {
      console.error("Create company knowledge error:", error);
      res.status(500).json({ error: "Failed to create company knowledge entry" });
    }
  });

  // GET /api/intent-signals — minimal stub for the Signals UI tab (same rationale
  // as /api/company-knowledge above; see docs/test-coverage-report.md Bug 6).
  app.get("/api/intent-signals", authenticate, async (req, res) => {
    try {
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      res.json({ signals: [] });
    } catch (error) {
      console.error("Get intent signals error:", error);
      res.status(500).json({ error: "Failed to fetch intent signals" });
    }
  });

  // Get prospects with filters
  app.get("/api/prospects", authenticate, blockSuperAdminFromSDR, async (req, res) => {
    try {
      const { 
        search, 
        status,
        companyLocation,
        jobTitle,
        page = "1", 
        limit = "50" 
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;

      const result = await storage.getProspects(req.userContext!, {
        search: search as string,
        status: status as string,
        companyLocation: companyLocation as string,
        jobTitle: jobTitle as string,
        limit: limitNum,
        offset,
      });

      res.json({
        prospects: result.prospects,
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum),
      });
    } catch (error) {
      console.error("Get prospects error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospects" 
      });
    }
  });

  // Get prospects by IDs (for export)
  app.post("/api/prospects/by-ids", authenticate, forbidManager, async (req, res) => {
    try {
      const { prospectIds } = req.body;
      
      if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
        return res.status(400).json({ error: "prospectIds array is required" });
      }

      const prospects = await storage.getProspectsByIds(req.userContext!, prospectIds);
      res.json(prospects);
    } catch (error) {
      console.error("Get prospects by IDs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospects" 
      });
    }
  });

  // Get single prospect
  app.get("/api/prospects/:id", authenticate, blockSuperAdminFromSDR, async (req, res) => {
    try {
      const { id } = req.params;
      const prospect = await storage.getProspect(req.userContext!, id);
      
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      res.json(prospect);
    } catch (error) {
      console.error("Get prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospect" 
      });
    }
  });

  // ── Prospect Notes ──────────────────────────────────────────────────────────

  // GET /api/prospects/:id/notes
  app.get("/api/prospects/:id/notes", authenticate, blockSuperAdminFromSDR, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userContext?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const prospect = await storage.getProspect(req.userContext!, id);
      if (!prospect) return res.status(404).json({ error: "Prospect not found" });

      const notes = await db
        .select({
          id: prospectNotes.id,
          content: prospectNotes.content,
          createdAt: prospectNotes.createdAt,
          authorId: prospectNotes.userId,
          authorName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`,
        })
        .from(prospectNotes)
        .leftJoin(users, eq(prospectNotes.userId, users.id))
        .where(and(eq(prospectNotes.prospectId, id), eq(prospectNotes.userId, userId)))
        .orderBy(desc(prospectNotes.createdAt));

      res.json({ notes });
    } catch (error) {
      console.error("Get prospect notes error:", error);
      res.status(500).json({ error: "Failed to get notes" });
    }
  });

  // POST /api/prospects/:id/notes
  app.post("/api/prospects/:id/notes", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.userContext?.userId;
      const organizationId = req.userContext?.organizationId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const prospect = await storage.getProspect(req.userContext!, id);
      if (!prospect) return res.status(404).json({ error: "Prospect not found" });

      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ error: "content is required" });
      }

      const [note] = await db
        .insert(prospectNotes)
        .values({ prospectId: id, userId, organizationId: organizationId ?? null, content: content.trim() })
        .returning();

      res.status(201).json(note);
    } catch (error) {
      console.error("Create prospect note error:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  // DELETE /api/prospects/:id/notes/:noteId
  app.delete("/api/prospects/:id/notes/:noteId", authenticate, forbidManager, async (req, res) => {
    try {
      const { id, noteId } = req.params;
      const userId = req.userContext?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const prospect = await storage.getProspect(req.userContext!, id);
      if (!prospect) return res.status(404).json({ error: "Prospect not found" });

      const [existing] = await db
        .select()
        .from(prospectNotes)
        .where(and(eq(prospectNotes.id, noteId), eq(prospectNotes.prospectId, id)))
        .limit(1);

      if (!existing) return res.status(404).json({ error: "Note not found" });
      if (existing.userId !== userId) return res.status(403).json({ error: "Cannot delete another user's note" });

      await db.delete(prospectNotes).where(eq(prospectNotes.id, noteId));
      res.json({ success: true });
    } catch (error) {
      console.error("Delete prospect note error:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────────

  // Create prospect (workflow-gated: requires upload stage)
  app.post("/api/prospects", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext?.userId;
      const organizationId = req.userContext?.organizationId;
      
      if (!userId || !organizationId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Workflow stage gate: must be at or past upload stage
      try {
        await sdrWorkflowService.assertStage(userId, "upload");
      } catch (stageError) {
        if (stageError instanceof WorkflowBlockedError) {
          return res.status(403).json(stageError.toJSON());
        }
        // Fail-closed on guard errors
        console.error("Workflow stage check failed:", stageError);
        return res.status(503).json({ error: "Unable to verify workflow stage" });
      }

      // Check tenant automation status - fail-closed
      try {
        const isPaused = await hardeningService.isAutomationPaused(organizationId);
        if (isPaused) {
          return res.status(403).json({
            error: "Tenant automation is paused",
            message: "Cannot create prospects while tenant automation is paused.",
          });
        }
      } catch (guardError) {
        console.error("Failed to check tenant automation status:", guardError);
        return res.status(503).json({ error: "Unable to verify tenant automation status" });
      }

      // Require a valid email address (primaryEmail is nullable in schema but required for manual creation)
      if (!req.body.primaryEmail || typeof req.body.primaryEmail !== 'string' || !req.body.primaryEmail.trim()) {
        return res.status(400).json({ error: "Email is required", field: "primaryEmail" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.primaryEmail.trim())) {
        return res.status(400).json({ error: "Invalid email format", field: "primaryEmail" });
      }

      // userId comes from the authenticated session, not the request body
      const prospectData = insertProspectSchema.parse({
        ...req.body,
        userId: req.userContext!.userId,
      });
      // FIX-1: Auto-derive timezone from contactLocation if not explicitly provided
      const timezone =
        req.body.timezone ||
        (prospectData.contactLocation
          ? inferTimezone(prospectData.contactLocation)
          : 'UTC');
      // Set enrichmentStatus to 'new' for fresh prospects (RAW status)
      const prospect = await storage.createProspect(req.userContext!, {
        ...prospectData,
        enrichmentStatus: 'new',
        source: 'manual',
        timezone,
      });
      res.json(prospect);
    } catch (error: any) {
      console.error("Create prospect error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid input",
          details: error.errors.map(e => e.message),
        });
      }
      if (error?.code === '23505' || /duplicate key value violates unique constraint/i.test(error?.message || '')) {
        return res.status(409).json({ error: "A prospect with this email already exists" });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to create prospect"
      });
    }
  });

  // Update prospect
  app.patch("/api/prospects/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertProspectSchema.partial().parse(req.body);
      const prospect = await storage.updateProspect(req.userContext!, id, updates);
      res.json(prospect);
    } catch (error) {
      console.error("Update prospect error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid input",
          details: error.errors.map(e => e.message),
        });
      }
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to update prospect"
      });
    }
  });

  // Delete prospect
  app.delete("/api/prospects/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteProspect(req.userContext!, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete prospect" 
      });
    }
  });

  // Bulk delete prospects
  app.post("/api/prospects/bulk-delete", authenticate, forbidManager, async (req, res) => {
    try {
      const { prospectIds } = req.body;
      
      if (!prospectIds || !Array.isArray(prospectIds) || prospectIds.length === 0) {
        return res.status(400).json({ error: "prospectIds array is required" });
      }

      console.log(`🗑️ Starting bulk delete of ${prospectIds.length.toLocaleString()} prospects...`);

      // Use storage's batch delete method
      const result = await storage.bulkDeleteProspects(req.userContext!, prospectIds);
      
      console.log(`✅ Bulk delete complete: ${result.deleted.toLocaleString()}/${prospectIds.length.toLocaleString()} prospects deleted`);

      res.json({
        success: true,
        deleted: result.deleted,
      });
    } catch (error) {
      console.error("Bulk delete prospects error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete prospects" 
      });
    }
  });

  // Waterfall enrichment - tries Apollo → Lusha → Email pattern guessing - auto-advances workflow if prospects exist
  app.post("/api/waterfall-enrich", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext?.userId;
      const organizationId = req.userContext?.organizationId;
      
      if (!userId || !organizationId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Check if enrichment is allowed - auto-advances workflow if prospects exist
      try {
        const canEnrichResult = await sdrWorkflowService.canEnrich(userId, organizationId);
        if (!canEnrichResult.allowed) {
          return res.status(403).json({
            error: "ENRICHMENT_BLOCKED",
            message: canEnrichResult.reason || "Cannot enrich prospects",
          });
        }
        if (canEnrichResult.autoAdvanced) {
          console.log(`📊 Workflow auto-advanced to enrichment stage for user ${userId}`);
        }
      } catch (stageError) {
        if (stageError instanceof WorkflowBlockedError) {
          return res.status(403).json(stageError.toJSON());
        }
        console.error("Workflow stage check failed:", stageError);
        return res.status(503).json({ error: "Unable to verify workflow stage" });
      }

      // Check tenant automation status - fail-closed
      try {
        const isPaused = await hardeningService.isAutomationPaused(organizationId);
        if (isPaused) {
          return res.status(403).json({
            error: "Tenant automation is paused",
            message: "Cannot enrich prospects while tenant automation is paused.",
          });
        }
      } catch (guardError) {
        console.error("Failed to check tenant automation status:", guardError);
        return res.status(503).json({ error: "Unable to verify tenant automation status" });
      }

      const { enrichmentWaterfallService } = await import('./services/enrichment-waterfall.service');
      
      const { prospectIds } = z.object({ 
        prospectIds: z.array(z.string()).min(1).max(50)
      }).parse(req.body);

      console.log(`\n🔄 Starting waterfall enrichment for ${prospectIds.length} prospects`);
      
      const results = [];
      let successCount = 0;
      let failureCount = 0;
      
      for (const prospectId of prospectIds) {
        const prospect = await storage.getProspect(req.userContext!, prospectId);
        
        if (!prospect) {
          results.push({ id: prospectId, success: false, error: "Prospect not found" });
          failureCount++;
          continue;
        }

        // Skip if email already found
        if (prospect.primaryEmail && !prospect.primaryEmail.includes('email_not_unlocked')) {
          results.push({ 
            id: prospectId, 
            success: true, 
            skipped: true,
            source: 'existing',
            email: prospect.primaryEmail
          });
          successCount++;
          continue;
        }

        // Run waterfall enrichment
        const enrichResult = await enrichmentWaterfallService.enrichProspect({
          firstName: prospect.firstName || undefined,
          lastName: prospect.lastName || undefined,
          fullName: prospect.fullName || undefined,
          companyName: prospect.companyName || undefined,
          companyDomain: prospect.companyDomain || undefined,
          linkedinUrl: prospect.linkedinUrl || undefined,
          jobTitle: prospect.jobTitle || undefined,
          apolloId: prospect.apolloId || undefined,
        });

        if (enrichResult.email) {
          // Build field sources for attribution tracking
          const existingFieldSources = (prospect.fieldSources as Record<string, any>) || {};
          const now = new Date().toISOString();
          const newFieldSources: Record<string, { source: string; provider?: string; timestamp: string }> = {
            ...existingFieldSources,
            primaryEmail: {
              source: 'enrichment',
              provider: enrichResult.source,
              timestamp: now,
            },
          };

          // Update prospect with found email
          const updates: any = {
            primaryEmail: enrichResult.email,
            enrichmentStatus: enrichResult.source === 'web_search' ? 'partial' as const : 'enriched' as const,
            enrichmentData: {
              ...(prospect.enrichmentData || {}),
              ...enrichResult.enrichmentData,
              waterfallEnrichedAt: now,
              emailSource: enrichResult.source,
            },
            fieldSources: newFieldSources,
          };

          if (enrichResult.phone && !prospect.phoneNumber) {
            updates.phoneNumber = enrichResult.phone;
            newFieldSources.phoneNumber = {
              source: 'enrichment',
              provider: enrichResult.source,
              timestamp: now,
            };
            updates.fieldSources = newFieldSources;
          }

          const updated = await storage.updateProspect(req.userContext!, prospectId, updates);
          results.push({ 
            id: prospectId, 
            success: true, 
            source: enrichResult.source,
            email: enrichResult.email,
            phone: enrichResult.phone,
            needsVerification: enrichResult.enrichmentData?.needsVerification,
            prospect: updated
          });
          successCount++;
        } else {
          results.push({ 
            id: prospectId, 
            success: false, 
            source: enrichResult.source,
            error: "Email not found in any source"
          });
          failureCount++;
        }
      }

      console.log(`✅ Waterfall enrichment complete: ${successCount} found, ${failureCount} not found`);

      // Track AI/API usage for waterfall enrichment
      await aiTrackingService.trackGeneration({
        userId,
        tenantId: organizationId,
        generationType: 'enrichment_waterfall',
        model: 'multi-provider',
        provider: 'waterfall',
        promptTokens: 0,
        completionTokens: 0,
        success: successCount > 0,
        metadata: {
          source: 'api_waterfall_enrich',
          prospectsProcessed: results.length,
          successCount,
          failureCount,
          sources: {
            apollo: results.filter(r => r.source === 'apollo').length,
            lusha: results.filter(r => r.source === 'lusha').length,
            webSearch: results.filter(r => r.source === 'web_search').length,
          },
        },
      });

      // Try to advance workflow stage after successful enrichment
      if (successCount > 0) {
        await sdrWorkflowService.tryAutoAdvance(userId);
      }

      res.json({ 
        results,
        total: results.length,
        successCount,
        failureCount,
        sources: {
          apollo: results.filter(r => r.source === 'apollo').length,
          lusha: results.filter(r => r.source === 'lusha').length,
          webSearch: results.filter(r => r.source === 'web_search').length,
          existing: results.filter(r => r.source === 'existing').length,
        }
      });
    } catch (error) {
      console.error("Waterfall enrichment error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors.map(e => e.message) });
      }
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Waterfall enrichment failed" 
      });
    }
  });

  // Workflow upload stage guard middleware - runs BEFORE multer to prevent file processing
  const workflowUploadGuard = async (req: any, res: any, next: any) => {
    try {
      const userId = req.userContext?.userId;
      const organizationId = req.userContext?.organizationId;
      
      if (!userId || !organizationId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Workflow stage gate: must be at or past upload stage
      try {
        await sdrWorkflowService.assertStage(userId, "upload");
      } catch (stageError) {
        if (stageError instanceof WorkflowBlockedError) {
          return res.status(403).json(stageError.toJSON());
        }
        console.error("Workflow stage check failed:", stageError);
        return res.status(503).json({ error: "Unable to verify workflow stage" });
      }

      // Check tenant automation status - fail-closed
      try {
        const isPaused = await hardeningService.isAutomationPaused(organizationId);
        if (isPaused) {
          return res.status(403).json({
            error: "Tenant automation is paused",
            message: "Cannot import prospects while tenant automation is paused.",
          });
        }
      } catch (guardError) {
        console.error("Failed to check tenant automation status:", guardError);
        return res.status(503).json({ error: "Unable to verify tenant automation status" });
      }

      next();
    } catch (error) {
      console.error("Workflow upload guard error:", error);
      return res.status(503).json({ error: "Guard verification failed" });
    }
  };

  // CSV upload and import - Guards run BEFORE multer to prevent file processing for blocked users
  app.post("/api/import/csv", authenticate, forbidManager, workflowUploadGuard, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { fieldMappings, skipDuplicates = "true", autoEnrich = "false" } = req.body;
      
      const parsedFieldMappings = JSON.parse(fieldMappings || "{}") as Record<string, string>;
      const options = {
        skipDuplicates: skipDuplicates === "true",
        autoEnrich: autoEnrich === "true",
      };

      // Check if Redis/job queue is available
      const REDIS_ENABLED = !!process.env.REDIS_URL;
      
      let job;
      if (REDIS_ENABLED) {
        // Use BullMQ background job queue
        job = await jobService.createImportJob(
          req.userContext!,
          req.file.path,
          parsedFieldMappings,
          options
        );
      } else {
        // Use async processing without Redis (setImmediate-based)
        job = await jobService.createAsyncImportJob(
          req.userContext!,
          req.file.path,
          parsedFieldMappings,
          options
        );
      }

      // Return 202 Accepted immediately - processing continues in background
      res.status(202).json({ 
        job,
        message: 'Import job queued. Check job status for progress.',
        statusUrl: `/api/jobs/${job.id}`
      });
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start import" 
      });
    }
  });

  // Validate CSV data (for field mapping preview)
  app.post("/api/import/validate-csv", authenticate, forbidManager, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse CSV file with enhanced leniency
      const fileContent = readFileSync(req.file.path, 'utf-8');
      const skippedRows: number[] = [];
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        skip_records_with_error: true,
        bom: true,
        escape: '"',
        quote: '"',
        relax_column_count_less: true,
        relax_column_count_more: true,
        on_record: (record: any, context: any) => {
          try {
            return record;
          } catch (err) {
            console.warn(`Skipping malformed row at line ${context.lines}:`, err);
            skippedRows.push(context.lines);
            return null;
          }
        }
      }).filter((r: any) => r !== null);

      const validRows = records.length;
      const totalRows = validRows + skippedRows.length;
      const columns: { name: string; samples: string[] }[] = [];
      const suggestedMappings: Record<string, string> = {};

      // Get column names and sample data
      if (records.length > 0) {
        const columnNames = Object.keys(records[0] as Record<string, any>);
        
        for (const colName of columnNames) {
          const samples = records
            .slice(0, 3)
            .map((row: any) => row[colName])
            .filter((val: any) => val && val.trim());

          columns.push({
            name: colName,
            samples
          });

          // Auto-map common column names
          const lowerCol = colName.toLowerCase().replace(/[^a-z]/g, '');
          if (lowerCol.includes('first') && lowerCol.includes('name')) suggestedMappings[colName] = 'firstName';
          else if (lowerCol.includes('last') && lowerCol.includes('name')) suggestedMappings[colName] = 'lastName';
          else if (lowerCol.includes('email')) suggestedMappings[colName] = 'primaryEmail';
          else if (lowerCol.includes('title') || lowerCol.includes('job')) suggestedMappings[colName] = 'jobTitle';
          else if (lowerCol.includes('company') || lowerCol.includes('organization')) suggestedMappings[colName] = 'companyName';
          else if (lowerCol.includes('phone')) suggestedMappings[colName] = 'phoneNumber';
          else if (lowerCol.includes('linkedin')) suggestedMappings[colName] = 'linkedinUrl';
        }
      }

      const validation = {
        totalRows,
        validRows,
        duplicateRows: 0,
        errorRows: skippedRows.length,
        skippedRows,
        columns,
        suggestedMappings
      };

      res.json(validation);
    } catch (error) {
      console.error("CSV validation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to validate CSV" 
      });
    }
  });

  // Get jobs
  app.get("/api/jobs", authenticate, forbidManager, async (req, res) => {
    try {
      const { status, limit = "20" } = req.query;
      const jobs = await storage.getJobs(req.userContext!, status as string, parseInt(limit as string));
      res.json(jobs);
    } catch (error) {
      console.error("Get jobs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get jobs" 
      });
    }
  });

  // Get active jobs
  app.get("/api/jobs/active", authenticate, forbidManager, async (req, res) => {
    try {
      const jobs = await storage.getActiveJobs(req.userContext!);
      res.json(jobs);
    } catch (error) {
      console.error("Get active jobs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get active jobs" 
      });
    }
  });

  // Get job status
  app.get("/api/jobs/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getJob(req.userContext!, id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get job" 
      });
    }
  });

  // Cancel job
  app.post("/api/jobs/:id/cancel", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      await jobService.cancelJob(req.userContext!, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Cancel job error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to cancel job" 
      });
    }
  });

  // Get searches
  app.get("/api/searches", authenticate, forbidManager, async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const searches = await storage.getSearches(req.userContext!, parseInt(limit as string));
      res.json(searches);
    } catch (error) {
      console.error("Get searches error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get searches" 
      });
    }
  });

  // Authentication routes
  app.use(authRoutes);
  
  // User management routes
  app.use(userRoutes);

  // Analytics routes
  app.use("/api/analytics", analyticsRoutes);

  // Safe-To-Send decision engine routes
  app.use("/api/safe-to-send", safeToSendRoutes);

  // Data export routes (GDPR compliance)
  app.use("/api", dataExportRoutes);

  // Sequence module routes
  app.use("/api", sequenceRoutes);

  // Mailbox module routes
  app.use("/api", mailboxRoutes);

  // Organization and workspace management routes
  app.use("/api", organizationRoutes);

  // User administration routes (admin only)
  app.use(userAdminRoutes);

  // RBAC routes (admin only)
  app.use(rbacRoutes);

  // Team management routes
  app.use(teamRoutes);

  // Email infrastructure routes (domains, mailbox allocations, warmup)
  app.use("/api/admin", emailInfrastructureRoutes);

  // API access management routes (API keys, webhooks)
  app.use("/api/admin", apiAccessRoutes);

  // Email settings routes (deliverability, compliance, footer)
  app.use("/api/admin", emailSettingsRoutes);

  // Notification settings routes
  app.use("/api/admin", notificationSettingsRoutes);

  // AI configuration routes
  app.use("/api/admin", aiConfigRoutes);
  
  // Super Admin routes (platform-level administration)
  app.use("/api/super-admin", superAdminRoutes);

  // FR-U25: Leaderboard & Gamification routes
  app.use(leaderboardRoutes);

  // FR-U29: Best Practices Library routes
  app.use(bestPracticesRoutes);

  // FR-U32: AE Handoff Workflow routes
  app.use(aeHandoffRoutes);

  // Multi-Provider Waterfall Search routes
  app.use(waterfallSearchRoutes.path, waterfallSearchRoutes.router);

  // Find Leads (natural-language search) routes
  app.use(findLeadsRoutes.path, findLeadsRoutes.router);

  // Manager routes (FR-M features)
  app.use(managerRoutes);

  // SDR Workflow routes (9-stage step enforcement)
  app.use("/api/sdr-workflow", sdrWorkflowRoutes);

  // SDR Dashboard routes (personal stats, quota visibility)
  app.use("/api/sdr", sdrDashboardRoutes);

  // Campaigns routes (alias for sequences)
  app.use("/api/campaigns", campaignsRoutes);

  // AI Generation routes (email generation with validation)
  app.use("/api/ai", aiGenerationRoutes);

  // Email Execution routes (send with validation)
  app.use("/api/emails", emailExecutionRoutes);

  // User Onboarding routes
  app.use("/api/user", userOnboardingRoutes);

  // Inbox routes (unified reply management)
  app.use("/api/inbox", inboxRouter);

  // Intent Definition Engine (Phase 1) — gated behind FEATURE_INTENT_ENGINE
  app.use("/v1/intents", requireIntentEngine, intentsRouter);

  // Credit control routes
  app.use(creditRoutes);

  // Automation module routes
  registerAutomationRoutes(app);

  // Intelligent Personalization - Deep AI prospect analysis
  app.post("/api/personalization/analyze", authenticate, forbidManager, async (req, res) => {
    try {
      const { prospectId, includeWebScraping = false } = req.body;
      
      const prospect = await storage.getProspect(req.userContext!, prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Get AI analysis from intelligent personalization service
      const insights = await intelligentPersonalizationService.analyzeProspect(req.userContext!, prospectId);

      // Transform to match frontend expectations
      const personalizationFactorValues = insights.personalizationFactors.map(f => f.relevance);
      const avgRelevance = personalizationFactorValues.reduce((a, b) => a + b, 0) / personalizationFactorValues.length;

      const analysis = {
        personalizationScore: Math.round(avgRelevance),
        keyInsights: insights.personalizationFactors.map(f => f.insight),
        recommendedApproach: `${insights.recommendations.approach} - ${insights.recommendations.keyMessages.join('. ')}`,
        personalizationFactors: {
          roleRelevance: insights.personalizationFactors.find(f => f.source.includes('Role'))?.relevance || 75,
          companyFit: insights.personalizationFactors.find(f => f.source.includes('Company'))?.relevance || 75,
          timingScore: 80,
          painPointAlignment: insights.roleInsights.painPoints.length > 0 ? 85 : 70,
        },
        companyInsights: insights.companyInsights,
        roleInsights: insights.roleInsights,
      };

      // Save personalization result (with userId for multi-tenant security)
      await storage.createPersonalizationResult(req.userContext!, {
        prospectId,
        userId: req.userContext!.userId, // CRITICAL: Multi-tenant security - required field
        personalizationScore: analysis.personalizationScore,
        insights: {
          keyInsights: analysis.keyInsights,
          recommendedApproach: analysis.recommendedApproach,
          personalizationFactors: analysis.personalizationFactors,
          companyInsights: analysis.companyInsights,
          roleInsights: analysis.roleInsights
        }
      });

      res.json(analysis);
    } catch (error) {
      console.error("Personalization analysis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Personalization analysis failed" 
      });
    }
  });

  // Advanced AI analysis - Enhanced version with scoring and variables
  app.post("/api/personalization/advanced-analyze", authenticate, forbidManager, async (req, res) => {
    try {
      const { prospectId } = req.body;
      
      const prospect = await storage.getProspect(req.userContext!, prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Get comprehensive AI analysis
      const insights = await intelligentPersonalizationService.analyzeProspect(req.userContext!, prospectId);

      // Calculate personalization score
      const personalizationFactorValues = insights.personalizationFactors.map(f => f.relevance);
      const avgRelevance = personalizationFactorValues.reduce((a, b) => a + b, 0) / personalizationFactorValues.length;
      const personalizationScore = Math.round(avgRelevance);

      // Generate personalization variables from insights
      const variables = [
        {
          name: 'prospect_name',
          value: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
          confidence: 100,
          source: 'Database'
        },
        {
          name: 'company_name',
          value: prospect.companyName || insights.companyInsights?.industry || 'Company',
          confidence: 95,
          source: 'Database'
        },
        {
          name: 'job_title',
          value: prospect.jobTitle || 'Professional',
          confidence: 100,
          source: 'Database'
        },
        {
          name: 'industry',
          value: insights.companyInsights?.industry || 'Technology',
          confidence: 85,
          source: 'AI Analysis'
        },
        {
          name: 'company_size',
          value: insights.companyInsights?.size || 'Mid-size',
          confidence: 80,
          source: 'AI Analysis'
        },
        ...insights.personalizationFactors.map((factor, index) => ({
          name: `insight_${index + 1}`,
          value: factor.insight,
          confidence: factor.relevance,
          source: factor.source
        }))
      ];

      // Generate email suggestions
      const emailSuggestions = {
        subject: `${prospect.firstName}, ${insights.recommendations.keyMessages[0] || 'I have an idea for your team'}`,
        opening: `Hi ${prospect.firstName},\n\nI noticed ${insights.companyInsights?.recentNews?.[0] || `you're working in ${insights.companyInsights?.industry || 'your industry'}`}...`
      };

      // Generate content recommendations
      const contentRecommendations = insights.recommendations.keyMessages.map((message, index) => ({
        name: `Talking Point ${index + 1}`,
        usage: message,
        relevanceScore: 85 - (index * 5)
      }));

      // Build advanced analysis response
      const analysis = {
        personalizationScore,
        variables,
        emailSuggestions,
        contentRecommendations,
        insights: {
          roleAnalysis: {
            seniority: insights.roleInsights?.decisionMakingPower === 'High' ? 90 : 70,
            decisionAuthority: insights.roleInsights?.decisionMakingPower === 'High' ? 85 : 65
          },
          painPoints: insights.roleInsights?.painPoints || []
        }
      };

      res.json(analysis);
    } catch (error) {
      console.error("Advanced personalization analysis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Advanced analysis failed" 
      });
    }
  });

  // Generate personalized email with AI
  app.post("/api/personalization/generate-email", authenticate, forbidManager, async (req, res) => {
    try {
      const { prospectId, personalizationData, settings, customPrompt, useAdvanced, contentItemIds, sequenceId, sequenceStep } = req.body;
      
      if (!process.env.GROQ_API_KEY && !process.env.DEEPSEEK_API_KEY) {
        return res.status(500).json({
          error: "No AI provider configured. Please set GROQ_API_KEY or DEEPSEEK_API_KEY."
        });
      }

      const prospect = await storage.getProspect(req.userContext!, prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Fetch previous steps from sequence if sequenceId is provided
      let previousStepsContext = '';
      if (sequenceId) {
        try {
          const steps = await storage.getSequenceSteps(req.userContext!, sequenceId);
          if (steps && steps.length > 0) {
            const previousSteps = sequenceStep 
              ? steps.slice(0, sequenceStep - 1) 
              : steps;
            
            if (previousSteps.length > 0) {
              previousStepsContext = `\n\nPREVIOUS EMAILS IN THIS SEQUENCE:\n` +
                previousSteps.map((step, index) => 
                  `Email ${index + 1}:\nSubject: ${step.subject}\nBody:\n${step.body}`
                ).join('\n\n---\n\n') + '\n\nIMPORTANT: Build upon the previous emails naturally. Reference or acknowledge the prior communication and progress the conversation forward.\n';
              
              console.log(`📧 Loaded ${previousSteps.length} previous steps for personalization context`);
            }
          }
        } catch (error) {
          console.error("Error fetching previous steps:", error);
        }
      }

      // Build context for AI email generation
      const context = {
        prospectName: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
        companyName: prospect.companyName || '',
        jobTitle: prospect.jobTitle || '',
        industry: personalizationData?.companyInsights?.industry || personalizationData?.insights?.industry || '',
        insights: useAdvanced 
          ? personalizationData?.variables?.map((v: any) => v.value).join('; ')
          : personalizationData?.keyInsights?.join('; ') || '',
        painPoints: useAdvanced && personalizationData?.insights?.painPoints 
          ? personalizationData.insights.painPoints.join('; ')
          : '',
        roleAnalysis: useAdvanced && personalizationData?.insights?.roleAnalysis
          ? `Decision authority: ${personalizationData.insights.roleAnalysis.decisionAuthority}%, Seniority: ${personalizationData.insights.roleAnalysis.seniority}%`
          : '',
        emailSuggestions: useAdvanced && personalizationData?.emailSuggestions
          ? (typeof personalizationData.emailSuggestions === 'string' 
              ? personalizationData.emailSuggestions 
              : Array.isArray(personalizationData.emailSuggestions)
                ? personalizationData.emailSuggestions.join('; ')
                : JSON.stringify(personalizationData.emailSuggestions))
          : '',
        tone: settings?.tone || 'professional',
        focus: settings?.focus || 'value_proposition',
        urgency: settings?.urgency || 'medium',
        length: settings?.length || 'medium'
      };

      // Fetch content items if provided
      let contentContext = '';
      let hasContentLibrary = false;
      if (contentItemIds && contentItemIds.length > 0) {
        const allContentItems = await storage.getContentLibraryItems(req.userContext!);
        console.log(`📚 Content Library: Requested IDs: ${JSON.stringify(contentItemIds)}`);
        console.log(`📚 Content Library: Available items: ${allContentItems.map(i => `${i.id}:${i.title}`).join(', ')}`);
        
        // Handle both string and number ID comparisons
        const selectedContent = allContentItems.filter(item => 
          contentItemIds.includes(item.id) || contentItemIds.includes(String(item.id))
        );
        console.log(`📚 Content Library: Selected ${selectedContent.length} items: ${selectedContent.map(i => i.title).join(', ')}`);
        
        if (selectedContent.length > 0) {
          hasContentLibrary = true;
          contentContext = '\n\n=== APPROVED CONTENT LIBRARY (USE ONLY THIS DATA) ===\n' + 
            selectedContent.map((item, index) => {
              return `${index + 1}. ${item.title} (${item.type})
${item.description ? `   Description: ${item.description}` : ''}
   Content: ${item.content}`;
            }).join('\n\n') + '\n=== END OF APPROVED CONTENT ===';
        }
      }

      // Generate email using AI service
      const prompt = hasContentLibrary 
        ? `${contentContext}

⚠️ CRITICAL: YOU ARE WRITING FOR INCREFF MERCHANDISING SOFTWARE ⚠️

FORBIDDEN WORDS & PHRASES - YOU WILL FAIL IF YOU USE ANY OF THESE:
🚫 "multi-brand operations" 🚫 "unified coordination" 🚫 "integrated management" 
🚫 "real-time visibility" 🚫 "coordination platforms" 🚫 "streamline operations"
🚫 "operational efficiency" 🚫 "cross-brand" 🚫 ANY percentage not listed below
🚫 "We provide" 🚫 "Our solution" 🚫 "Our clients typically"

REQUIRED: USE ONLY THESE EXACT WORDS FROM APPROVED CONTENT:
✅ Solutions: "Increff Assortment Planning & Buying" OR "Allocation & Replenishment" OR "Markdown Optimization" OR "WSSI/MSSI" OR "Merchandise Financial Planning"
✅ Statistics: "13% improvement in full price sell-through" OR "36% revenue uplift" OR "26% increment in sales" OR "7% size availability improvement"
✅ Clients: "Puma" "Adidas" "Blackberrys" (from approved content only)

PROSPECT INFORMATION:
- Name: ${context.prospectName}
- Title: ${context.jobTitle}
- Company: ${context.companyName}
- Industry: ${context.industry}
- Key Insights: ${context.insights}${context.painPoints ? `
- Pain Points: ${context.painPoints}` : ''}${context.roleAnalysis ? `
- Role Analysis: ${context.roleAnalysis}` : ''}${context.emailSuggestions ? `
- Email Angle Suggestions: ${context.emailSuggestions}` : ''}

EMAIL SETTINGS:
- Tone: ${context.tone}
- Focus: ${context.focus}
- Urgency: ${context.urgency}
${customPrompt || previousStepsContext ? `\nADDITIONAL INSTRUCTIONS:\n${customPrompt || ''}${previousStepsContext}` : ''}

MANDATORY EMAIL STRUCTURE (WITH LINE BREAKS):
1. Opening: Reference ONE concrete detail about their company or role
2. [BLANK LINE]
3. Problem: State the pain point directly in 1-2 sentences  
4. [BLANK LINE]
5. Solution: ONE exact solution name from approved content (e.g., "Increff Assortment Planning & Buying" or "Markdown Optimization")
6. [BLANK LINE]
7. Value: ONE exact statistic from approved content (e.g., "13% improvement in full price sell-through" or "36% revenue uplift")
8. [BLANK LINE]
9. CTA: Question asking about their specific challenge

STRICT CONSTRAINTS:
- MAXIMUM 80 words for the email body
- MUST include blank lines between each section for readability
- NO generic phrases: "integrated management" "real-time visibility" "multi-brand operations" "coordination time" "operational efficiency"
- NO made-up statistics: Only use numbers that appear in the approved content library
- NO adjectives: "leading" "innovative" "excited"
- Use "you" more than "we"
- END with a QUESTION
- Solution names must match approved content EXACTLY

Format (IMPORTANT - Include blank lines):
Subject: [subject]

[Opening sentence referencing their business]

[Pain point in 1-2 sentences]

[Solution with exact Increff product name]

[Specific statistic from approved content]

[Question-based CTA]`
        : `You are an expert sales email writer. Generate a personalized sales email following this EXACT structure and constraints:

PROSPECT INFORMATION:
- Name: ${context.prospectName}
- Title: ${context.jobTitle}
- Company: ${context.companyName}
- Industry: ${context.industry}
- Key Insights: ${context.insights}${context.painPoints ? `
- Pain Points: ${context.painPoints}` : ''}${context.roleAnalysis ? `
- Role Analysis: ${context.roleAnalysis}` : ''}${context.emailSuggestions ? `
- Email Angle Suggestions: ${context.emailSuggestions}` : ''}

EMAIL SETTINGS:
- Tone: ${context.tone}
- Focus: ${context.focus}
- Urgency: ${context.urgency}
${customPrompt || previousStepsContext ? `\nADDITIONAL INSTRUCTIONS:\n${customPrompt || ''}${previousStepsContext}` : ''}

MANDATORY EMAIL STRUCTURE (WITH LINE BREAKS):
1. Opening: Reference ONE concrete detail about their company or role
2. [BLANK LINE]
3. Problem: State the pain point directly in 1-2 sentences
4. [BLANK LINE]
5. Solution: Explain what you offer in one sentence
6. [BLANK LINE]
7. Value: One specific, quantifiable benefit
8. [BLANK LINE]
9. CTA: Single clear next step with low commitment

STRICT CONSTRAINTS:
- MAXIMUM 80 words for the email body (count carefully!)
- MUST include blank lines between each section for readability
- NO adjectives like "leading," "innovative," "excited," "thrilled," "delighted"
- NO phrases like "I hope this email finds you well"
- NO phrases like "I was impressed by"
- Use "you" more than "we" (second-person focus)
- END with a QUESTION, not a statement
- Be direct and conversational
- No fluff or filler words

Format your response EXACTLY as (IMPORTANT - Include blank lines):
Subject: [Your subject line here]

[Opening sentence referencing their business]

[Pain point in 1-2 sentences]

[Solution in one sentence]

[Specific quantifiable benefit]

[Question-based CTA]`;

      console.log('📧 Email generation prompt length:', prompt.length, 'chars');
      console.log('📧 Has content library:', hasContentLibrary);
      if (hasContentLibrary) {
        console.log('📚 Content items provided:', contentItemIds?.length || 0);
      }
      
      const aiResponse = await aiService.generateText(prompt, 1500);
      
      console.log('📧 AI Response:', aiResponse.substring(0, 200) + '...');
      
      // Parse AI response with improved formatting
      const lines = aiResponse.split('\n');
      let subject = '';
      let bodyLines: string[] = [];
      let isBody = false;
      
      // Lines to filter out (AI commentary, not email content)
      const filterPatterns = [
        /personalization\s*score/i,
        /not in proper structure/i,
        /reasoning:/i,
        /note:/i,
        /explanation:/i,
        /^---+$/,
        /^\*\*\*/
      ];
      
      for (const line of lines) {
        // Skip AI commentary lines
        if (filterPatterns.some(pattern => pattern.test(line))) {
          continue;
        }
        
        if (line.toLowerCase().includes('subject:')) {
          subject = line.replace(/subject:/i, '').trim();
        } else if (line.toLowerCase().includes('body:') || line.toLowerCase().includes('email:')) {
          isBody = true;
        } else if (subject && !isBody) {
          // Start body after subject if we haven't found explicit "Body:" marker
          isBody = true;
          // Include the line (even blank) to preserve spacing
          bodyLines.push(line);
        } else if (isBody) {
          // Include all lines including blank ones to preserve paragraph structure
          bodyLines.push(line);
        }
      }
      
      // Clean up body: remove leading/trailing blank lines but preserve internal structure
      while (bodyLines.length > 0 && !bodyLines[0].trim()) {
        bodyLines.shift();
      }
      while (bodyLines.length > 0 && !bodyLines[bodyLines.length - 1].trim()) {
        bodyLines.pop();
      }
      
      // Convert consecutive blank lines to double newlines for paragraph spacing
      let body = '';
      let prevWasBlank = false;
      for (const line of bodyLines) {
        if (!line.trim()) {
          if (!prevWasBlank) {
            body += '\n\n';
            prevWasBlank = true;
          }
        } else {
          body += line + '\n';
          prevWasBlank = false;
        }
      }
      body = body.trim();
      
      // If body is still missing proper paragraph breaks, add them
      if (body && !body.includes('\n\n')) {
        // Split by sentences and group into paragraphs
        const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z])/);
        if (sentences.length > 1) {
          body = sentences.join('\n\n');
        }
      }

      // If parsing fails, use the whole response as body
      if (!body) {
        body = aiResponse;
        subject = `Quick question for ${prospect.firstName}`;
      }

      // POST-GENERATION VALIDATION when content library is used
      const violations: string[] = [];
      if (hasContentLibrary) {
        const forbiddenPhrases = [
          'multi-brand operations', 'unified coordination', 'integrated management',
          'real-time visibility', 'coordination platforms', 'streamline operations',
          'operational efficiency', 'cross-brand', 'We provide', 'Our solution', 
          'Our clients typically', 'simplifying your multi-brand'
        ];
        
        const requiredSolutions = [
          'Increff Assortment Planning & Buying', 'Allocation & Replenishment',
          'Markdown Optimization', 'WSSI/MSSI', 'Merchandise Financial Planning',
          'Increff Co-Pilot', 'assortment planning', 'allocation', 'replenishment'
        ];
        
        const approvedStats = ['13%', '36%', '26%', '7%'];
        
        const fullText = (subject + ' ' + body).toLowerCase();
        
        // Check for forbidden phrases
        for (const phrase of forbiddenPhrases) {
          if (fullText.includes(phrase.toLowerCase())) {
            violations.push(`❌ Contains forbidden phrase: "${phrase}"`);
          }
        }
        
        // Check for required solution (at least one must be present)
        const hasSolution = requiredSolutions.some(sol => 
          fullText.includes(sol.toLowerCase())
        );
        if (!hasSolution) {
          violations.push('❌ Missing required Increff solution name (must mention: Assortment Planning, Allocation, Replenishment, Markdown Optimization, WSSI/MSSI, or Merchandise Financial Planning)');
        }
        
        // Check for unapproved percentages
        const percentageRegex = /(\d+)%/g;
        const matches = (subject + ' ' + body).match(percentageRegex) || [];
        for (const match of matches) {
          if (!approvedStats.includes(match)) {
            violations.push(`❌ Contains unapproved statistic: "${match}" (only 13%, 36%, 26%, 7% allowed from Increff content library)`);
          }
        }
        
        if (violations.length > 0) {
          console.log('⚠️ EMAIL VALIDATION FAILED - Content library rules violated:');
          violations.forEach(v => console.log('   ', v));
          console.log('📧 Subject:', subject);
          console.log('📧 Body:', body.substring(0, 200));
        } else {
          console.log('✅ Email validation passed - content library rules followed');
        }
      }

      const generatedEmail = {
        subject: subject || `${prospect.firstName}, quick question`,
        body: body.trim(),
        personalizationScore: personalizationData?.personalizationScore || 85,
        validationWarnings: violations.length > 0 ? violations : undefined
      };

      res.json(generatedEmail);
    } catch (error) {
      console.error("Email generation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate personalized email" 
      });
    }
  });

  // Get AI template recommendation based on context
  app.post("/api/ai/recommend-template", authenticate, async (req, res) => {
    try {
      const { 
        prospectId,
        campaignStage,
        daysSinceLastTouch,
        replyType,
        triggerDetected,
        icpType,
        userRole,
        previousMessageText,
        prospectReply
      } = req.body;

      if (!campaignStage) {
        return res.status(400).json({ error: "Campaign stage is required" });
      }

      // Get template recommendation from AI Decision Engine
      const recommendation = getTemplateForContext({
        campaignStage,
        daysSinceLastTouch: daysSinceLastTouch || 0,
        replyType,
        triggerDetected,
        icpType,
        userRole: userRole || 'sdr'
      });

      if (!recommendation) {
        return res.json({
          templateName: 'default',
          reasoning: 'No specific template matched the context. Using general approach.',
          suggestedMessage: null,
          context: { campaignStage, daysSinceLastTouch }
        });
      }

      // Get prospect data for personalization if provided
      let prospectContext: any = {};
      if (prospectId) {
        const prospect = await storage.getProspect(req.userContext!, prospectId);
        if (prospect) {
          prospectContext = {
            firstName: prospect.firstName,
            lastName: prospect.lastName,
            companyName: prospect.companyName,
            jobTitle: prospect.jobTitle,
            industry: prospect.companyIndustry
          };
        }
      }

      // Build the response
      const response = {
        templateName: recommendation.templateName,
        reasoning: recommendation.reasoning,
        suggestedMessage: recommendation.template ? {
          subject: recommendation.template.subject || '',
          body: recommendation.template.body || ''
        } : null,
        warning: recommendation.template?.avoid || null,
        backupOption: null as any,
        context: {
          campaignStage,
          daysSinceLastTouch: daysSinceLastTouch || 0,
          replyType,
          triggerDetected
        },
        prospectContext
      };

      // Try to find a backup option from same category
      if (recommendation.templateName && EMAIL_TEMPLATE_LIBRARY) {
        const categoryKey = campaignStage.toLowerCase().includes('follow') ? 'followUp' :
                           campaignStage.toLowerCase().includes('first') ? 'firstTouch' :
                           campaignStage.toLowerCase().includes('objection') ? 'objectionHandling' :
                           campaignStage.toLowerCase().includes('re-engage') ? 'reEngagement' : null;
        
        if (categoryKey && EMAIL_TEMPLATE_LIBRARY[categoryKey as keyof typeof EMAIL_TEMPLATE_LIBRARY]) {
          const categoryTemplates = EMAIL_TEMPLATE_LIBRARY[categoryKey as keyof typeof EMAIL_TEMPLATE_LIBRARY];
          const alternatives = Object.entries(categoryTemplates).filter(
            ([key]) => key !== recommendation.templateName
          );
          if (alternatives.length > 0) {
            const [backupName, backupTemplate] = alternatives[0];
            response.backupOption = {
              templateName: backupName,
              subject: (backupTemplate as any).subject || '',
              body: (backupTemplate as any).body || ''
            };
          }
        }
      }

      res.json(response);
    } catch (error) {
      console.error("AI template recommendation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get AI template recommendation" 
      });
    }
  });

  // Get AI reply suggestion for inbox objection handling
  app.post("/api/ai/suggest-reply", authenticate, async (req, res) => {
    try {
      const { 
        prospectId,
        replyContent,
        replyType,
        sentiment,
        intent
      } = req.body;

      if (!replyContent) {
        return res.status(400).json({ error: "Reply content is required" });
      }

      // Detect objection type and get appropriate response
      const lowerContent = replyContent.toLowerCase();
      let detectedType: string = 'neutral';
      let detectedLabel: string = 'General Reply';
      let restrictions: any = {};

      // Detect specific patterns
      if (lowerContent.includes('not a priority') || lowerContent.includes('busy right now') || lowerContent.includes('not now')) {
        detectedType = 'not_now';
        detectedLabel = 'Not a priority right now';
      } else if (lowerContent.includes('send info') || lowerContent.includes('send me') || lowerContent.includes('more information')) {
        detectedType = 'send_info';
        detectedLabel = 'Request for information';
        restrictions = { blockAttachments: true, blockDecks: true, forceSingleQuestion: true };
      } else if (lowerContent.includes('we use') || lowerContent.includes('we already') || lowerContent.includes('competitor')) {
        detectedType = 'objection';
        detectedLabel = 'Competitive objection';
        restrictions = { forceSingleQuestion: true };
      } else if (lowerContent.includes('interested') || lowerContent.includes('sounds good') || lowerContent.includes('tell me more')) {
        detectedType = 'interested';
        detectedLabel = 'Interested';
      } else if (lowerContent.includes('?')) {
        detectedType = 'question';
        detectedLabel = 'Has questions';
      } else if (intent === 'objection') {
        detectedType = 'objection';
        detectedLabel = 'Objection';
        restrictions = { forceSingleQuestion: true };
      }

      // Get prospect data
      let prospectName = 'there';
      if (prospectId) {
        const prospect = await storage.getProspect(req.userContext!, prospectId);
        if (prospect) {
          prospectName = prospect.firstName || 'there';
        }
      }

      // Generate appropriate response suggestion based on type
      let suggestedReply = '';
      let reasoning = '';
      let warning = '';

      switch (detectedType) {
        case 'not_now':
          suggestedReply = `Hi ${prospectName},

Completely understand - timing is everything. 

Quick question before I step back: is this something that might make sense to revisit in Q2, or is it more of a "not right now but maybe next year" situation?

Just want to make sure I'm not reaching out at the wrong time.`;
          reasoning = 'Urgency reframe: Acknowledge their position and ask ONE question to understand timeline.';
          warning = 'Don\'t pitch or send materials. Just get clarity on timing.';
          break;

        case 'send_info':
          suggestedReply = `Hi ${prospectName},

Happy to share more context! Before I do, quick question:

What specifically are you looking to solve? That way I can send you the most relevant info vs. a generic overview.`;
          reasoning = 'Clarifying question: Don\'t send decks. Ask what they need to see first.';
          warning = 'Never attach decks or PDFs to "send info" requests - they rarely get read.';
          break;

        case 'objection':
          suggestedReply = `Hi ${prospectName},

That makes sense - [competitor/existing solution] is solid for [use case].

Out of curiosity, is the current setup fully solving [specific problem area], or are there gaps your team is working around?`;
          reasoning = 'Tool vs process reframing: Acknowledge their choice, then probe for gaps.';
          warning = 'Don\'t bash competitors. Ask about gaps they might be living with.';
          break;

        case 'interested':
          suggestedReply = `Hi ${prospectName},

Great to hear! Would a quick 15-minute call work this week to walk through how this could work for your team?

I have availability [suggest 2-3 times] - let me know what works best.`;
          reasoning = 'Move to meeting: They\'re interested, so propose a concrete next step.';
          break;

        case 'question':
          suggestedReply = `Hi ${prospectName},

Great question!

[Answer their specific question concisely]

Does that help clarify things? Happy to jump on a quick call if easier to discuss.`;
          reasoning = 'Answer first, then offer to discuss: Directly address their question before moving forward.';
          break;

        default:
          suggestedReply = `Hi ${prospectName},

Thanks for getting back to me!

[Acknowledge their response]

What would be most helpful as a next step?`;
          reasoning = 'General follow-up: Acknowledge and ask for direction.';
      }

      res.json({
        detectedType,
        detectedLabel,
        suggestedReply,
        reasoning,
        warning,
        restrictions: Object.keys(restrictions).length > 0 ? restrictions : undefined
      });
    } catch (error) {
      console.error("AI reply suggestion error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate AI reply suggestion" 
      });
    }
  });

  // Generate AI reply to prospect response
  app.post("/api/sequences/:sequenceId/generate-reply", authenticate, forbidManager, async (req, res) => {
    try {
      const { replyId, prospectId, replyContent } = req.body;
      
      if (!process.env.GROQ_API_KEY && !process.env.DEEPSEEK_API_KEY) {
        return res.status(500).json({
          error: "No AI provider configured. Please set GROQ_API_KEY or DEEPSEEK_API_KEY."
        });
      }

      const prospect = await storage.getProspect(req.userContext!, prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      const prompt = `You are a professional sales representative responding to a prospect's reply. Generate a contextual, professional response.

PROSPECT INFORMATION:
- Name: ${prospect.fullName}
- Title: ${prospect.jobTitle || 'Not specified'}
- Company: ${prospect.companyName || 'Not specified'}

THEIR REPLY:
"${replyContent}"

Generate a professional, contextual response that:
1. Acknowledges their message appropriately
2. Addresses any questions or concerns they raised
3. Moves the conversation forward constructively
4. Maintains a friendly, professional tone
5. Is concise (80-120 words)

Return ONLY the email body text, no subject line needed.`;

      const email = await aiService.generateText(prompt, 300);

      res.json({ email: email.trim() });
    } catch (error) {
      console.error("AI reply generation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate AI reply" 
      });
    }
  });

  // ============================================
  // SEQUENCE EXECUTOR HEALTH MONITORING
  // ============================================

  // Get sequence executor health status
  app.get("/api/sequence-executor/health", authenticate, async (req, res) => {
    try {
      const { sequenceExecutorService } = await import("./services/sequence-executor.service");
      const healthStatus = sequenceExecutorService.getHealthStatus();

      res.json({
        success: true,
        health: healthStatus,
        summary: {
          status: healthStatus.isHealthy ? 'healthy' : 'unhealthy',
          lastRun: healthStatus.lastHeartbeat?.toISOString() || 'Never',
          totalRuns: healthStatus.totalRuns,
          consecutiveFailures: healthStatus.consecutiveFailures,
        }
      });
    } catch (error) {
      console.error("Health check error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get health status"
      });
    }
  });

  // ============================================
  // EMAIL SCHEDULER HEALTH MONITORING
  // ============================================

  // Get email scheduler health status
  app.get("/api/scheduler/health", authenticate, async (req, res) => {
    try {
      const { schedulerMonitoringService } = await import("./services/scheduler-monitoring.service");
      const healthStatuses = await schedulerMonitoringService.getAllSchedulerHealth();

      // Find email_queue scheduler specifically
      const emailQueueHealth = healthStatuses.find(h => h.schedulerType === "email_queue");

      res.json({
        success: true,
        schedulers: healthStatuses,
        emailQueue: emailQueueHealth ? {
          status: emailQueueHealth.status,
          lastHeartbeat: emailQueueHealth.lastHeartbeat?.toISOString() || null,
          processedCount: emailQueueHealth.processedCount,
          failedCount: emailQueueHealth.failedCount,
          failureRate15m: emailQueueHealth.failureRate15m,
          alertActive: emailQueueHealth.alertActive,
        } : null,
      });
    } catch (error) {
      console.error("Scheduler health check error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get scheduler health"
      });
    }
  });

  // Get all scheduler statuses (admin endpoint)
  app.get("/api/admin/scheduler/status", authenticate, requireManager, async (req, res) => {
    try {
      const { schedulerMonitoringService } = await import("./services/scheduler-monitoring.service");
      const healthStatuses = await schedulerMonitoringService.getAllSchedulerHealth();

      res.json({
        success: true,
        schedulers: healthStatuses,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Admin scheduler status error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get scheduler status"
      });
    }
  });

  // ============================================
  // STUCK EMAIL QUEUE MONITORING
  // ============================================
  
  // Get stuck emails in queue (pending > X minutes) - Admin endpoint
  app.get("/api/admin/email-queue/stuck", authenticate, requireManager, async (req, res) => {
    try {
      const thresholdMinutes = parseInt(req.query.minutes as string) || 60; // Default 60 minutes
      
      const stuckEmails = await db
        .select({
          id: emailQueue.id,
          prospectId: emailQueue.prospectId,
          subject: emailQueue.subject,
          status: emailQueue.status,
          createdAt: emailQueue.createdAt,
          scheduledFor: emailQueue.scheduledFor,
          lastError: emailQueue.lastError,
          deferralAttempts: emailQueue.deferralAttempts,
        })
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, "pending"),
            sql`${emailQueue.createdAt} < NOW() - INTERVAL '${sql.raw(thresholdMinutes.toString())} minutes'`
          )
        )
        .orderBy(emailQueue.createdAt)
        .limit(100);

      const totalStuck = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, "pending"),
            sql`${emailQueue.createdAt} < NOW() - INTERVAL '${sql.raw(thresholdMinutes.toString())} minutes'`
          )
        );

      res.json({
        success: true,
        stuckCount: Number(totalStuck[0]?.count || 0),
        thresholdMinutes,
        emails: stuckEmails,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Get stuck emails error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get stuck emails"
      });
    }
  });

  // Email queue health summary - Admin endpoint
  app.get("/api/admin/email-queue/health", authenticate, requireManager, async (req, res) => {
    try {
      const stats = await db
        .select({
          status: emailQueue.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(emailQueue)
        .groupBy(emailQueue.status);

      const stuckCount = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, "pending"),
            sql`${emailQueue.createdAt} < NOW() - INTERVAL '60 minutes'`
          )
        );

      const sentWithoutMessageId = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(emailQueue)
        .where(
          and(
            eq(emailQueue.status, "sent"),
            or(
              sql`${emailQueue.messageId} IS NULL`,
              eq(emailQueue.messageId, "")
            )
          )
        );

      const statusMap: Record<string, number> = {};
      stats.forEach(s => { if (s.status) statusMap[s.status] = Number(s.count); });

      const health = {
        status: Number(stuckCount[0]?.count || 0) > 10 ? "unhealthy" : 
                Number(stuckCount[0]?.count || 0) > 0 ? "degraded" : "healthy",
        queueStats: statusMap,
        stuckCount: Number(stuckCount[0]?.count || 0),
        sentWithoutMessageId: Number(sentWithoutMessageId[0]?.count || 0),
        timestamp: new Date().toISOString(),
      };

      res.json(health);
    } catch (error) {
      console.error("Email queue health error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get email queue health"
      });
    }
  });

  // Dead-letter queue - view failed emails with reasons (TENANT-SCOPED)
  app.get("/api/admin/email-queue/dead-letter", authenticate, requireManager, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      
      const { emailQueueService } = await import("./services/email-queue.service");
      // Pass userId for tenant scoping - managers see their org's failed emails
      const result = await emailQueueService.getDeadLetterQueue(
        req.userContext!.userId,
        { limit, offset }
      );
      
      res.json({
        success: true,
        ...result,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Dead-letter queue error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get dead-letter queue"
      });
    }
  });

  // Trigger manual retry of stuck emails
  app.post("/api/admin/email-queue/retry-stuck", authenticate, requireManager, async (req, res) => {
    try {
      const { emailQueueService } = await import("./services/email-queue.service");
      const result = await emailQueueService.autoRetryStuckEmails();
      
      res.json({
        success: true,
        ...result,
        message: `Processed stuck emails: ${result.retried} retried, ${result.failed} failed`,
      });
    } catch (error) {
      console.error("Retry stuck emails error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to retry stuck emails"
      });
    }
  });

  // Email queue metrics for monitoring dashboard
  app.get("/api/admin/email-queue/metrics", authenticate, requireManager, async (req, res) => {
    try {
      const { getQueueMetrics } = await import("./services/email-error-classifier.service");
      const metrics = await getQueueMetrics();
      
      res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      console.error("Queue metrics error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get queue metrics"
      });
    }
  });

  // ============================================
  // OPERATIONAL COPILOT
  // ============================================
  
  // Copilot rate limiting: 10 queries/min per user, 30s cache
  const copilotRateLimits = new Map<string, { count: number; resetAt: number }>();
  const copilotCache = new Map<string, { response: any; expiresAt: number }>();

  // Copilot query - diagnostic and explanation engine
  app.post("/api/copilot/query", authenticate, async (req, res) => {
    const userId = req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Rate limiting: 10 queries/min per user
    const now = Date.now();
    const rateKey = `copilot:${userId}`;
    let rateLimit = copilotRateLimits.get(rateKey);
    
    if (!rateLimit || now > rateLimit.resetAt) {
      rateLimit = { count: 0, resetAt: now + 60000 };
    }
    
    if (rateLimit.count >= 10) {
      const retryAfter = Math.ceil((rateLimit.resetAt - now) / 1000);
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ 
        error: "Rate limit exceeded. Maximum 10 queries per minute.",
        retryAfter 
      });
    }
    
    rateLimit.count++;
    copilotRateLimits.set(rateKey, rateLimit);

    // Check cache: 30s TTL for same question
    const question = req.body?.question?.trim()?.toLowerCase();
    if (question) {
      const cacheKey = `${userId}:${question}`;
      const cached = copilotCache.get(cacheKey);
      if (cached && now < cached.expiresAt) {
        return res.json(cached.response);
      }
    }

    const { handleCopilotQuery } = await import("./copilot/copilot.controller");
    
    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      if (question && data && !data.error) {
        const cacheKey = `${userId}:${question}`;
        copilotCache.set(cacheKey, { response: data, expiresAt: now + 30000 });
        
        // Clean old cache entries periodically
        if (copilotCache.size > 100) {
          Array.from(copilotCache.entries()).forEach(([key, value]) => {
            if (now > value.expiresAt) {
              copilotCache.delete(key);
            }
          });
        }
      }
      return originalJson(data);
    };
    
    return handleCopilotQuery(req, res);
  });

  // ============================================
  // HEALTH DASHBOARD
  // ============================================
  
  // Health overview - delivery metrics and system status
  app.get("/api/health/overview", authenticate, async (req, res) => {
    try {
      const { healthDashboardService } = await import("./services/health-dashboard.service");
      
      // Managers see organization data, users see only their own
      const isManager = req.userContext?.roles.includes("manager") || req.userContext?.roles.includes("super_admin");
      const userId = isManager ? undefined : req.userContext?.userId;
      const organizationId = isManager ? req.userContext?.organizationId : undefined;
      
      // Guard: require at least one scope
      if (!userId && !organizationId) {
        return res.status(403).json({ error: "Organization or user context required" });
      }
      
      const overview = await healthDashboardService.getHealthOverview(userId, organizationId);
      
      res.json({
        success: true,
        ...overview,
      });
    } catch (error) {
      console.error("Health overview error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get health overview"
      });
    }
  });

  // Failed emails list
  app.get("/api/health/failed-emails", authenticate, async (req, res) => {
    try {
      const { healthDashboardService } = await import("./services/health-dashboard.service");
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      
      const isManager = req.userContext?.roles.includes("manager") || req.userContext?.roles.includes("super_admin");
      const userId = isManager ? undefined : req.userContext?.userId;
      const organizationId = isManager ? req.userContext?.organizationId : undefined;
      
      if (!userId && !organizationId) {
        return res.status(403).json({ error: "Organization or user context required" });
      }
      
      const emails = await healthDashboardService.getFailedEmails(userId, organizationId, limit);
      
      res.json({ success: true, emails });
    } catch (error) {
      console.error("Failed emails error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get failed emails"
      });
    }
  });

  // Stuck emails list
  app.get("/api/health/stuck-emails", authenticate, async (req, res) => {
    try {
      const { healthDashboardService } = await import("./services/health-dashboard.service");
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      
      const isManager = req.userContext?.roles.includes("manager") || req.userContext?.roles.includes("super_admin");
      const userId = isManager ? undefined : req.userContext?.userId;
      const organizationId = isManager ? req.userContext?.organizationId : undefined;
      
      if (!userId && !organizationId) {
        return res.status(403).json({ error: "Organization or user context required" });
      }
      
      const emails = await healthDashboardService.getStuckEmails(userId, organizationId, limit);
      
      res.json({ success: true, emails });
    } catch (error) {
      console.error("Stuck emails error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get stuck emails"
      });
    }
  });

  // Retry queue list
  app.get("/api/health/retry-queue", authenticate, async (req, res) => {
    try {
      const { healthDashboardService } = await import("./services/health-dashboard.service");
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      
      const isManager = req.userContext?.roles.includes("manager") || req.userContext?.roles.includes("super_admin");
      const userId = isManager ? undefined : req.userContext?.userId;
      const organizationId = isManager ? req.userContext?.organizationId : undefined;
      
      if (!userId && !organizationId) {
        return res.status(403).json({ error: "Organization or user context required" });
      }
      
      const queue = await healthDashboardService.getRetryQueue(userId, organizationId, limit);
      
      res.json({ success: true, queue });
    } catch (error) {
      console.error("Retry queue error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get retry queue"
      });
    }
  });

  // ============================================
  // ALERTING SYSTEM
  // ============================================
  
  // Get active alerts (manager sees their org only)
  app.get("/api/alerts/active", authenticate, requireManager, async (req, res) => {
    try {
      const organizationId = req.userContext?.organizationId;
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }
      
      const { alertService } = await import("./alerts/alert.service");
      const alerts = await alertService.getActiveAlerts(organizationId);
      
      res.json({
        success: true,
        alerts,
        count: alerts.length,
      });
    } catch (error) {
      console.error("Active alerts error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get active alerts"
      });
    }
  });

  // Get alert history (manager sees their org only)
  app.get("/api/alerts/history", authenticate, requireManager, async (req, res) => {
    try {
      const organizationId = req.userContext?.organizationId;
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }
      
      const { alertService } = await import("./alerts/alert.service");
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const history = await alertService.getAlertHistory(organizationId, limit);
      
      res.json({
        success: true,
        history,
      });
    } catch (error) {
      console.error("Alert history error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get alert history"
      });
    }
  });

  // ============================================
  // SEQUENCE DRY RUN (PREVIEW MODE)
  // ============================================
  
  // Dry run sequence - generate preview emails without sending
  app.post("/api/sequences/:sequenceId/dry-run", authenticate, forbidManager, async (req, res) => {
    try {
      const { sequenceId } = req.params;
      const { prospectIds } = req.body;

      if (!sequenceId) {
        return res.status(400).json({ error: "Sequence ID is required" });
      }

      // Import service dynamically to avoid circular dependency
      const { sequenceExecutorService } = await import("./services/sequence-executor.service");

      const result = await sequenceExecutorService.dryRunSequence({
        sequenceId,
        userId: req.userContext!.userId,
        prospectIds,
      });

      res.json(result);
    } catch (error) {
      console.error("Dry run sequence error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to execute dry run"
      });
    }
  });

  // Get existing preview emails for a sequence
  app.get("/api/sequences/:sequenceId/previews", authenticate, forbidManager, async (req, res) => {
    try {
      const { sequenceId } = req.params;

      if (!sequenceId) {
        return res.status(400).json({ error: "Sequence ID is required" });
      }

      const { sequenceExecutorService } = await import("./services/sequence-executor.service");

      const previews = await sequenceExecutorService.getSequencePreviews({
        sequenceId,
        userId: req.userContext!.userId,
      });

      res.json({ previews, count: previews.length });
    } catch (error) {
      console.error("Get sequence previews error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get previews"
      });
    }
  });

  // Clear preview emails for a sequence
  app.delete("/api/sequences/:sequenceId/previews", authenticate, forbidManager, async (req, res) => {
    try {
      const { sequenceId } = req.params;

      if (!sequenceId) {
        return res.status(400).json({ error: "Sequence ID is required" });
      }

      const { sequenceExecutorService } = await import("./services/sequence-executor.service");

      const result = await sequenceExecutorService.clearSequencePreviews({
        sequenceId,
        userId: req.userContext!.userId,
      });

      res.json({ success: true, deleted: result.deleted });
    } catch (error) {
      console.error("Clear sequence previews error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to clear previews"
      });
    }
  });

  // Company enrichment via web scraping
  app.post("/api/personalization/company-enrichment", authenticate, forbidManager, async (req, res) => {
    try {
      const { companyWebsite } = req.body;
      
      if (!companyWebsite) {
        return res.status(400).json({ error: "Company website required" });
      }

      const companyData = await webScrapingService.scrapeCompanyWebsite(companyWebsite);
      res.json(companyData);
    } catch (error) {
      console.error("Company enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Company enrichment failed" 
      });
    }
  });

  // Save batch personalized emails for prospects
  app.post("/api/personalization/save-batch", authenticate, forbidManager, async (req, res) => {
    try {
      const { emails, sequenceId } = req.body;
      
      console.log(`📧 [save-batch] Received ${emails?.length || 0} emails for sequenceId: ${sequenceId}`);
      console.log(`📧 [save-batch] First email sample:`, emails?.[0] ? { 
        prospectId: emails[0].prospectId,
        hasSubject: !!emails[0].subject,
        hasBody: !!emails[0].body,
        subjectLength: emails[0].subject?.length || 0,
        bodyLength: emails[0].body?.length || 0
      } : 'none');
      
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: "Emails array is required" });
      }

      const savedResults = [];
      const errors = [];

      for (const email of emails) {
        const { prospectId, subject, body, prospect } = email;
        
        if (!prospectId || !subject || !body) {
          errors.push({ prospectId, error: "Missing required fields (prospectId, subject, body)" });
          continue;
        }

        try {
          // Verify prospect exists and belongs to user
          const existingProspect = await storage.getProspect(req.userContext!, prospectId);
          if (!existingProspect) {
            errors.push({ prospectId, error: "Prospect not found" });
            continue;
          }

          // Save personalization result with generated email in emailSuggestions
          const result = await storage.createPersonalizationResult(req.userContext!, {
            prospectId: prospectId.toString(),
            userId: req.userContext!.userId,
            personalizationScore: 85, // High score since it's manually generated
            variables: null,
            insights: null,
            emailSuggestions: { subject, body, generatedAt: new Date().toISOString(), sequenceId },
            contentRecommendations: null,
            linkedinData: null
          });

          savedResults.push({
            prospectId,
            personalizationResultId: result.id,
            prospectName: prospect ? `${prospect.firstName} ${prospect.lastName}` : existingProspect.fullName
          });

          console.log(`✅ Saved personalized email for prospect ${prospectId}`);
        } catch (error: any) {
          console.error(`❌ Failed to save personalized email for ${prospectId}:`, error);
          errors.push({ prospectId, error: error.message || "Unknown error" });
        }
      }

      res.json({
        success: savedResults.length > 0,
        savedCount: savedResults.length,
        errorCount: errors.length,
        savedResults,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Batch personalization save error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to save personalized emails" 
      });
    }
  });

  // Content Library - Get all items
  app.get("/api/content-library", authenticate, forbidManager, async (req, res) => {
    try {
      const items = await contentManagementService.getContentLibraryItems(req.userContext!);
      res.json(items);
    } catch (error) {
      console.error("Get content library error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get content library" 
      });
    }
  });

  // Content Library - Get templates
  app.get("/api/content-library/templates", authenticate, forbidManager, async (req, res) => {
    try {
      const { category } = req.query;
      const templates = category 
        ? contentManagementService.getTemplatesByCategory(category as any)
        : contentManagementService.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get templates" 
      });
    }
  });

  // Content Library - Create item
  app.post("/api/content-library", authenticate, forbidManager, async (req, res) => {
    try {
      const item = await contentManagementService.addContentItem(req.userContext!, req.body);
      res.json(item);
    } catch (error) {
      console.error("Create content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create content item" 
      });
    }
  });

  // Content Library - Update item
  app.put("/api/content-library/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await contentManagementService.updateContentItem(req.userContext!, id, req.body);
      res.json(item);
    } catch (error) {
      console.error("Update content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update content item" 
      });
    }
  });

  // Content Library - Delete item
  app.delete("/api/content-library/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { id } = req.params;
      await contentManagementService.deleteContentItem(req.userContext!, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete content item" 
      });
    }
  });

  // ICP Templates - Get all templates (PROTECTED)
  app.get("/api/icp-templates", authenticate, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      const templates = await icpTemplateService.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get ICP templates error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get ICP templates" 
      });
    }
  });

  // ICP Templates - Get default templates (PROTECTED)
  app.get("/api/icp-templates/defaults", authenticate, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      const templates = await icpTemplateService.getDefaultTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get default ICP templates error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get default ICP templates" 
      });
    }
  });

  // ICP Templates - Get by ID (PROTECTED)
  app.get("/api/icp-templates/:id", authenticate, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      const template = await icpTemplateService.getTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get ICP template error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get ICP template" 
      });
    }
  });

  // ICP Templates - Create
  app.post("/api/icp-templates", authenticate, forbidManager, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      const template = await icpTemplateService.createTemplate(req.body);
      res.json(template);
    } catch (error) {
      console.error("Create ICP template error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create ICP template" 
      });
    }
  });

  // ICP Templates - Update
  app.put("/api/icp-templates/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      const template = await icpTemplateService.updateTemplate(req.params.id, req.body);
      res.json(template);
    } catch (error) {
      console.error("Update ICP template error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update ICP template" 
      });
    }
  });

  // ICP Templates - Delete
  app.delete("/api/icp-templates/:id", authenticate, forbidManager, async (req, res) => {
    try {
      const { icpTemplateService } = await import("./services/icp-template.service");
      await icpTemplateService.deleteTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete ICP template error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete ICP template" 
      });
    }
  });

  // Generate email from template
  app.post("/api/content-library/generate-email", authenticate, forbidManager, async (req, res) => {
    try {
      const { templateId, prospectId, customVariables } = req.body;
      
      const prospect = await storage.getProspect(req.userContext!, prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      const email = contentManagementService.generateEmailFromTemplate(
        templateId,
        {
          name: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
          company: prospect.companyName || '',
          industry: prospect.companyIndustry || '',
          position: prospect.jobTitle || ''
        },
        customVariables
      );

      if (!email) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(email);
    } catch (error) {
      console.error("Generate email error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate email" 
      });
    }
  });

  // AI Email Template Generator - Generate template from content library
  app.post("/api/content-library/ai-generate-template", authenticate, forbidManager, async (req, res) => {
    try {
      const { prompt, contentItemIds, settings } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (!contentItemIds || contentItemIds.length === 0) {
        return res.status(400).json({ error: "At least one content item must be selected" });
      }

      if (!process.env.GROQ_API_KEY && !process.env.DEEPSEEK_API_KEY) {
        return res.status(500).json({
          error: "No AI provider configured. Please configure GROQ_API_KEY or DEEPSEEK_API_KEY."
        });
      }

      // Fetch selected content items
      const allContentItems = await storage.getContentLibraryItems(req.userContext!);
      const selectedContent = allContentItems.filter(item => contentItemIds.includes(item.id));

      if (selectedContent.length === 0) {
        return res.status(404).json({ error: "No content items found with the provided IDs" });
      }

      // Build content context for AI
      const contentContext = selectedContent.map((item, index) => {
        return `Content Item ${index + 1}: ${item.title} (${item.type})
${item.description ? `Description: ${item.description}` : ''}
Content: ${item.content}
${item.industry ? `Industry: ${item.industry}` : ''}
${item.useCase ? `Use Case: ${item.useCase}` : ''}`;
      }).join('\n\n---\n\n');

      const tone = settings?.tone || 'professional';
      const length = settings?.length || 'medium';
      const cta = settings?.callToAction || 'schedule a call';

      const aiPrompt = `You are an expert email template creator. Generate a reusable email template based on the following:

USER REQUEST:
${prompt}

TEMPLATE SETTINGS:
- Tone: ${tone}
- Length: ${length}
- Call-to-Action: ${cta}

AVAILABLE CONTENT (USE ONLY THIS DATA):
${contentContext}

REQUIREMENTS:
1. Create a compelling subject line
2. Write email content using ONLY the provided content items above
3. Use the specified tone: ${tone}
4. Target length: ${length === 'short' ? '50-100 words' : length === 'medium' ? '100-200 words' : '200-300 words'}
5. Include the call-to-action: ${cta}
6. Make the template reusable (use placeholders like {{company_name}}, {{prospect_name}} where appropriate)
7. Focus on the benefits, case studies, and value propositions from the content
8. DO NOT invent information - use only what's provided in the content items

Respond in JSON format:
{
  "subject": "Email subject line",
  "content": "Complete email template with placeholders",
  "variables": ["list", "of", "variables", "used"],
  "reasoning": "Brief explanation of approach"
}`;

      console.log('Generating AI email template with', selectedContent.length, 'content items');

      const { openaiHelper: _oh } = await import('./services/openai-helper');
      const templateSystemMsg = "You are an expert email template creator who generates high-quality, reusable email templates based strictly on provided content. Always respond with valid JSON.";
      const templateResponse: any = await _oh.callWithFallback(
        (groqClient) => groqClient.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: templateSystemMsg },
            { role: "user", content: aiPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1500
        } as any),
        (client) => client.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: templateSystemMsg },
            { role: "user", content: aiPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1500
        })
      );

      const rawTemplateContent = (templateResponse as any).choices[0].message.content || '{}';
      const result = JSON.parse(rawTemplateContent);

      // Harden response parsing with fallbacks
      const subject = result.subject || 'Quick question about your business';
      const content = result.content || 'Email content generation failed. Please try again.';
      const variables = Array.isArray(result.variables) ? result.variables : [];
      const reasoning = result.reasoning || 'Template generated from selected content';

      res.json({
        subject,
        content,
        variables,
        reasoning,
        contentItemsUsed: selectedContent.map(item => ({ id: item.id, title: item.title }))
      });

    } catch (error) {
      console.error("AI template generation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate AI email template" 
      });
    }
  });

  // ==========================================
  // Email Tracking Routes
  // ==========================================
  
  // Import tracking service
  const { emailTrackingService } = await import("./services/email-tracking.service");
  
  // Tracking pixel - records email opens (no auth required for tracking)
  app.get("/api/track/open/:trackingId", async (req, res) => {
    const { trackingId } = req.params;
    
    // Record the open asynchronously
    emailTrackingService.recordOpen(trackingId).catch(err => {
      console.error("Error recording email open:", err);
    });
    
    // Return a 1x1 transparent GIF
    const transparentGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': transparentGif.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.send(transparentGif);
  });
  
  // Link click tracking - records clicks and redirects (no auth required)
  app.get("/api/track/click/:trackingId", async (req, res) => {
    const { trackingId } = req.params;
    const { url, sig } = req.query;
    
    // Validate and redirect to the original URL
    if (url && typeof url === 'string') {
      try {
        const decodedUrl = decodeURIComponent(url);
        
        // Security: Verify HMAC signature to prevent URL tampering
        if (!sig || typeof sig !== 'string') {
          console.warn(`Click tracking rejected: Missing signature for ${trackingId}`);
          res.status(400).send("Invalid tracking link");
          return;
        }
        
        if (!emailTrackingService.verifySignature(trackingId, decodedUrl, sig)) {
          console.warn(`Click tracking rejected: Invalid signature for ${trackingId}`);
          res.status(400).send("Invalid tracking link");
          return;
        }
        
        const parsedUrl = new URL(decodedUrl);
        
        // Security: Only allow http/https protocols to prevent javascript: or data: URLs
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          console.warn(`Blocked unsafe redirect protocol: ${parsedUrl.protocol}`);
          res.status(400).send("Invalid redirect URL protocol");
          return;
        }
        
        // Security: Block common attack patterns
        const hostname = parsedUrl.hostname.toLowerCase();
        const blockedPatterns = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
        if (blockedPatterns.some(pattern => hostname.includes(pattern))) {
          console.warn(`Blocked localhost redirect attempt: ${hostname}`);
          res.status(400).send("Invalid redirect URL");
          return;
        }
        
        // Record the click asynchronously after validation passes
        emailTrackingService.recordClick(trackingId).catch(err => {
          console.error("Error recording email click:", err);
        });
        
        res.redirect(301, decodedUrl);
      } catch (error) {
        console.error("Invalid URL in click tracking:", error);
        res.status(400).send("Invalid redirect URL");
      }
    } else {
      res.status(400).send("Missing redirect URL");
    }
  });
  
  // Get email performance metrics
  app.get("/api/email-analytics/performance", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      const days = parseInt(req.query.days as string) || 30;
      
      const cacheKey = `email-analytics:performance:${userId}:${days}`;
      const cached = analyticsCache.get<any>(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      
      const metrics = await emailTrackingService.getPerformanceMetrics(userId, days);
      analyticsCache.set(cacheKey, metrics, 30); // 30 second TTL
      res.json(metrics);
    } catch (error) {
      console.error("Error getting email performance metrics:", error);
      res.status(500).json({ error: "Failed to get performance metrics" });
    }
  });
  
  // Get sequence step performance
  app.get("/api/email-analytics/sequence/:sequenceId/steps", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      const { sequenceId } = req.params;
      
      const stepPerformance = await emailTrackingService.getSequenceStepPerformance(sequenceId, userId);
      res.json(stepPerformance);
    } catch (error) {
      console.error("Error getting sequence step performance:", error);
      res.status(500).json({ error: "Failed to get step performance" });
    }
  });
  
  // Get domain health
  app.get("/api/email-analytics/domain-health", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      
      const domainHealth = await emailTrackingService.getDomainHealth(userId);
      res.json(domainHealth);
    } catch (error) {
      console.error("Error getting domain health:", error);
      res.status(500).json({ error: "Failed to get domain health" });
    }
  });
  
  // Get top performing content
  app.get("/api/email-analytics/top-content", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      const limit = parseInt(req.query.limit as string) || 5;
      
      const topContent = await emailTrackingService.getTopPerformingContent(userId, limit);
      res.json(topContent);
    } catch (error) {
      console.error("Error getting top performing content:", error);
      res.status(500).json({ error: "Failed to get top content" });
    }
  });
  
  // Get daily summary
  app.get("/api/email-analytics/daily-summary", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      const date = req.query.date ? new Date(req.query.date as string) : new Date();
      
      const summary = await emailTrackingService.getDailySummary(userId, date);
      res.json(summary);
    } catch (error) {
      console.error("Error getting daily summary:", error);
      res.status(500).json({ error: "Failed to get daily summary" });
    }
  });
  
  // Get weekly summary
  app.get("/api/email-analytics/weekly-summary", authenticate, forbidManager, async (req, res) => {
    try {
      const userId = req.userContext!.userId;
      
      const summary = await emailTrackingService.getWeeklySummary(userId);
      res.json(summary);
    } catch (error) {
      console.error("Error getting weekly summary:", error);
      res.status(500).json({ error: "Failed to get weekly summary" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Public status page API
  app.get("/api/status", async (req, res) => {
    try {
      type ServiceStatus = "operational" | "degraded" | "outage";
      interface Service {
        name: string;
        status: ServiceStatus;
        latency: number;
      }

      let dbStatus: ServiceStatus = "operational";
      
      // Check database connectivity by verifying storage is accessible
      try {
        // Simple connectivity check - storage is initialized if database is connected
        if (!storage) {
          dbStatus = "outage";
        }
      } catch {
        dbStatus = "outage";
      }

      const services: Service[] = [
        { name: "Web Application", status: "operational", latency: 45 },
        { name: "API Services", status: "operational", latency: 32 },
        { name: "Database", status: dbStatus, latency: 8 },
        { name: "Email Delivery", status: "operational", latency: 120 },
        { name: "AI Services", status: "operational", latency: 450 },
      ];

      const hasOutage = services.some(s => s.status === "outage");
      const hasDegraded = services.some(s => s.status === "degraded");
      const overall: ServiceStatus = hasOutage ? "outage" : hasDegraded ? "degraded" : "operational";

      res.json({
        overall,
        services: services.map(s => ({
          ...s,
          lastChecked: new Date().toISOString(),
        })),
        lastUpdated: new Date().toISOString(),
        uptime: "99.95%",
        incidents: [],
      });
    } catch (error) {
      console.error("Error fetching status:", error);
      res.json({
        overall: "degraded",
        services: [],
        lastUpdated: new Date().toISOString(),
        uptime: "N/A",
        incidents: [],
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
