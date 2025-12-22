import { Router } from "express";
import { db } from "../db";
import { 
  aiConfiguration,
  aiPromptTemplates,
  aiUsageLogs
} from "@shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { authenticate, requireAdmin } from "../middleware/auth.middleware";

const router = Router();

const AI_MODELS = [
  { provider: "openai", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { provider: "anthropic", models: ["claude-3-5-sonnet", "claude-3-opus", "claude-3-sonnet", "claude-3-haiku"] },
  { provider: "openrouter", models: ["Various models via OpenRouter"] },
];

const PROMPT_CATEGORIES = [
  { id: "email", name: "Email Generation", description: "Templates for generating email content" },
  { id: "personalization", name: "Personalization", description: "Templates for personalizing outreach" },
  { id: "analysis", name: "Analysis", description: "Templates for analyzing responses and data" },
  { id: "other", name: "Other", description: "General purpose templates" },
];

// ============================================
// AI CONFIGURATION
// ============================================

router.get("/ai-config", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    let [config] = await db
      .select()
      .from(aiConfiguration)
      .where(eq(aiConfiguration.organizationId, organizationId));

    if (!config) {
      [config] = await db
        .insert(aiConfiguration)
        .values({ organizationId })
        .returning();
    }

    res.json(config);
  } catch (error) {
    console.error("Error fetching AI config:", error);
    res.status(500).json({ error: "Failed to fetch AI configuration" });
  }
});

router.patch("/ai-config", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'defaultProvider', 'defaultModel', 'fallbackProvider', 'fallbackModel',
      'defaultTemperature', 'defaultMaxTokens',
      'dailyTokenLimit', 'monthlyTokenLimit', 'perCampaignTokenLimit',
      'contentFilterEnabled', 'blockedTopics', 'requiredDisclosures',
      'monthlyBudgetUsd', 'budgetAlertThreshold'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    let [config] = await db
      .select()
      .from(aiConfiguration)
      .where(eq(aiConfiguration.organizationId, organizationId));

    if (!config) {
      [config] = await db
        .insert(aiConfiguration)
        .values({ organizationId, ...updateData })
        .returning();
    } else {
      [config] = await db
        .update(aiConfiguration)
        .set(updateData)
        .where(eq(aiConfiguration.organizationId, organizationId))
        .returning();
    }

    res.json(config);
  } catch (error) {
    console.error("Error updating AI config:", error);
    res.status(500).json({ error: "Failed to update AI configuration" });
  }
});

router.get("/ai-models", authenticate, async (req, res) => {
  res.json({ models: AI_MODELS });
});

// ============================================
// AI PROMPT TEMPLATES
// ============================================

router.get("/ai-prompt-categories", authenticate, async (req, res) => {
  res.json({ categories: PROMPT_CATEGORIES });
});

router.get("/ai-prompts", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { category } = req.query;

    const conditions = [eq(aiPromptTemplates.organizationId, organizationId)];

    if (category) {
      conditions.push(eq(aiPromptTemplates.category, category as string));
    }

    const prompts = await db
      .select()
      .from(aiPromptTemplates)
      .where(and(...conditions))
      .orderBy(desc(aiPromptTemplates.createdAt));

    res.json({ prompts });
  } catch (error) {
    console.error("Error fetching AI prompts:", error);
    res.status(500).json({ error: "Failed to fetch AI prompts" });
  }
});

router.get("/ai-prompts/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [prompt] = await db
      .select()
      .from(aiPromptTemplates)
      .where(and(
        eq(aiPromptTemplates.id, req.params.id),
        eq(aiPromptTemplates.organizationId, organizationId)
      ));

    if (!prompt) {
      return res.status(404).json({ error: "Prompt template not found" });
    }

    res.json(prompt);
  } catch (error) {
    console.error("Error fetching AI prompt:", error);
    res.status(500).json({ error: "Failed to fetch AI prompt" });
  }
});

router.post("/ai-prompts", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    const userId = req.userContext?.userId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { 
      name, 
      description,
      category,
      systemPrompt,
      userPromptTemplate,
      requiredVariables,
      optionalVariables,
      temperature,
      maxTokens,
      isDefault
    } = req.body;

    if (!name || !category || !userPromptTemplate) {
      return res.status(400).json({ error: "Name, category, and user prompt template are required" });
    }

    if (isDefault) {
      await db
        .update(aiPromptTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(aiPromptTemplates.organizationId, organizationId),
          eq(aiPromptTemplates.category, category)
        ));
    }

    const [prompt] = await db
      .insert(aiPromptTemplates)
      .values({
        organizationId,
        name,
        description,
        category,
        systemPrompt,
        userPromptTemplate,
        requiredVariables,
        optionalVariables,
        temperature,
        maxTokens,
        isDefault: isDefault || false,
        isActive: true,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(prompt);
  } catch (error) {
    console.error("Error creating AI prompt:", error);
    res.status(500).json({ error: "Failed to create AI prompt" });
  }
});

router.patch("/ai-prompts/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    const allowedFields = [
      'name', 'description', 'category', 'systemPrompt', 'userPromptTemplate',
      'requiredVariables', 'optionalVariables', 'temperature', 'maxTokens',
      'isDefault', 'isActive'
    ];
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (req.body.isDefault === true && req.body.category) {
      await db
        .update(aiPromptTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(aiPromptTemplates.organizationId, organizationId),
          eq(aiPromptTemplates.category, req.body.category)
        ));
    }

    const [prompt] = await db
      .update(aiPromptTemplates)
      .set(updateData)
      .where(and(
        eq(aiPromptTemplates.id, req.params.id),
        eq(aiPromptTemplates.organizationId, organizationId)
      ))
      .returning();

    if (!prompt) {
      return res.status(404).json({ error: "Prompt template not found" });
    }

    res.json(prompt);
  } catch (error) {
    console.error("Error updating AI prompt:", error);
    res.status(500).json({ error: "Failed to update AI prompt" });
  }
});

router.delete("/ai-prompts/:id", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const [deleted] = await db
      .delete(aiPromptTemplates)
      .where(and(
        eq(aiPromptTemplates.id, req.params.id),
        eq(aiPromptTemplates.organizationId, organizationId)
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: "Prompt template not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting AI prompt:", error);
    res.status(500).json({ error: "Failed to delete AI prompt" });
  }
});

// ============================================
// AI USAGE TRACKING
// ============================================

router.get("/ai-usage", authenticate, requireAdmin, async (req, res) => {
  try {
    const organizationId = req.userContext?.organizationId;
    if (!organizationId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const { period = "30" } = req.query;
    const daysAgo = parseInt(period as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const usage = await db
      .select()
      .from(aiUsageLogs)
      .where(and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, startDate)
      ))
      .orderBy(desc(aiUsageLogs.createdAt))
      .limit(500);

    const [stats] = await db
      .select({
        totalTokens: sql<number>`sum(total_tokens)::int`,
        totalCost: sql<number>`sum(estimated_cost_usd)`,
        requestCount: sql<number>`count(*)::int`,
      })
      .from(aiUsageLogs)
      .where(and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, startDate)
      ));

    const byModel = await db
      .select({
        model: aiUsageLogs.model,
        tokens: sql<number>`sum(total_tokens)::int`,
        cost: sql<number>`sum(estimated_cost_usd)`,
        count: sql<number>`count(*)::int`,
      })
      .from(aiUsageLogs)
      .where(and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, startDate)
      ))
      .groupBy(aiUsageLogs.model);

    res.json({
      summary: {
        totalTokens: stats?.totalTokens || 0,
        totalCost: stats?.totalCost || 0,
        requestCount: stats?.requestCount || 0,
        period: `${daysAgo} days`,
      },
      byModel,
      recentLogs: usage,
    });
  } catch (error) {
    console.error("Error fetching AI usage:", error);
    res.status(500).json({ error: "Failed to fetch AI usage" });
  }
});

export default router;
