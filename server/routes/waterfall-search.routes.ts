import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.middleware";
import { waterfallSearchService } from "../services/waterfall-search.service";
import { db } from "../db";
import { prospectSearches, apiUsage, prospects } from "@shared/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const router = Router();

const waterfallSearchSchema = z.object({
  industry: z.string().optional(),
  companySize: z.string().optional(),
  jobTitles: z.array(z.string()).optional(),
  location: z.string().optional(),
  limit: z.number().min(1).max(200).default(50),
  keywords: z.string().optional(),
  seniority: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  fundingStage: z.string().optional(),
  revenueRange: z.object({
    min: z.number().optional(),
    max: z.number().optional()
  }).optional()
});

router.post("/search", authenticate, async (req, res) => {
  try {
    const criteria = waterfallSearchSchema.parse(req.body);
    
    console.log('\n========== WATERFALL SEARCH REQUEST ==========');
    console.log('User:', req.userContext?.userId);
    console.log('Org:', req.userContext?.organizationId);
    console.log('Criteria:', JSON.stringify(criteria, null, 2));

    const result = await waterfallSearchService.search(
      criteria,
      req.userContext?.organizationId,
      req.userContext?.userId
    );

    console.log('\n========== WATERFALL SEARCH RESULT ==========');
    console.log('Providers:', result.providers.join(' → ') || 'none');
    console.log('Prospects Found:', result.prospects.length);
    console.log('Total Cost:', `$${result.totalCost.toFixed(4)}`);
    console.log('Provider Chain:', result.providerChain.map(p => `${p.provider}(${p.unique}/${p.fetched})`).join(' → '));

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Waterfall search error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed'
    });
  }
});

router.post("/search-and-save", authenticate, async (req, res) => {
  try {
    const { criteria: rawCriteria, extractionName, tag, autoEnrich } = z.object({
      criteria: waterfallSearchSchema,
      extractionName: z.string().optional(),
      tag: z.string().optional(),
      autoEnrich: z.boolean().default(false)
    }).parse(req.body);

    console.log('\n========== WATERFALL SEARCH AND SAVE ==========');
    console.log('Extraction Name:', extractionName);
    console.log('Tag:', tag);

    const result = await waterfallSearchService.search(
      rawCriteria,
      req.userContext?.organizationId,
      req.userContext?.userId
    );

    let savedCount = 0;
    let duplicateCount = 0;
    const savedProspects = [];

    for (const prospect of result.prospects) {
      try {
        if (prospect.email) {
          const existing = await db.select()
            .from(prospects)
            .where(and(
              eq(prospects.primaryEmail, prospect.email),
              eq(prospects.userId, req.userContext!.userId)
            ))
            .limit(1);

          if (existing.length > 0) {
            duplicateCount++;
            continue;
          }
        }

        const [saved] = await db.insert(prospects).values({
          userId: req.userContext!.userId,
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          fullName: prospect.fullName,
          primaryEmail: prospect.email,
          jobTitle: prospect.jobTitle,
          companyName: prospect.companyName,
          linkedinUrl: prospect.linkedinUrl,
          phoneNumber: prospect.phone,
          contactLocation: prospect.location,
          companySize: prospect.companySize,
          companyIndustry: prospect.industry,
          companyDomain: prospect.website?.replace(/^https?:\/\//, ''),
          tags: tag ? [tag] : [],
          enrichmentStatus: 'new',
          enrichmentData: { source: prospect.source, verified: prospect.verified ?? true }
        }).returning();

        savedProspects.push(saved);
        savedCount++;
      } catch (saveError) {
        console.error('Error saving prospect:', saveError);
      }
    }

    console.log(`Saved ${savedCount} prospects, ${duplicateCount} duplicates skipped`);

    res.json({
      success: true,
      providers: result.providers,
      totalFound: result.prospects.length,
      savedCount,
      duplicateCount,
      totalCost: result.totalCost,
      searchId: result.searchId,
      providerChain: result.providerChain,
      summary: result.summary,
      savedProspects: savedProspects.slice(0, 10)
    });
  } catch (error) {
    console.error('Waterfall search and save error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search and save failed'
    });
  }
});

router.get("/history", authenticate, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const orgId = req.userContext?.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    
    const searches = await waterfallSearchService.getSearchHistory(
      orgId,
      limit
    );

    res.json({
      success: true,
      searches,
      count: searches.length
    });
  } catch (error) {
    console.error('Search history error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch search history'
    });
  }
});

router.get("/usage", authenticate, async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const orgId = req.userContext?.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    
    const stats = await waterfallSearchService.getApiUsageStats(
      orgId,
      days
    );

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('API usage stats error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch usage stats'
    });
  }
});

router.get("/providers", authenticate, async (_req, res) => {
  try {
    const status = waterfallSearchService.getProviderStatus();

    res.json({
      success: true,
      providers: status,
      order: ['perplexity', 'apollo', 'lusha', 'openrouter'],
      description: 'Providers are tried in order until one returns sufficient results'
    });
  } catch (error) {
    console.error('Provider status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get provider status'
    });
  }
});

router.get("/cost-summary", authenticate, async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const orgId = req.userContext?.organizationId;
    
    if (!orgId) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }
    
    const since = new Date();
    since.setDate(since.getDate() - days);

    const usage = await db.select({
      provider: apiUsage.provider,
      totalCost: sql<number>`COALESCE(SUM(${apiUsage.cost}), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
      successRate: sql<number>`ROUND(AVG(CASE WHEN ${apiUsage.success} THEN 100.0 ELSE 0.0 END), 1)`
    })
    .from(apiUsage)
    .where(and(
      sql`${apiUsage.organizationId} = ${orgId}`,
      gte(apiUsage.createdAt, since)
    ))
    .groupBy(apiUsage.provider);

    const searchStats = await db.select({
      totalSearches: sql<number>`COUNT(*)`,
      totalProspects: sql<number>`COALESCE(SUM(${prospectSearches.totalResults}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${prospectSearches.apiCost}), 0)`,
      avgProspectsPerSearch: sql<number>`ROUND(AVG(${prospectSearches.totalResults}), 1)`
    })
    .from(prospectSearches)
    .where(and(
      sql`${prospectSearches.organizationId} = ${orgId}`,
      gte(prospectSearches.createdAt, since)
    ));

    res.json({
      success: true,
      period: { days, since, until: new Date() },
      byProvider: usage,
      searches: searchStats[0] || { totalSearches: 0, totalProspects: 0, totalCost: 0, avgProspectsPerSearch: 0 }
    });
  } catch (error) {
    console.error('Cost summary error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cost summary'
    });
  }
});

export default {
  path: '/api/waterfall',
  router
};
