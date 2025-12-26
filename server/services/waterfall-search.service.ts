import { db } from "../db";
import { prospectSearches, apiUsage, type WaterfallSearchCriteria } from "@shared/schema";
import { perplexityService } from "./perplexity.service";
import { lushaService } from "./lusha.service";
import { apolloService } from "./apollo.service";
import { eq, desc, and, gte } from "drizzle-orm";

export type SearchProvider = 'perplexity' | 'apollo' | 'lusha' | 'openrouter';

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

export interface WaterfallSearchResult {
  provider: SearchProvider;
  prospects: WaterfallProspect[];
  totalCost: number;
  searchId: string;
  providerChain: { provider: SearchProvider; resultCount: number; cost: number }[];
}

class WaterfallSearchService {
  private openRouterApiKey: string;
  private openRouterBaseUrl = 'https://openrouter.ai/api/v1';

  constructor() {
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER || '';
  }

  async search(
    criteria: WaterfallSearchCriteria,
    organizationId?: string,
    userId?: string
  ): Promise<WaterfallSearchResult> {
    const limit = criteria.limit || 50;
    let totalCost = 0;
    const providerChain: { provider: SearchProvider; resultCount: number; cost: number }[] = [];

    const searchRecord = await this.createSearchRecord(criteria, organizationId, userId);

    try {
      console.log('🔍 Starting Waterfall Search...');
      console.log('   Criteria:', JSON.stringify(criteria, null, 2));

      if (perplexityService.isConfigured()) {
        console.log('\n📡 Step 1: Trying Perplexity API...');
        const { prospects, cost } = await perplexityService.searchProspects(criteria, organizationId);
        totalCost += cost;
        providerChain.push({ provider: 'perplexity', resultCount: prospects.length, cost });

        if (prospects.length >= limit) {
          await this.updateSearchRecord(searchRecord.id, 'perplexity', prospects.length, totalCost);
          return {
            provider: 'perplexity',
            prospects: prospects.slice(0, limit) as WaterfallProspect[],
            totalCost,
            searchId: searchRecord.id,
            providerChain
          };
        }
        console.log(`   Perplexity returned ${prospects.length}/${limit} prospects`);
      } else {
        console.log('   ⚠️ Perplexity not configured, skipping...');
      }

      if (apolloService.isConfigured()) {
        console.log('\n📡 Step 2: Trying Apollo API...');
        const apolloProspects = await this.searchApollo(criteria, organizationId);
        const apolloCost = apolloProspects.length * 0.10;
        totalCost += apolloCost;
        providerChain.push({ provider: 'apollo', resultCount: apolloProspects.length, cost: apolloCost });

        if (apolloProspects.length >= limit) {
          await this.updateSearchRecord(searchRecord.id, 'apollo', apolloProspects.length, totalCost);
          return {
            provider: 'apollo',
            prospects: apolloProspects.slice(0, limit),
            totalCost,
            searchId: searchRecord.id,
            providerChain
          };
        }
        console.log(`   Apollo returned ${apolloProspects.length}/${limit} prospects`);
      } else {
        console.log('   ⚠️ Apollo not configured, skipping...');
      }

      if (lushaService.isConfigured()) {
        console.log('\n📡 Step 3: Trying Lusha API...');
        const { prospects, cost } = await lushaService.searchProspects(criteria, organizationId);
        totalCost += cost;
        providerChain.push({ provider: 'lusha', resultCount: prospects.length, cost });

        if (prospects.length >= limit) {
          await this.updateSearchRecord(searchRecord.id, 'lusha', prospects.length, totalCost);
          return {
            provider: 'lusha',
            prospects: prospects.slice(0, limit) as WaterfallProspect[],
            totalCost,
            searchId: searchRecord.id,
            providerChain
          };
        }
        console.log(`   Lusha returned ${prospects.length}/${limit} prospects`);
      } else {
        console.log('   ⚠️ Lusha not configured, skipping...');
      }

      console.log('\n📡 Step 4: Using OpenRouter AI Fallback...');
      const { prospects: aiProspects, cost: aiCost } = await this.generateWithOpenRouter(criteria, organizationId);
      totalCost += aiCost;
      providerChain.push({ provider: 'openrouter', resultCount: aiProspects.length, cost: aiCost });

      await this.updateSearchRecord(searchRecord.id, 'openrouter', aiProspects.length, totalCost);

      return {
        provider: 'openrouter',
        prospects: aiProspects.slice(0, limit),
        totalCost,
        searchId: searchRecord.id,
        providerChain
      };

    } catch (error) {
      console.error('Waterfall search failed:', error);
      await this.updateSearchRecord(
        searchRecord.id,
        'failed',
        0,
        totalCost,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  }

  private async searchApollo(
    criteria: WaterfallSearchCriteria,
    organizationId?: string
  ): Promise<WaterfallProspect[]> {
    try {
      const apolloFilters: any = {};

      if (criteria.jobTitles && criteria.jobTitles.length > 0) {
        apolloFilters.person_titles = criteria.jobTitles;
      }
      if (criteria.seniority && criteria.seniority.length > 0) {
        apolloFilters.person_seniorities = criteria.seniority;
      }
      if (criteria.departments && criteria.departments.length > 0) {
        apolloFilters.person_departments = criteria.departments;
      }
      if (criteria.industry) {
        apolloFilters.organization_industry_tag_ids = [criteria.industry];
      }
      if (criteria.companySize) {
        apolloFilters.organization_num_employees_ranges = [this.mapCompanySizeToApollo(criteria.companySize)];
      }
      if (criteria.location) {
        apolloFilters.person_locations = [criteria.location];
      }
      if (criteria.technologies && criteria.technologies.length > 0) {
        apolloFilters.q_organization_keyword_tags = criteria.technologies;
      }
      if (criteria.keywords) {
        apolloFilters.q_keywords = criteria.keywords;
      }

      const response = await apolloService.searchContacts({
        ...apolloFilters,
        page: 1,
        per_page: criteria.limit || 50
      });

      const contacts = response.people || response.contacts || [];

      await this.logApiUsage(organizationId, 'apollo', '/mixed_people/search', criteria, { count: contacts.length }, contacts.length * 0.10, true);

      return contacts.map((contact: any) => ({
        fullName: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        firstName: contact.first_name,
        lastName: contact.last_name,
        email: contact.email,
        jobTitle: contact.title || '',
        companyName: contact.organization?.name || '',
        linkedinUrl: contact.linkedin_url,
        phone: contact.phone_numbers?.[0]?.raw_number,
        location: contact.city,
        companySize: contact.organization?.estimated_num_employees?.toString(),
        industry: contact.organization?.industry,
        website: contact.organization?.website_url,
        source: 'apollo' as const
      }));

    } catch (error) {
      console.error('Apollo search in waterfall failed:', error);
      await this.logApiUsage(organizationId, 'apollo', '/mixed_people/search', criteria, null, 0, false);
      return [];
    }
  }

  private async generateWithOpenRouter(
    criteria: WaterfallSearchCriteria,
    organizationId?: string
  ): Promise<{ prospects: WaterfallProspect[]; cost: number }> {
    if (!this.openRouterApiKey) {
      console.log('⚠️ OpenRouter API not configured, returning empty results');
      return { prospects: [], cost: 0 };
    }

    try {
      const prompt = this.buildOpenRouterPrompt(criteria);

      const response = await fetch(`${this.openRouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'https://increff-aisdr.replit.app',
          'X-Title': 'AISDR Prospect Search'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          messages: [
            {
              role: 'system',
              content: `You are a B2B prospect data generator. Based on the given ICP criteria, generate realistic prospect data.
Return ONLY a valid JSON array of prospects. Each prospect must have:
- fullName (required): Realistic full name
- firstName: First name
- lastName: Last name
- email: Generated realistic business email
- jobTitle (required): Job title matching criteria
- companyName (required): Realistic company name in the target industry
- linkedinUrl: Simulated LinkedIn URL format
- location: City/Region
- companySize: Company size estimate
- industry: Industry name

Generate realistic but fictional data based on the ICP criteria. These are AI-generated leads that need verification.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', response.status, errorText);
        return { prospects: [], cost: 0 };
      }

      const data = await response.json();
      const cost = this.calculateOpenRouterCost(data.usage);
      
      await this.logApiUsage(organizationId, 'openrouter', '/chat/completions', criteria, { model: data.model, usage: data.usage }, cost, true);

      const content = data.choices?.[0]?.message?.content || '';
      const prospects = this.parseAIResponse(content);

      console.log(`✅ OpenRouter generated ${prospects.length} AI prospects (cost: $${cost.toFixed(4)})`);

      return { prospects, cost };

    } catch (error) {
      console.error('OpenRouter generation failed:', error);
      return { prospects: [], cost: 0 };
    }
  }

  private buildOpenRouterPrompt(criteria: WaterfallSearchCriteria): string {
    const parts: string[] = [];
    
    parts.push(`Generate ${criteria.limit || 50} B2B prospect leads matching this Ideal Customer Profile:`);
    
    if (criteria.industry) parts.push(`- Industry: ${criteria.industry}`);
    if (criteria.companySize) parts.push(`- Company Size: ${criteria.companySize}`);
    if (criteria.jobTitles?.length) parts.push(`- Job Titles: ${criteria.jobTitles.join(', ')}`);
    if (criteria.seniority?.length) parts.push(`- Seniority: ${criteria.seniority.join(', ')}`);
    if (criteria.departments?.length) parts.push(`- Departments: ${criteria.departments.join(', ')}`);
    if (criteria.location) parts.push(`- Location: ${criteria.location}`);
    if (criteria.technologies?.length) parts.push(`- Technologies: ${criteria.technologies.join(', ')}`);
    if (criteria.keywords) parts.push(`- Keywords: ${criteria.keywords}`);

    parts.push('\nReturn ONLY a JSON array. No explanation or markdown.');
    
    return parts.join('\n');
  }

  private parseAIResponse(content: string): WaterfallProspect[] {
    if (!content) return [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((p: any) => p.fullName && p.jobTitle && p.companyName)
        .map((p: any) => ({
          fullName: p.fullName,
          firstName: p.firstName || p.fullName.split(' ')[0],
          lastName: p.lastName || p.fullName.split(' ').slice(1).join(' '),
          email: p.email,
          jobTitle: p.jobTitle,
          companyName: p.companyName,
          linkedinUrl: p.linkedinUrl,
          phone: p.phone,
          location: p.location,
          companySize: p.companySize,
          industry: p.industry,
          website: p.website,
          source: 'openrouter' as const,
          verified: false
        }));

    } catch (error) {
      console.error('Failed to parse OpenRouter response:', error);
      return [];
    }
  }

  private calculateOpenRouterCost(usage?: { prompt_tokens: number; completion_tokens: number }): number {
    if (!usage) return 0;
    const inputCost = (usage.prompt_tokens / 1000) * 0.00025;
    const outputCost = (usage.completion_tokens / 1000) * 0.00125;
    return inputCost + outputCost;
  }

  private mapCompanySizeToApollo(size: string): string {
    const sizeMap: Record<string, string> = {
      '1-10': '1-10',
      '11-50': '11-50',
      '51-200': '51-200',
      '201-500': '201-500',
      '501-1000': '501-1000',
      '1001-5000': '1001-5000',
      '5000+': '5001-10000',
      'small': '1-50',
      'medium': '51-500',
      'large': '501-5000',
      'enterprise': '5001-10000'
    };
    return sizeMap[size.toLowerCase()] || size;
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

  private async logApiUsage(
    organizationId: string | undefined,
    provider: string,
    endpoint: string,
    requestData: any,
    responseData: any,
    cost: number,
    success: boolean
  ) {
    try {
      await db.insert(apiUsage).values({
        organizationId: organizationId || null,
        provider,
        endpoint,
        requestData,
        responseData,
        tokensUsed: 0,
        cost,
        success
      });
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
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
      if (!byProvider[provider]) {
        byProvider[provider] = { calls: 0, cost: 0, tokens: 0 };
      }
      byProvider[provider].calls++;
      byProvider[provider].cost += record.cost || 0;
      byProvider[provider].tokens += record.tokensUsed || 0;
      totalCost += record.cost || 0;
      totalCalls++;
    }

    return {
      totalCost,
      totalCalls,
      byProvider,
      period: { days, since, until: new Date() }
    };
  }

  getProviderStatus() {
    return {
      perplexity: { configured: perplexityService.isConfigured(), priority: 1 },
      apollo: { configured: apolloService.isConfigured(), priority: 2 },
      lusha: { configured: lushaService.isConfigured(), priority: 3 },
      openrouter: { configured: !!this.openRouterApiKey, priority: 4, fallback: true }
    };
  }
}

export const waterfallSearchService = new WaterfallSearchService();
