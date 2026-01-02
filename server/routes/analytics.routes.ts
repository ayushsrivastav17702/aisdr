import { Router } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { authenticate } from "../middleware/auth.middleware";
import { analyticsCache } from "../utils/cache";
import { sdrWorkflowService, WorkflowBlockedError } from "../services/sdr-workflow.service";

const router = Router();
const ANALYTICS_CACHE_TTL = 30; // 30 seconds

// Helper function for workflow stage check - fails open for read-only analytics
async function checkAnalyticsWorkflowStage(userId: string): Promise<{ allowed: boolean; error?: any }> {
  try {
    await sdrWorkflowService.assertStage(userId, "analytics");
    return { allowed: true };
  } catch (stageError) {
    if (stageError instanceof WorkflowBlockedError) {
      return { allowed: false, error: stageError.toJSON() };
    }
    // For read-only analytics, fail open on unexpected errors
    console.warn("Analytics workflow check failed, allowing read:", stageError);
    return { allowed: true };
  }
}

router.get("/overview", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Workflow stage gate for analytics
    const workflowCheck = await checkAnalyticsWorkflowStage(req.userContext.userId);
    if (!workflowCheck.allowed) {
      return res.status(403).json(workflowCheck.error);
    }
    
    const cacheKey = `analytics:overview:${req.userContext.userId}`;
    const cached = analyticsCache.get<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const analyticsService = new AnalyticsService(req.userContext);
    const overview = await analyticsService.getOverview();
    
    analyticsCache.set(cacheKey, overview, ANALYTICS_CACHE_TTL);
    res.json(overview);
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});

router.get("/activity-logs", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Workflow stage gate for analytics
    const workflowCheck = await checkAnalyticsWorkflowStage(req.userContext.userId);
    if (!workflowCheck.allowed) {
      return res.status(403).json(workflowCheck.error);
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const analyticsService = new AnalyticsService(req.userContext);
    const logs = await analyticsService.getActivityLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

router.get("/time-series", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Workflow stage gate for analytics
    const workflowCheck = await checkAnalyticsWorkflowStage(req.userContext.userId);
    if (!workflowCheck.allowed) {
      return res.status(403).json(workflowCheck.error);
    }

    const days = req.query.days ? parseInt(req.query.days as string) : 30;
    const analyticsService = new AnalyticsService(req.userContext);
    const data = await analyticsService.getTimeSeriesData(days);
    res.json(data);
  } catch (error) {
    console.error("Error fetching time series data:", error);
    res.status(500).json({ error: "Failed to fetch time series data" });
  }
});

router.get("/sequence-performance", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Workflow stage gate for analytics
    const workflowCheck = await checkAnalyticsWorkflowStage(req.userContext.userId);
    if (!workflowCheck.allowed) {
      return res.status(403).json(workflowCheck.error);
    }

    const analyticsService = new AnalyticsService(req.userContext);
    const performance = await analyticsService.getSequencePerformance();
    res.json(performance);
  } catch (error) {
    console.error("Error fetching sequence performance:", error);
    res.status(500).json({ error: "Failed to fetch sequence performance" });
  }
});

router.get("/usage-metrics", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Workflow stage gate for analytics
    const workflowCheck = await checkAnalyticsWorkflowStage(req.userContext.userId);
    if (!workflowCheck.allowed) {
      return res.status(403).json(workflowCheck.error);
    }

    const analyticsService = new AnalyticsService(req.userContext);
    const metrics = await analyticsService.getUsageMetrics();
    res.json(metrics);
  } catch (error) {
    console.error("Error fetching usage metrics:", error);
    res.status(500).json({ error: "Failed to fetch usage metrics" });
  }
});

export default router;
