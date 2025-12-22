import { Router } from "express";
import { db } from "../db";
import { 
  notificationSettings,
  notificationPreferences,
  notificationLogs
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

const NOTIFICATION_TYPES = [
  { id: "system_downtime", name: "System Downtime", category: "System", description: "Alerts when the system is down or experiencing issues" },
  { id: "integration_failure", name: "Integration Failure", category: "System", description: "Alerts when integrations fail or disconnect" },
  { id: "security_incident", name: "Security Incident", category: "Security", description: "Critical security alerts and unauthorized access attempts" },
  { id: "usage_limit_warning", name: "Usage Limit Warning", category: "Usage", description: "Warnings when approaching usage limits" },
  { id: "bounce_threshold", name: "Bounce Threshold Alert", category: "Email", description: "Alerts when bounce rate exceeds threshold" },
  { id: "spam_complaint", name: "Spam Complaint Alert", category: "Email", description: "Alerts on spam complaints" },
  { id: "blacklist_alert", name: "Blacklist Alert", category: "Email", description: "Alerts when domain/IP is blacklisted" },
  { id: "api_rate_limit", name: "API Rate Limit", category: "API", description: "Alerts when API rate limits are exceeded" },
  { id: "campaign_complete", name: "Campaign Complete", category: "Campaigns", description: "Notifications when campaigns complete" },
  { id: "sequence_complete", name: "Sequence Complete", category: "Sequences", description: "Notifications when sequences complete" },
  { id: "daily_digest", name: "Daily Digest", category: "Digest", description: "Daily summary of activity" },
];

// ============================================
// NOTIFICATION SETTINGS
// ============================================

router.get("/notification-settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    let [settings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(notificationSettings)
        .values({ organizationId })
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching notification settings:", error);
    res.status(500).json({ error: "Failed to fetch notification settings" });
  }
});

router.patch("/notification-settings", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'defaultChannels', 'businessHoursOnly', 'businessHoursStart', 'businessHoursEnd',
      'businessTimezone', 'escalationEnabled', 'escalationDelayMinutes', 'escalationEmails',
      'dailyDigestEnabled', 'dailyDigestTime', 'weeklyDigestEnabled', 'weeklyDigestDay'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    let [settings] = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.organizationId, organizationId));

    if (!settings) {
      [settings] = await db
        .insert(notificationSettings)
        .values({ organizationId, ...updateData })
        .returning();
    } else {
      [settings] = await db
        .update(notificationSettings)
        .set(updateData)
        .where(eq(notificationSettings.organizationId, organizationId))
        .returning();
    }

    res.json(settings);
  } catch (error) {
    console.error("Error updating notification settings:", error);
    res.status(500).json({ error: "Failed to update notification settings" });
  }
});

// ============================================
// NOTIFICATION PREFERENCES (per type)
// ============================================

router.get("/notification-types", authenticate, async (req, res) => {
  res.json({ types: NOTIFICATION_TYPES });
});

router.get("/notification-preferences", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, organizationId));

    const prefMap: Record<string, any> = {};
    for (const pref of preferences) {
      prefMap[pref.notificationType] = pref;
    }

    const combined = NOTIFICATION_TYPES.map(type => ({
      ...type,
      preference: prefMap[type.id] || {
        enabled: true,
        channels: ["email"],
        recipientEmails: [],
        recipientUserIds: [],
      },
    }));

    res.json({ preferences: combined });
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

router.put("/notification-preferences/:type", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const notificationType = req.params.type;
    const { enabled, channels, recipientEmails, recipientUserIds, threshold, thresholdUnit } = req.body;

    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.organizationId, organizationId),
        eq(notificationPreferences.notificationType, notificationType)
      ));

    let preference;
    if (existing) {
      [preference] = await db
        .update(notificationPreferences)
        .set({
          enabled,
          channels,
          recipientEmails,
          recipientUserIds,
          threshold,
          thresholdUnit,
          updatedAt: new Date(),
        })
        .where(eq(notificationPreferences.id, existing.id))
        .returning();
    } else {
      [preference] = await db
        .insert(notificationPreferences)
        .values({
          organizationId,
          notificationType,
          enabled,
          channels,
          recipientEmails,
          recipientUserIds,
          threshold,
          thresholdUnit,
        })
        .returning();
    }

    res.json(preference);
  } catch (error) {
    console.error("Error updating notification preference:", error);
    res.status(500).json({ error: "Failed to update notification preference" });
  }
});

// ============================================
// NOTIFICATION LOGS
// ============================================

router.get("/notification-logs", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { type, status, limit = "50" } = req.query;

    const conditions = [eq(notificationLogs.organizationId, organizationId)];

    if (type) {
      conditions.push(eq(notificationLogs.notificationType, type as string));
    }

    if (status) {
      conditions.push(eq(notificationLogs.status, status as string));
    }

    const logs = await db
      .select()
      .from(notificationLogs)
      .where(and(...conditions))
      .orderBy(desc(notificationLogs.createdAt))
      .limit(parseInt(limit as string));

    res.json({ logs });
  } catch (error) {
    console.error("Error fetching notification logs:", error);
    res.status(500).json({ error: "Failed to fetch notification logs" });
  }
});

export default router;
