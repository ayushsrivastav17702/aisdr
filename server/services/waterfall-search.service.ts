import { db } from "../db";
import { prospectSearches, apiUsage, type WaterfallSearchCriteria } from "@shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";

export type SearchProvider = 'apify';

export interface WaterfallProspect {
  fullName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle: string;
  companyName: string;
  linkedinUrl?: string;
  phone?: string;
  location?: string;
  companySize?: string;
  industry?: string;
  website?: string;
  source: SearchProvider;
  verified?: boolean;
}

export interface ProviderContribution {
  provider: SearchProvider;
  fetched: number;
  unique: number;
  cost: number;
}

export interface WaterfallSearchResult {
  providers: SearchProvider[];
  prospects: WaterfallProspect[];
  totalCost: number;
  searchId: string;
  providerChain: ProviderContribution[];
  summary: {
    totalFetched: number;
    totalUnique: number;
    primaryProvider: SearchProvider;
  };
}

class WaterfallSearchService {
  async search(
    criteria: WaterfallSearchCriteria,
    organizationId?: string,
    userId?: string
  ): Promise<WaterfallSearchResult> {
    const searchRecord = await this.createSearchRecord(criteria, organizationId, userId);
    await this.updateSearchRecord(searchRecord.id, 'apify', 0, 0, 'No search providers configured (Apify pending)');

    return {
      providers: [],
      prospects: [],
      totalCost: 0,
      searchId: searchRecord.id,
      providerChain: [],
      summary: { totalFetched: 0, totalUnique: 0, primaryProvider: 'apify' },
    };
  }

  private async createSearchRecord(
    criteria: WaterfallSearchCriteria,
    organizationId?: string,
    userId?: string
  ) {
    const [record] = await db.insert(prospectSearches).values({
      organizationId: organizationId || null,
      userId: userId || null,
      searchCriteria: criteria,
      status: 'in_progress'
    }).returning();
    return record;
  }

  private async updateSearchRecord(
    searchId: string,
    provider: string,
    totalResults: number,
    cost: number,
    errorMessage?: string
  ) {
    await db.update(prospectSearches)
      .set({
        provider,
        totalResults,
        apiCost: cost,
        status: errorMessage ? 'failed' : 'completed',
        errorMessage
      })
      .where(eq(prospectSearches.id, searchId));
  }

  async getSearchHistory(organizationId: string, limit = 20) {
    return db.select()
      .from(prospectSearches)
      .where(eq(prospectSearches.organizationId, organizationId))
      .orderBy(desc(prospectSearches.createdAt))
      .limit(limit);
  }

  async getApiUsageStats(organizationId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const usage = await db.select()
      .from(apiUsage)
      .where(and(
        eq(apiUsage.organizationId, organizationId),
        gte(apiUsage.createdAt, since)
      ))
      .orderBy(desc(apiUsage.createdAt));

    const byProvider: Record<string, { calls: number; cost: number; tokens: number }> = {};
    let totalCost = 0;
    let totalCalls = 0;

    for (const record of usage) {
      const provider = record.provider;
      if (!byProvider[provider]) byProvider[provider] = { calls: 0, cost: 0, tokens: 0 };
      byProvider[provider].calls++;
      byProvider[provider].cost += record.cost || 0;
      byProvider[provider].tokens += record.tokensUsed || 0;
      totalCost += record.cost || 0;
      totalCalls++;
    }

    return { totalCost, totalCalls, byProvider, period: { days, since, until: new Date() } };
  }

  getProviderStatus() {
    return {
      apify: { configured: false, priority: 1, note: 'Apify integration pending' }
    };
  }
}

export const waterfallSearchService = new WaterfallSearchService();
