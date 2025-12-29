import type { Express, Request, Response } from "express";
import { z } from "zod";
import automationService from "./services/automation.service";
import automationSchedulerService from "./services/automation-scheduler.service";
import { db } from "./db";
import { sequences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { authenticate, forbidManager } from "./middleware/auth.middleware";

// Request schemas
const startAutomationSchema = z.object({
  sequenceId: z.string().uuid(),
  prospectSource: z.enum(["apollo", "existing"]).default("apollo"),
  prospectCount: z.number().int().min(1).max(500),
  selectedProspectIds: z.array(z.string().uuid()).optional(),
  aiPersonalizationEnabled: z.boolean().default(true),
  contentItemIds: z.array(z.string()).optional(),
  scheduledFor: z.string().optional(),
  timezone: z.string().default("UTC"),
  exclusionRules: z.object({
    skipContacted: z.boolean().default(true),
    skipUnsubscribed: z.boolean().default(true),
    skipDuplicates: z.boolean().default(true),
  }).optional(),
  rateLimitConfig: z.object({
    dailyLimit: z.number().int().min(1).max(1000).default(500),
    delayBetweenEmails: z.number().int().min(5000).max(300000).default(30000),
    currentDailyCount: z.number().int().default(0),
  }).optional(),
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
  app.post("/api/automation/start", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      // Ensure userId is available for multi-tenant security
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Validate request body
      const validatedBody = startAutomationSchema.parse(req.body);
      const { 
        sequenceId, 
        prospectSource, 
        prospectCount: requestedProspectCount, 
        selectedProspectIds,
        aiPersonalizationEnabled,
        contentItemIds,
        scheduledFor,
        timezone,
        exclusionRules,
        rateLimitConfig,
        apolloFilters 
      } = validatedBody;

      // If specific prospects are selected, use their count instead of the requested count
      const prospectCount = selectedProspectIds && selectedProspectIds.length > 0 
        ? selectedProspectIds.length 
        : requestedProspectCount;

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

      // Store selectedProspectIds and contentItemIds in apolloFilters for retrieval later
      const enhancedApolloFilters = {
        ...apolloFilters,
        ...(selectedProspectIds && selectedProspectIds.length > 0 ? { selectedProspectIds } : {}),
        ...(contentItemIds && contentItemIds.length > 0 ? { contentItemIds } : {}),
      };

      // Use scheduler service to create and queue automation
      const automationRun = scheduledFor 
        ? await automationSchedulerService.scheduleAutomation({
            sequenceId,
            userId: req.userContext.userId,
            prospectCount,
            prospectSource,
            aiPersonalizationEnabled,
            apolloFilters: enhancedApolloFilters,
            scheduledFor: new Date(scheduledFor),
            timezone,
            exclusionRules,
            rateLimitConfig,
            prospectsAdded: 0,
            emailsSent: 0,
            repliesReceived: 0,
            createdBy: 1,
          })
        : await automationSchedulerService.startAutomation({
            sequenceId,
            userId: req.userContext.userId,
            prospectCount,
            prospectSource,
            aiPersonalizationEnabled,
            apolloFilters: enhancedApolloFilters,
            timezone,
            exclusionRules,
            rateLimitConfig,
            prospectsAdded: 0,
            emailsSent: 0,
            repliesReceived: 0,
            createdBy: 1,
          });

      // Return immediately
      res.json({
        success: true,
        automationRunId: automationRun.id,
        message: scheduledFor 
          ? `Automation scheduled for ${new Date(scheduledFor).toISOString()}`
          : `Automation started. Processing ${prospectCount} prospects in background...`,
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
   * Get all automation runs (PROTECTED: user-scoped)
   */
  app.get("/api/automation/list", authenticate, async (req: Request, res: Response) => {
    try {
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const automations = await automationService.getAutomationRuns(req.userContext.userId, 50);

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
   * Get specific automation details (PROTECTED: user-scoped)
   */
  app.get("/api/automation/:id", authenticate, async (req: Request, res: Response) => {
    try {
      if (!req.userContext?.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id } = req.params;

      const automation = await automationService.getAutomationRun(id);

      if (!automation) {
        return res.status(404).json({ 
          error: "Automation not found" 
        });
      }

      // Verify user owns this automation
      if (automation.userId !== req.userContext.userId) {
        return res.status(403).json({ 
          error: "Access denied" 
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
  app.post("/api/automation/:id/pause", authenticate, forbidManager, async (req: Request, res: Response) => {
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

  /**
   * POST /api/automation/:id/resume
   * Resume a paused automation
   */
  app.post("/api/automation/:id/resume", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await automationService.resumeAutomation(id);

      res.json({ 
        success: true,
        message: "Automation resumed successfully" 
      });
    } catch (error) {
      console.error("Error resuming automation:", error);
      res.status(500).json({ 
        error: "Failed to resume automation" 
      });
    }
  });

  /**
   * POST /api/automation/:id/stop
   * Stop an automation permanently
   */
  app.post("/api/automation/:id/stop", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await automationService.stopAutomation(id);

      res.json({ 
        success: true,
        message: "Automation stopped successfully" 
      });
    } catch (error) {
      console.error("Error stopping automation:", error);
      res.status(500).json({ 
        error: "Failed to stop automation" 
      });
    }
  });

  /**
   * GET /api/automation/:id/errors
   * Get error logs for automation
   */
  app.get("/api/automation/:id/errors", authenticate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const errors = await automationService.getAutomationErrors(id);

      res.json({ errors });
    } catch (error) {
      console.error("Error fetching automation errors:", error);
      res.status(500).json({ 
        error: "Failed to fetch automation errors" 
      });
    }
  });

  /**
   * POST /api/automation/:id/retry
   * Retry failed prospects in automation
   */
  app.post("/api/automation/:id/retry", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await automationService.retryFailedProspects(id);

      res.json({ 
        success: true,
        message: "Retrying failed prospects" 
      });
    } catch (error) {
      console.error("Error retrying prospects:", error);
      res.status(500).json({ 
        error: "Failed to retry prospects" 
      });
    }
  });

  /**
   * GET /api/automation/:id/prospects
   * Get enrolled prospects for automation
   */
  app.get("/api/automation/:id/prospects", authenticate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const prospectIds = await automationService.getEnrolledProspects(id);

      res.json({ prospectIds, count: prospectIds.length });
    } catch (error) {
      console.error("Error fetching enrolled prospects:", error);
      res.status(500).json({ 
        error: "Failed to fetch enrolled prospects" 
      });
    }
  });

  /**
   * GET /api/automation/:id/rate-limit
   * Get rate limit status for automation
   */
  app.get("/api/automation/:id/rate-limit", authenticate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const status = await automationService.getRateLimitStatus(id);

      res.json({ status });
    } catch (error) {
      console.error("Error fetching rate limit status:", error);
      res.status(500).json({ 
        error: "Failed to fetch rate limit status" 
      });
    }
  });

  /**
   * POST /api/automation/:id/cancel
   * Cancel a scheduled automation
   */
  app.post("/api/automation/:id/cancel", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await automationSchedulerService.cancelScheduledAutomation(id);

      res.json({ 
        success: true,
        message: "Automation cancelled successfully" 
      });
    } catch (error) {
      console.error("Error cancelling automation:", error);
      res.status(500).json({ 
        error: "Failed to cancel automation" 
      });
    }
  });

  /**
   * POST /api/automation/:id/reschedule
   * Reschedule a failed or cancelled automation
   */
  app.post("/api/automation/:id/reschedule", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { scheduledFor } = req.body;

      if (!scheduledFor) {
        return res.status(400).json({ error: "scheduledFor is required" });
      }

      await automationSchedulerService.rescheduleAutomation(id, new Date(scheduledFor));

      res.json({ 
        success: true,
        message: `Automation rescheduled for ${new Date(scheduledFor).toISOString()}` 
      });
    } catch (error) {
      console.error("Error rescheduling automation:", error);
      res.status(500).json({ 
        error: "Failed to reschedule automation" 
      });
    }
  });

  /**
   * GET /api/automation/:id/job-status
   * Get BullMQ job status for automation
   */
  app.get("/api/automation/:id/job-status", authenticate, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const jobStatus = await automationSchedulerService.getJobStatus(id);

      res.json({ jobStatus });
    } catch (error) {
      console.error("Error fetching job status:", error);
      res.status(500).json({ 
        error: "Failed to fetch job status" 
      });
    }
  });

  /**
   * DELETE /api/automation/:id
   * Delete an automation run (PROTECTED: requires authentication)
   */
  app.delete("/api/automation/:id", authenticate, forbidManager, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Verify the automation belongs to this user
      const automation = await automationService.getAutomationRun(id);
      if (!automation) {
        return res.status(404).json({ error: "Automation not found" });
      }

      if (automation.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this automation" });
      }

      // Don't allow deleting running automations
      if (automation.status === "running") {
        return res.status(400).json({ error: "Cannot delete a running automation. Stop it first." });
      }

      await automationService.deleteAutomationRun(id);

      res.json({ 
        success: true,
        message: "Automation deleted successfully" 
      });
    } catch (error) {
      console.error("Error deleting automation:", error);
      res.status(500).json({ 
        error: "Failed to delete automation" 
      });
    }
  });
}
