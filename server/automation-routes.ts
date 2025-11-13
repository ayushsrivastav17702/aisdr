import type { Express, Request, Response } from "express";
import { z } from "zod";
import automationService from "./services/automation.service";
import { db } from "./db";
import { sequences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticate } from "./middleware/auth.middleware";

// Request schemas
const startAutomationSchema = z.object({
  sequenceId: z.string().uuid(),
  prospectSource: z.enum(["apollo", "existing"]).default("apollo"),
  prospectCount: z.number().int().min(1).max(500),
  aiPersonalizationEnabled: z.boolean().default(true),
  apolloFilters: z.object({
    person_titles: z.array(z.string()).optional(),
    person_seniorities: z.array(z.string()).optional(),
    person_departments: z.array(z.string()).optional(),
    q_organization_name: z.string().optional(),
    q_keywords: z.string().optional(),
    person_locations: z.array(z.string()).optional(),
  }).passthrough().optional(), // Allow additional Apollo filter fields
});

export function registerAutomationRoutes(app: Express) {
  /**
   * POST /api/automation/start
   * Start a new automation run (PROTECTED: requires authentication)
   */
  app.post("/api/automation/start", authenticate, async (req: Request, res: Response) => {
    try {
      // Ensure userId is available for multi-tenant security
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Validate request body
      const validatedBody = startAutomationSchema.parse(req.body);
      const { sequenceId, prospectSource, prospectCount, aiPersonalizationEnabled, apolloFilters } = validatedBody;

      // Verify sequence exists and is active
      const sequence = await db.query.sequences.findFirst({
        where: (sequences, { eq }) => eq(sequences.id, sequenceId)
      });

      if (!sequence) {
        return res.status(404).json({ 
          error: "Sequence not found" 
        });
      }

      if (sequence.status !== "active" && sequence.status !== "draft") {
        return res.status(400).json({ 
          error: "Sequence must be active or draft to run automation" 
        });
      }

      // Create automation run record with userId for multi-tenant isolation
      const automationRun = await automationService.createAutomationRun({
        sequenceId,
        userId: req.userContext.userId, // Store user ID for tenant isolation
        prospectCount,
        aiPersonalizationEnabled,
        apolloFilters,
        status: "running",
        prospectsAdded: 0,
        emailsSent: 0,
        repliesReceived: 0,
        createdBy: 1, // Legacy field, keeping for compatibility
      });

      // Start processing in background (don't await) with userId for mailbox selection
      automationService.processAutomation(
        automationRun.id,
        sequenceId,
        prospectSource,
        prospectCount,
        aiPersonalizationEnabled,
        apolloFilters,
        req.userContext.userId // Pass userId for user-scoped mailbox selection
      ).catch(err => {
        console.error(`Automation ${automationRun.id} background processing failed:`, err);
      });

      // Return immediately
      res.json({
        success: true,
        automationRunId: automationRun.id,
        message: `Automation started. Processing ${prospectCount} prospects in background...`,
        automationRun,
      });

    } catch (error) {
      console.error("Error starting automation:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: error.errors 
        });
      }

      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start automation" 
      });
    }
  });

  /**
   * GET /api/automation/list
   * Get all automation runs
   */
  app.get("/api/automation/list", async (req: Request, res: Response) => {
    try {
      const automations = await automationService.getAutomationRuns();

      res.json({ 
        automations,
        total: automations.length 
      });
    } catch (error) {
      console.error("Error fetching automations:", error);
      res.status(500).json({ 
        error: "Failed to fetch automations" 
      });
    }
  });

  /**
   * GET /api/automation/:id
   * Get specific automation details
   */
  app.get("/api/automation/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const automation = await automationService.getAutomationRun(id);

      if (!automation) {
        return res.status(404).json({ 
          error: "Automation not found" 
        });
      }

      res.json({ automation });
    } catch (error) {
      console.error("Error fetching automation:", error);
      res.status(500).json({ 
        error: "Failed to fetch automation" 
      });
    }
  });

  /**
   * POST /api/automation/:id/pause
   * Pause a running automation
   */
  app.post("/api/automation/:id/pause", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await automationService.pauseAutomation(id);

      res.json({ 
        success: true,
        message: "Automation paused successfully" 
      });
    } catch (error) {
      console.error("Error pausing automation:", error);
      res.status(500).json({ 
        error: "Failed to pause automation" 
      });
    }
  });
}
