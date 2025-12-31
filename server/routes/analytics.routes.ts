import { Router } from "express";
import { AnalyticsService } from "../services/analytics.service";
import { authenticate } from "../middleware/auth.middleware";
import { analyticsCache } from "../utils/cache";

const router = Router();
const ANALYTICS_CACHE_TTL = 30; // 30 seconds

router.get("/overview", authenticate, async (req, res) => {
  try {
    if (!req.userContext) {
      return res.status(401).json({ error: "Unauthorized" });
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
    const analyticsService = new AnalyticsService(req.userContext);
    const metrics = await analyticsService.getUsageMetrics();
    res.json(metrics);
  } catch (error) {
    console.error("Error fetching usage metrics:", error);
    res.status(500).json({ error: "Failed to fetch usage metrics" });
  }
});

export default router;
