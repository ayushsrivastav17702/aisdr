import { db } from "../db";
import { apiUsage } from "@shared/schema";
import { and, eq, gte, count, sum, sql } from "drizzle-orm";

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// Default Apollo rate limits
const APOLLO_RATE_LIMITS: Record<string, RateLimitConfig> = {
  search: { maxRequests: 100, windowMs: 60000 },
  enrichment: { maxRequests: 50, windowMs: 60000 },
  bulk_enrichment: { maxRequests: 10, windowMs: 60000 },
};

class RateLimiterService {
  async checkRateLimit(service: string, endpoint: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    const config = APOLLO_RATE_LIMITS[endpoint] || { maxRequests: 60, windowMs: 60000 };
    const windowStart = new Date(Date.now() - config.windowMs);

    const [row] = await db
      .select({ total: count() })
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.provider, service),
          eq(apiUsage.endpoint, endpoint),
          gte(apiUsage.createdAt, windowStart)
        )
      );

    const used = Number(row?.total ?? 0);
    const allowed = used < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - used);
    const resetAt = new Date(Date.now() + config.windowMs);

    if (allowed) {
      await db.insert(apiUsage).values({
        provider: service,
        endpoint,
        success: true,
      }).catch((err) => {
        console.warn("[rate-limiter] Failed to record usage in DB (non-fatal):", err);
      });
    }

    return { allowed, remaining, resetAt };
  }

  async trackApiUsage(service: string, creditsUsed: number = 1): Promise<void> {
    await db.insert(apiUsage).values({
      provider: service,
      tokensUsed: creditsUsed,
      success: true,
    }).catch((err) => {
      console.warn("[rate-limiter] Failed to track usage in DB (non-fatal):", err);
    });
  }

  async getQuotaUsage(service: string): Promise<number> {
    const [row] = await db
      .select({ total: sum(apiUsage.tokensUsed) })
      .from(apiUsage)
      .where(eq(apiUsage.provider, service));
    return Number(row?.total ?? 0);
  }

  async getApolloStatistics(): Promise<{
    searchRequests: number;
    enrichmentRequests: number;
    bulkEnrichmentRequests: number;
    totalCreditsUsed: number;
  }> {
    const windowStart = new Date(Date.now() - 3_600_000);

    const [search, enrichment, bulk, credits] = await Promise.all([
      db.select({ total: count() }).from(apiUsage).where(
        and(eq(apiUsage.provider, "apollo"), eq(apiUsage.endpoint, "search"), gte(apiUsage.createdAt, windowStart))
      ),
      db.select({ total: count() }).from(apiUsage).where(
        and(eq(apiUsage.provider, "apollo"), eq(apiUsage.endpoint, "enrichment"), gte(apiUsage.createdAt, windowStart))
      ),
      db.select({ total: count() }).from(apiUsage).where(
        and(eq(apiUsage.provider, "apollo"), eq(apiUsage.endpoint, "bulk_enrichment"), gte(apiUsage.createdAt, windowStart))
      ),
      db.select({ total: sum(apiUsage.tokensUsed) }).from(apiUsage).where(
        eq(apiUsage.provider, "apollo")
      ),
    ]);

    return {
      searchRequests: Number(search[0]?.total ?? 0),
      enrichmentRequests: Number(enrichment[0]?.total ?? 0),
      bulkEnrichmentRequests: Number(bulk[0]?.total ?? 0),
      totalCreditsUsed: Number(credits[0]?.total ?? 0),
    };
  }
}

export const rateLimiterService = new RateLimiterService();
