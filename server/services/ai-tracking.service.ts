import { db } from '../db';
import { aiGenerations, userQuotas, metricsDaily, type AIGeneration, type InsertAIGeneration } from '@shared/schema';
import { eq, and, gte, lte, sql, desc, sum } from 'drizzle-orm';

interface ModelPricing {
  promptPer1k: number;
  completionPer1k: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { promptPer1k: 0.005, completionPer1k: 0.015 },
  'gpt-4o-mini': { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  'gpt-4-turbo': { promptPer1k: 0.01, completionPer1k: 0.03 },
  'gpt-3.5-turbo': { promptPer1k: 0.0005, completionPer1k: 0.0015 },
  'claude-sonnet-4-20250514': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'claude-3-opus-20240229': { promptPer1k: 0.015, completionPer1k: 0.075 },
  'anthropic/claude-3.5-sonnet': { promptPer1k: 0.003, completionPer1k: 0.015 },
  'openai/gpt-4o': { promptPer1k: 0.005, completionPer1k: 0.015 },
  'default': { promptPer1k: 0.002, completionPer1k: 0.006 },
};

export interface TrackGenerationParams {
  userId: string;
  tenantId?: string;
  generationType: string;
  prompt?: string;
  response?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface UsageStats {
  totalGenerations: number;
  totalTokens: number;
  totalCost: number;
  byType: Record<string, { count: number; tokens: number; cost: number }>;
  byModel: Record<string, { count: number; tokens: number; cost: number }>;
}

class AITrackingService {
  calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
    const promptCost = (promptTokens / 1000) * pricing.promptPer1k;
    const completionCost = (completionTokens / 1000) * pricing.completionPer1k;
    return Math.round((promptCost + completionCost) * 1000000) / 1000000;
  }

  async trackGeneration(params: TrackGenerationParams): Promise<AIGeneration> {
    const totalTokens = (params.promptTokens || 0) + (params.completionTokens || 0);
    const costUsd = params.model && params.promptTokens && params.completionTokens
      ? this.calculateCost(params.model, params.promptTokens, params.completionTokens)
      : null;

    const [generation] = await db.insert(aiGenerations)
      .values({
        userId: params.userId,
        tenantId: params.tenantId,
        generationType: params.generationType,
        prompt: params.prompt,
        response: params.response,
        model: params.model,
        provider: params.provider,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens,
        costUsd,
        latencyMs: params.latencyMs,
        success: params.success ?? true,
        errorMessage: params.errorMessage,
        metadata: params.metadata,
      })
      .returning();

    if (params.success !== false) {
      await this.updateDailyMetrics(params.userId, params.tenantId, totalTokens);
    }

    return generation;
  }

  async getUsageStats(userId: string, startDate: Date, endDate: Date): Promise<UsageStats> {
    const generations = await db.select()
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.userId, userId),
        gte(aiGenerations.createdAt, startDate),
        lte(aiGenerations.createdAt, endDate),
        eq(aiGenerations.success, true)
      ));

    const stats: UsageStats = {
      totalGenerations: generations.length,
      totalTokens: 0,
      totalCost: 0,
      byType: {},
      byModel: {},
    };

    for (const gen of generations) {
      const tokens = gen.totalTokens || 0;
      const cost = gen.costUsd || 0;
      
      stats.totalTokens += tokens;
      stats.totalCost += cost;

      if (!stats.byType[gen.generationType]) {
        stats.byType[gen.generationType] = { count: 0, tokens: 0, cost: 0 };
      }
      stats.byType[gen.generationType].count++;
      stats.byType[gen.generationType].tokens += tokens;
      stats.byType[gen.generationType].cost += cost;

      const model = gen.model || 'unknown';
      if (!stats.byModel[model]) {
        stats.byModel[model] = { count: 0, tokens: 0, cost: 0 };
      }
      stats.byModel[model].count++;
      stats.byModel[model].tokens += tokens;
      stats.byModel[model].cost += cost;
    }

    stats.totalCost = Math.round(stats.totalCost * 100) / 100;
    return stats;
  }

  async getRecentGenerations(userId: string, limit = 50): Promise<AIGeneration[]> {
    return db.select()
      .from(aiGenerations)
      .where(eq(aiGenerations.userId, userId))
      .orderBy(desc(aiGenerations.createdAt))
      .limit(limit);
  }

  async getTotalSpend(userId: string, period: 'day' | 'week' | 'month' | 'all' = 'month'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(0);
    }

    const result = await db.select({
      total: sum(aiGenerations.costUsd),
    })
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.userId, userId),
        gte(aiGenerations.createdAt, startDate),
        eq(aiGenerations.success, true)
      ));

    return Number(result[0]?.total) || 0;
  }

  async checkQuota(userId: string, quotaType: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
    const today = new Date().toISOString().split('T')[0];
    
    const [quota] = await db.select()
      .from(userQuotas)
      .where(and(
        eq(userQuotas.userId, userId),
        eq(userQuotas.quotaType, quotaType),
        eq(userQuotas.isActive, true)
      ))
      .limit(1);

    if (!quota) {
      return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    const remaining = quota.quotaValue - (quota.currentValue || 0);
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      limit: quota.quotaValue,
    };
  }

  async incrementQuotaUsage(userId: string, quotaType: string, amount = 1): Promise<void> {
    await db.update(userQuotas)
      .set({
        currentValue: sql`${userQuotas.currentValue} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(userQuotas.userId, userId),
        eq(userQuotas.quotaType, quotaType),
        eq(userQuotas.isActive, true)
      ));
  }

  private async updateDailyMetrics(userId: string, tenantId: string | undefined, aiCredits: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    const [existing] = await db.select()
      .from(metricsDaily)
      .where(and(
        eq(metricsDaily.userId, userId),
        eq(metricsDaily.date, today)
      ))
      .limit(1);

    if (existing) {
      await db.update(metricsDaily)
        .set({
          aiCreditsUsed: sql`${metricsDaily.aiCreditsUsed} + ${aiCredits}`,
          updatedAt: new Date(),
        })
        .where(eq(metricsDaily.id, existing.id));
    } else {
      await db.insert(metricsDaily)
        .values({
          userId,
          tenantId,
          date: today,
          aiCreditsUsed: aiCredits,
        });
    }
  }

  async getAverageLatency(userId: string, generationType?: string): Promise<number> {
    const conditions = [
      eq(aiGenerations.userId, userId),
      eq(aiGenerations.success, true),
    ];
    
    if (generationType) {
      conditions.push(eq(aiGenerations.generationType, generationType));
    }

    const result = await db.select({
      avg: sql<number>`AVG(${aiGenerations.latencyMs})`,
    })
      .from(aiGenerations)
      .where(and(...conditions));

    return Math.round(result[0]?.avg || 0);
  }

  async getSuccessRate(userId: string, period: 'day' | 'week' | 'month' = 'month'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    const generations = await db.select({
      success: aiGenerations.success,
    })
      .from(aiGenerations)
      .where(and(
        eq(aiGenerations.userId, userId),
        gte(aiGenerations.createdAt, startDate)
      ));

    if (generations.length === 0) return 100;
    
    const successCount = generations.filter(g => g.success).length;
    return Math.round((successCount / generations.length) * 100);
  }
}

export const aiTrackingService = new AITrackingService();
