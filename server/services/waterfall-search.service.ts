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
    let totalFetched = 0;
    const providerChain: ProviderContribution[] = [];
    const accumulatedProspects: WaterfallProspect[] = [];
    const usedProviders: SearchProvider[] = [];

    const searchRecord = await this.createSearchRecord(criteria, organizationId, userId);

    // Helper to check if email is a locked/placeholder email
    const isLockedEmail = (email?: string): boolean => {
      if (!email || email === '') return false;
      // Check for specific Apollo placeholder patterns
      return email.includes('email_not_unlocked') || 
             email === 'locked@domain.com' ||
             email.endsWith('@domain.com');
    };

    // Clean prospect emails - remove locked placeholders
    const cleanProspectEmail = (p: WaterfallProspect): WaterfallProspect => {
      if (isLockedEmail(p.email)) {
        return { ...p, email: undefined };
      }
      return p;
    };

    const createDedupeKey = (p: WaterfallProspect): string => {
      // Ignore locked emails for deduplication
      const email = (!isLockedEmail(p.email) && p.email) ? p.email.toLowerCase() : '';
      const name = p.fullName.toLowerCase();
      const company = p.companyName.toLowerCase();
      const title = p.jobTitle?.toLowerCase() || '';
      const linkedin = p.linkedinUrl?.toLowerCase() || '';
      if (email) return `email:${email}`;
      if (linkedin) return `linkedin:${linkedin}`;
      return `person:${name}|${company}|${title}`;
    };

    const deduplicateProspects = (existing: WaterfallProspect[], newProspects: WaterfallProspect[]): WaterfallProspect[] => {
      const existingKeys = new Set(existing.map(createDedupeKey));
      return newProspects
        .map(cleanProspectEmail)  // Clean locked emails before adding
        .filter(p => {
          const key = createDedupeKey(p);
          if (existingKeys.has(key)) return false;
          existingKeys.add(key);
          return true;
        });
    };

    const getRemainingNeeded = (): number => Math.max(0, limit - accumulatedProspects.length);

    try {
      console.log('🔍 Starting Waterfall Search (Accumulating Mode)...');
      console.log('   Criteria:', JSON.stringify(criteria, null, 2));
      console.log(`   Target: ${limit} prospects`);

      const buildResult = (): WaterfallSearchResult => {
        const primaryProvider = usedProviders.length > 0 ? usedProviders[0] : 'openrouter';
        return {
          providers: usedProviders,
          prospects: accumulatedProspects.slice(0, limit),
          totalCost,
          searchId: searchRecord.id,
          providerChain,
          summary: {
            totalFetched,
            totalUnique: accumulatedProspects.length,
            primaryProvider
          }
        };
      };

      if (perplexityService.isConfigured() && getRemainingNeeded() > 0) {
        console.log('\n📡 Step 1: Trying Perplexity API...');
        try {
          const requestLimit = Math.min(getRemainingNeeded() + 10, criteria.limit || 50);
          const { prospects, cost } = await perplexityService.searchProspects(
            { ...criteria, limit: requestLimit },
            organizationId
          );
          const fetchedCount = prospects.length;
          totalFetched += fetchedCount;
          totalCost += cost;
          const uniqueProspects = deduplicateProspects(accumulatedProspects, prospects as WaterfallProspect[]);
          accumulatedProspects.push(...uniqueProspects);
          providerChain.push({ provider: 'perplexity', fetched: fetchedCount, unique: uniqueProspects.length, cost });
          
          if (uniqueProspects.length > 0) {
            usedProviders.push('perplexity');
          }

          console.log(`   Perplexity returned ${fetchedCount} prospects (${uniqueProspects.length} unique added)`);
          console.log(`   Total accumulated: ${accumulatedProspects.length}/${limit}`);

          if (accumulatedProspects.length >= limit) {
            await this.updateSearchRecord(searchRecord.id, 'perplexity', accumulatedProspects.length, totalCost);
            return buildResult();
          }
        } catch (err) {
          console.log(`   ⚠️ Perplexity error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } else if (!perplexityService.isConfigured()) {
        console.log('   ⚠️ Perplexity not configured, skipping...');
      }

      if (apolloService.isConfigured() && getRemainingNeeded() > 0) {
        console.log('\n📡 Step 2: Trying Apollo API...');
        try {
          const requestLimit = Math.min(getRemainingNeeded() + 10, 100);
          const apolloProspects = await this.searchApollo(
            { ...criteria, limit: requestLimit },
            organizationId
          );
          const fetchedCount = apolloProspects.length;
          const apolloCost = fetchedCount * 0.10;
          totalFetched += fetchedCount;
          totalCost += apolloCost;
          const uniqueProspects = deduplicateProspects(accumulatedProspects, apolloProspects);
          accumulatedProspects.push(...uniqueProspects);
          providerChain.push({ provider: 'apollo', fetched: fetchedCount, unique: uniqueProspects.length, cost: apolloCost });

          if (uniqueProspects.length > 0) {
            usedProviders.push('apollo');
          }

          console.log(`   Apollo returned ${fetchedCount} prospects (${uniqueProspects.length} unique added)`);
          console.log(`   Total accumulated: ${accumulatedProspects.length}/${limit}`);

          if (accumulatedProspects.length >= limit) {
            await this.updateSearchRecord(searchRecord.id, 'apollo', accumulatedProspects.length, totalCost);
            return buildResult();
          }
        } catch (err) {
          console.log(`   ⚠️ Apollo error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } else if (!apolloService.isConfigured()) {
        console.log('   ⚠️ Apollo not configured, skipping...');
      }

      if (lushaService.isConfigured() && getRemainingNeeded() > 0) {
        console.log('\n📡 Step 3: Trying Lusha API...');
        try {
          const requestLimit = Math.min(getRemainingNeeded() + 5, 50);
          const { prospects, cost } = await lushaService.searchProspects(
            { ...criteria, limit: requestLimit },
            organizationId
          );
          const fetchedCount = prospects.length;
          totalFetched += fetchedCount;
          totalCost += cost;
          const uniqueProspects = deduplicateProspects(accumulatedProspects, prospects as WaterfallProspect[]);
          accumulatedProspects.push(...uniqueProspects);
          providerChain.push({ provider: 'lusha', fetched: fetchedCount, unique: uniqueProspects.length, cost });

          if (uniqueProspects.length > 0) {
            usedProviders.push('lusha');
          }

          console.log(`   Lusha returned ${fetchedCount} prospects (${uniqueProspects.length} unique added)`);
          console.log(`   Total accumulated: ${accumulatedProspects.length}/${limit}`);

          if (accumulatedProspects.length >= limit) {
            await this.updateSearchRecord(searchRecord.id, 'lusha', accumulatedProspects.length, totalCost);
            return buildResult();
          }
        } catch (err) {
          console.log(`   ⚠️ Lusha error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      } else if (!lushaService.isConfigured()) {
        console.log('   ⚠️ Lusha not configured, skipping...');
      }

      if (getRemainingNeeded() > 0) {
        const remaining = getRemainingNeeded();
        console.log(`\n📡 Step 4: Using OpenRouter AI to generate ${remaining} more prospects...`);
        try {
          const { prospects: aiProspects, cost: aiCost } = await this.generateWithOpenRouter(
            { ...criteria, limit: remaining },
            organizationId
          );
          const fetchedCount = aiProspects.length;
          totalFetched += fetchedCount;
          totalCost += aiCost;
          const uniqueProspects = deduplicateProspects(accumulatedProspects, aiProspects);
          accumulatedProspects.push(...uniqueProspects);
          providerChain.push({ provider: 'openrouter', fetched: fetchedCount, unique: uniqueProspects.length, cost: aiCost });

          if (uniqueProspects.length > 0) {
            usedProviders.push('openrouter');
          }

          console.log(`   OpenRouter generated ${fetchedCount} prospects (${uniqueProspects.length} unique added)`);
        } catch (err) {
          console.log(`   ⚠️ OpenRouter error: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      console.log(`\n✅ Waterfall Search Complete: ${accumulatedProspects.length} unique prospects from ${usedProviders.length} providers`);
      console.log(`   Total fetched: ${totalFetched}, Total cost: $${totalCost.toFixed(2)}`);
      console.log(`   Providers used: ${usedProviders.join(' → ') || 'none'}`);

      const primaryProvider = usedProviders.length > 0 ? usedProviders[0] : 'openrouter';
      await this.updateSearchRecord(searchRecord.id, primaryProvider, accumulatedProspects.length, totalCost);

      return buildResult();

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
        apolloFilters.organization_industry_tag_ids = this.mapIndustryToApollo(criteria.industry);
      }
      if (criteria.companySize) {
        apolloFilters.organization_num_employees_ranges = [this.mapCompanySizeToApollo(criteria.companySize)];
      }
      if (criteria.location) {
        apolloFilters.person_locations = [this.normalizeLocation(criteria.location)];
      }
      if (criteria.locations && criteria.locations.length > 0) {
        apolloFilters.person_locations = criteria.locations.map(loc => this.normalizeLocation(loc));
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
    const inputCost = (usage.prompt_tokens / 1000000) * 15;
    const outputCost = (usage.completion_tokens / 1000000) * 75;
    return inputCost + outputCost;
  }

  private mapCompanySizeToApollo(size: string): string {
    const sizeMap: Record<string, string> = {
      '1-10': '1,10',
      '11-50': '11,50',
      '51-200': '51,200',
      '201-500': '201,500',
      '501-1000': '501,1000',
      '1001-5000': '1001,5000',
      '5000+': '5001,10000',
      '5001+': '10001,',
      'small': '1,50',
      'medium': '51,500',
      'large': '501,5000',
      'enterprise': '5001,10000'
    };
    return sizeMap[size.toLowerCase()] || size;
  }

  private mapIndustryToApollo(industry: string): string[] {
    const industryMap: Record<string, string[]> = {
      'technology': ['5567cd4773696439b10b0000'],
      'software': ['5567cd4773696439b10b0000'],
      'tech': ['5567cd4773696439b10b0000'],
      'saas': ['5567cd4773696439b10b0000'],
      'fintech': ['5567cd4773696439b10b0000', '5567cd4773696439b12b0000'],
      'healthcare': ['5567cd4773696439b11b0000'],
      'health': ['5567cd4773696439b11b0000'],
      'medical': ['5567cd4773696439b11b0000'],
      'finance': ['5567cd4773696439b12b0000'],
      'financial services': ['5567cd4773696439b12b0000'],
      'banking': ['5567cd4773696439b12b0000'],
      'retail': ['5567cd4773696439b13b0000'],
      'e-commerce': ['5567cd4773696439b13b0000'],
      'ecommerce': ['5567cd4773696439b13b0000'],
      'manufacturing': ['5567cd4773696439b14b0000'],
      'industrial': ['5567cd4773696439b14b0000'],
      'consumer goods': ['5567cd4773696439b15b0000'],
      'cpg': ['5567cd4773696439b15b0000'],
      'media': ['5567cd4773696439b16b0000'],
      'entertainment': ['5567cd4773696439b16b0000'],
      'telecommunications': ['5567cd4773696439b17b0000'],
      'telecom': ['5567cd4773696439b17b0000'],
      'real estate': ['5567cd4773696439b18b0000'],
      'construction': ['5567cd4773696439b19b0000'],
      'education': ['5567cd4773696439b1a0000'],
      'edtech': ['5567cd4773696439b1a0000'],
      'energy': ['5567cd4773696439b1b0000'],
      'utilities': ['5567cd4773696439b1b0000'],
      'transportation': ['5567cd4773696439b1c0000'],
      'logistics': ['5567cd4773696439b1c0000'],
      'hospitality': ['5567cd4773696439b1d0000'],
      'travel': ['5567cd4773696439b1d0000'],
      'food & beverage': ['5567cd4773696439b1e0000'],
      'food': ['5567cd4773696439b1e0000'],
      'automotive': ['5567cd4773696439b1f0000'],
      'aerospace': ['5567cd4773696439b200000'],
      'defense': ['5567cd4773696439b200000'],
      'government': ['5567cd4773696439b210000'],
      'non-profit': ['5567cd4773696439b220000'],
      'nonprofit': ['5567cd4773696439b220000'],
      'legal': ['5567cd4773696439b230000'],
      'professional services': ['5567cd4773696439b240000'],
      'consulting': ['5567cd4773696439b240000'],
      'insurance': ['5567cd4773696439b250000'],
      'pharma': ['5567cd4773696439b260000'],
      'pharmaceutical': ['5567cd4773696439b260000'],
      'biotechnology': ['5567cd4773696439b270000'],
      'biotech': ['5567cd4773696439b270000'],
      'agriculture': ['5567cd4773696439b280000'],
      'agtech': ['5567cd4773696439b280000'],
      'marketing': ['5567cd4773696439b290000'],
      'advertising': ['5567cd4773696439b290000'],
      'hr': ['5567cd4773696439b2a0000'],
      'human resources': ['5567cd4773696439b2a0000'],
      'staffing': ['5567cd4773696439b2a0000'],
      'security': ['5567cd4773696439b2b0000'],
      'cybersecurity': ['5567cd4773696439b2b0000'],
      'ai': ['5567cd4773696439b10b0000'],
      'artificial intelligence': ['5567cd4773696439b10b0000'],
      'machine learning': ['5567cd4773696439b10b0000']
    };
    const key = industry.toLowerCase();
    return industryMap[key] || [industry];
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

  private normalizeLocation(location: string): string {
    const locationAliases: Record<string, string> = {
      'usa': 'United States',
      'us': 'United States',
      'u.s.': 'United States',
      'u.s.a.': 'United States',
      'america': 'United States',
      'uk': 'United Kingdom',
      'u.k.': 'United Kingdom',
      'britain': 'United Kingdom',
      'great britain': 'United Kingdom',
      'england': 'United Kingdom',
      'uae': 'United Arab Emirates',
      'korea': 'South Korea',
      'holland': 'Netherlands',
      'the netherlands': 'Netherlands',
      'nz': 'New Zealand',
      'sg': 'Singapore',
      'hk': 'Hong Kong',
      'jp': 'Japan',
      'de': 'Germany',
      'fr': 'France',
      'es': 'Spain',
      'it': 'Italy',
      'ca': 'Canada',
      'au': 'Australia',
      'in': 'India',
      'cn': 'China',
      'br': 'Brazil',
      'mx': 'Mexico'
    };
    const normalized = location.trim().toLowerCase();
    return locationAliases[normalized] || location.trim();
  }
}

export const waterfallSearchService = new WaterfallSearchService();
