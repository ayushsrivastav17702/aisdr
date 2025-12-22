import { Router } from "express";
import { db } from "../db";
import { 
  apiKeys, 
  apiUsageLogs,
  webhooks,
  webhookDeliveryLogs,
  users
} from "@shared/schema";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";
import { nanoid } from "nanoid";
import crypto from "crypto";

const router = Router();

function generateApiKey(): { fullKey: string; prefix: string; hash: string } {
  const fullKey = `aisdr_${nanoid(32)}`;
  const prefix = fullKey.substring(0, 12);
  const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
  return { fullKey, prefix, hash };
}

// ============================================
// API KEYS ROUTES
// ============================================

router.get("/api-keys", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const keys = await db
      .select({
        key: apiKeys,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(eq(apiKeys.organizationId, organizationId))
      .orderBy(desc(apiKeys.createdAt));

    const sanitizedKeys = keys.map(({ key, user }) => ({
      ...key,
      keyPrefix: key.keyPrefix + "..." ,
      keyHash: undefined,
      user,
    }));

    res.json({ apiKeys: sanitizedKeys });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    res.status(500).json({ error: "Failed to fetch API keys" });
  }
});

router.get("/api-keys/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, req.params.id),
        eq(apiKeys.organizationId, organizationId)
      ));

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({
      ...key,
      keyPrefix: key.keyPrefix + "...",
      keyHash: undefined,
    });
  } catch (error) {
    console.error("Error fetching API key:", error);
    res.status(500).json({ error: "Failed to fetch API key" });
  }
});

router.post("/api-keys", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId || !userId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { 
      name, 
      description, 
      scopes, 
      permissions,
      rateLimitPerMinute = 60,
      rateLimitPerDay = 10000,
      expiresAt,
      allowedIps
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const { fullKey, prefix, hash } = generateApiKey();

    const [newKey] = await db
      .insert(apiKeys)
      .values({
        organizationId,
        userId,
        name,
        description,
        keyPrefix: prefix,
        keyHash: hash,
        scopes,
        permissions,
        rateLimitPerMinute,
        rateLimitPerDay,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        allowedIps,
        status: "active",
      })
      .returning();

    res.status(201).json({
      apiKey: {
        ...newKey,
        fullKey,
        keyHash: undefined,
      },
      message: "Save this key securely - it will only be shown once",
    });
  } catch (error) {
    console.error("Error creating API key:", error);
    res.status(500).json({ error: "Failed to create API key" });
  }
});

router.patch("/api-keys/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'name', 'description', 'scopes', 'permissions',
      'rateLimitPerMinute', 'rateLimitPerDay', 'expiresAt', 'allowedIps'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = field === 'expiresAt' && req.body[field] 
          ? new Date(req.body[field]) 
          : req.body[field];
      }
    }

    const [updatedKey] = await db
      .update(apiKeys)
      .set(updateData)
      .where(and(
        eq(apiKeys.id, req.params.id),
        eq(apiKeys.organizationId, organizationId)
      ))
      .returning();

    if (!updatedKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({
      ...updatedKey,
      keyPrefix: updatedKey.keyPrefix + "...",
      keyHash: undefined,
    });
  } catch (error) {
    console.error("Error updating API key:", error);
    res.status(500).json({ error: "Failed to update API key" });
  }
});

router.post("/api-keys/:id/revoke", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { reason } = req.body;

    const [revokedKey] = await db
      .update(apiKeys)
      .set({
        status: "revoked",
        revokedAt: new Date(),
        revokedBy: userId,
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(and(
        eq(apiKeys.id, req.params.id),
        eq(apiKeys.organizationId, organizationId)
      ))
      .returning();

    if (!revokedKey) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({ success: true, message: "API key revoked" });
  } catch (error) {
    console.error("Error revoking API key:", error);
    res.status(500).json({ error: "Failed to revoke API key" });
  }
});

router.delete("/api-keys/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [deleted] = await db
      .delete(apiKeys)
      .where(and(
        eq(apiKeys.id, req.params.id),
        eq(apiKeys.organizationId, organizationId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "API key not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting API key:", error);
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

router.get("/api-keys/:id/usage", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [key] = await db
      .select()
      .from(apiKeys)
      .where(and(
        eq(apiKeys.id, req.params.id),
        eq(apiKeys.organizationId, organizationId)
      ));

    if (!key) {
      return res.status(404).json({ error: "API key not found" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageLogs = await db
      .select()
      .from(apiUsageLogs)
      .where(and(
        eq(apiUsageLogs.apiKeyId, req.params.id),
        gte(apiUsageLogs.createdAt, thirtyDaysAgo)
      ))
      .orderBy(desc(apiUsageLogs.createdAt))
      .limit(100);

    const stats = {
      totalRequests: key.usageCount || 0,
      lastUsed: key.lastUsedAt,
      recentLogs: usageLogs,
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching API key usage:", error);
    res.status(500).json({ error: "Failed to fetch API key usage" });
  }
});

// ============================================
// WEBHOOKS ROUTES
// ============================================

router.get("/webhooks", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const allWebhooks = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.organizationId, organizationId))
      .orderBy(desc(webhooks.createdAt));

    const sanitized = allWebhooks.map(w => ({
      ...w,
      authToken: w.authToken ? "***" : null,
      hmacSecret: w.hmacSecret ? "***" : null,
    }));

    res.json({ webhooks: sanitized });
  } catch (error) {
    console.error("Error fetching webhooks:", error);
    res.status(500).json({ error: "Failed to fetch webhooks" });
  }
});

router.get("/webhooks/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, req.params.id),
        eq(webhooks.organizationId, organizationId)
      ));

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.json({
      ...webhook,
      authToken: webhook.authToken ? "***" : null,
      hmacSecret: webhook.hmacSecret ? "***" : null,
    });
  } catch (error) {
    console.error("Error fetching webhook:", error);
    res.status(500).json({ error: "Failed to fetch webhook" });
  }
});

router.post("/webhooks", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { 
      name, 
      description,
      url, 
      events,
      authType = "none",
      authToken,
      authHeader,
      hmacSecret,
      maxRetries = 3,
      retryDelaySeconds = 60,
      timeoutSeconds = 30,
    } = req.body;

    if (!name || !url || !events || !events.length) {
      return res.status(400).json({ error: "Name, URL, and at least one event are required" });
    }

    const [newWebhook] = await db
      .insert(webhooks)
      .values({
        organizationId,
        name,
        description,
        url,
        events,
        authType,
        authToken,
        authHeader,
        hmacSecret,
        maxRetries,
        retryDelaySeconds,
        timeoutSeconds,
        isActive: true,
      })
      .returning();

    res.status(201).json({
      ...newWebhook,
      authToken: newWebhook.authToken ? "***" : null,
      hmacSecret: newWebhook.hmacSecret ? "***" : null,
    });
  } catch (error) {
    console.error("Error creating webhook:", error);
    res.status(500).json({ error: "Failed to create webhook" });
  }
});

router.patch("/webhooks/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'name', 'description', 'url', 'events', 'authType', 'authToken',
      'authHeader', 'hmacSecret', 'maxRetries', 'retryDelaySeconds',
      'timeoutSeconds', 'isActive'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const [updatedWebhook] = await db
      .update(webhooks)
      .set(updateData)
      .where(and(
        eq(webhooks.id, req.params.id),
        eq(webhooks.organizationId, organizationId)
      ))
      .returning();

    if (!updatedWebhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.json({
      ...updatedWebhook,
      authToken: updatedWebhook.authToken ? "***" : null,
      hmacSecret: updatedWebhook.hmacSecret ? "***" : null,
    });
  } catch (error) {
    console.error("Error updating webhook:", error);
    res.status(500).json({ error: "Failed to update webhook" });
  }
});

router.delete("/webhooks/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [deleted] = await db
      .delete(webhooks)
      .where(and(
        eq(webhooks.id, req.params.id),
        eq(webhooks.organizationId, organizationId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting webhook:", error);
    res.status(500).json({ error: "Failed to delete webhook" });
  }
});

router.post("/webhooks/:id/test", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, req.params.id),
        eq(webhooks.organizationId, organizationId)
      ));

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const testPayload = {
      event: "test.ping",
      timestamp: new Date().toISOString(),
      data: { message: "This is a test webhook delivery" },
    };

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (webhook.authType === 'bearer' && webhook.authToken) {
        headers['Authorization'] = `Bearer ${webhook.authToken}`;
      } else if (webhook.authType === 'basic' && webhook.authToken) {
        headers['Authorization'] = `Basic ${Buffer.from(webhook.authToken).toString('base64')}`;
      } else if (webhook.authHeader && webhook.authToken) {
        headers[webhook.authHeader] = webhook.authToken;
      }

      const startTime = Date.now();
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(webhook.timeoutSeconds ? webhook.timeoutSeconds * 1000 : 30000),
      });
      const responseTime = Date.now() - startTime;

      await db.insert(webhookDeliveryLogs).values({
        webhookId: webhook.id,
        eventType: "test.ping",
        payload: testPayload,
        statusCode: response.status,
        responseTimeMs: responseTime,
        success: response.ok,
        attemptNumber: 1,
      });

      await db.update(webhooks).set({
        lastTriggeredAt: new Date(),
        lastSuccessAt: response.ok ? new Date() : webhook.lastSuccessAt,
        lastFailureAt: !response.ok ? new Date() : webhook.lastFailureAt,
        consecutiveFailures: response.ok ? 0 : (webhook.consecutiveFailures || 0) + 1,
      }).where(eq(webhooks.id, webhook.id));

      res.json({
        success: response.ok,
        statusCode: response.status,
        responseTimeMs: responseTime,
      });
    } catch (fetchError: any) {
      await db.insert(webhookDeliveryLogs).values({
        webhookId: webhook.id,
        eventType: "test.ping",
        payload: testPayload,
        success: false,
        errorMessage: fetchError.message,
        attemptNumber: 1,
      });

      await db.update(webhooks).set({
        lastTriggeredAt: new Date(),
        lastFailureAt: new Date(),
        consecutiveFailures: (webhook.consecutiveFailures || 0) + 1,
      }).where(eq(webhooks.id, webhook.id));

      res.json({
        success: false,
        error: fetchError.message,
      });
    }
  } catch (error) {
    console.error("Error testing webhook:", error);
    res.status(500).json({ error: "Failed to test webhook" });
  }
});

router.get("/webhooks/:id/deliveries", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(and(
        eq(webhooks.id, req.params.id),
        eq(webhooks.organizationId, organizationId)
      ));

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const deliveries = await db
      .select()
      .from(webhookDeliveryLogs)
      .where(eq(webhookDeliveryLogs.webhookId, req.params.id))
      .orderBy(desc(webhookDeliveryLogs.createdAt))
      .limit(100);

    res.json({ deliveries });
  } catch (error) {
    console.error("Error fetching webhook deliveries:", error);
    res.status(500).json({ error: "Failed to fetch webhook deliveries" });
  }
});

router.get("/webhook-events", authenticate, requireAdmin, async (req, res) => {
  const events = [
    { category: "Email", events: ["email.sent", "email.delivered", "email.opened", "email.clicked", "email.bounced", "email.replied"] },
    { category: "Prospect", events: ["prospect.created", "prospect.updated", "prospect.enriched"] },
    { category: "Sequence", events: ["sequence.started", "sequence.completed", "sequence.paused"] },
    { category: "Campaign", events: ["campaign.created", "campaign.completed"] },
  ];
  res.json({ events });
});

export default router;
