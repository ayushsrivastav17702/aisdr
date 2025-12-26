import { db } from "../db";
import { apiUsage, type WaterfallSearchCriteria } from "@shared/schema";

interface PerplexityProspect {
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
  source: 'perplexity';
}

interface PerplexityUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

class PerplexityService {
  private apiKey: string;
  private baseUrl = 'https://api.perplexity.ai';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async searchProspects(
    criteria: WaterfallSearchCriteria,
    organizationId?: string
  ): Promise<{ prospects: PerplexityProspect[]; cost: number }> {
    if (!this.isConfigured()) {
      console.log('⚠️ Perplexity API not configured, skipping...');
      return { prospects: [], cost: 0 };
    }

    try {
      const prompt = this.buildSearchPrompt(criteria);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-sonar-large-128k-online',
          messages: [
            {
              role: 'system',
              content: `You are a B2B prospect research assistant. Your task is to find real business contacts that match the given criteria.
Return ONLY a valid JSON array of prospects. Each prospect must have these fields:
- fullName (required): Full name of the person
- firstName: First name
- lastName: Last name  
- email: Business email if findable
- jobTitle (required): Current job title
- companyName (required): Company they work at
- linkedinUrl: LinkedIn profile URL if findable
- phone: Phone number if available
- location: City/Region
- companySize: Approximate company size (e.g., "50-200 employees")
- industry: Company industry
- website: Company website

Only return prospects you can verify exist. Do not make up fake contacts. Return an empty array if you cannot find real prospects.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2,
          max_tokens: 4000,
          search_recency_filter: 'month',
          return_related_questions: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Perplexity API error:', response.status, errorText);
        await this.logApiUsage(organizationId, criteria, null, 0, false);
        return { prospects: [], cost: 0 };
      }

      const data = await response.json();
      const cost = this.calculateCost(data.usage);
      
      await this.logApiUsage(organizationId, criteria, data, cost, true);

      const prospects = this.parseResponse(data.choices?.[0]?.message?.content);
      
      console.log(`✅ Perplexity found ${prospects.length} prospects (cost: $${cost.toFixed(4)})`);
      
      return { prospects, cost };

    } catch (error) {
      console.error('Perplexity search error:', error);
      await this.logApiUsage(organizationId, criteria, null, 0, false);
      return { prospects: [], cost: 0 };
    }
  }

  private buildSearchPrompt(criteria: WaterfallSearchCriteria): string {
    const parts: string[] = [];
    
    parts.push(`Find ${criteria.limit || 50} B2B prospects matching this profile:`);
    
    if (criteria.industry) {
      parts.push(`- Industry: ${criteria.industry}`);
    }
    if (criteria.companySize) {
      parts.push(`- Company Size: ${criteria.companySize}`);
    }
    if (criteria.jobTitles && criteria.jobTitles.length > 0) {
      parts.push(`- Job Titles: ${criteria.jobTitles.join(', ')}`);
    }
    if (criteria.seniority && criteria.seniority.length > 0) {
      parts.push(`- Seniority Levels: ${criteria.seniority.join(', ')}`);
    }
    if (criteria.departments && criteria.departments.length > 0) {
      parts.push(`- Departments: ${criteria.departments.join(', ')}`);
    }
    if (criteria.location) {
      parts.push(`- Location: ${criteria.location}`);
    }
    if (criteria.technologies && criteria.technologies.length > 0) {
      parts.push(`- Technologies Used: ${criteria.technologies.join(', ')}`);
    }
    if (criteria.fundingStage) {
      parts.push(`- Funding Stage: ${criteria.fundingStage}`);
    }
    if (criteria.keywords) {
      parts.push(`- Keywords: ${criteria.keywords}`);
    }

    parts.push('\nReturn the results as a JSON array. Only include real, verifiable contacts.');
    
    return parts.join('\n');
  }

  private parseResponse(content: string): PerplexityProspect[] {
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
          firstName: p.firstName || this.extractFirstName(p.fullName),
          lastName: p.lastName || this.extractLastName(p.fullName),
          email: p.email,
          jobTitle: p.jobTitle,
          companyName: p.companyName,
          linkedinUrl: p.linkedinUrl,
          phone: p.phone,
          location: p.location,
          companySize: p.companySize,
          industry: p.industry,
          website: p.website,
          source: 'perplexity' as const
        }));

    } catch (error) {
      console.error('Failed to parse Perplexity response:', error);
      return [];
    }
  }

  private extractFirstName(fullName: string): string {
    return fullName.split(' ')[0] || '';
  }

  private extractLastName(fullName: string): string {
    const parts = fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }

  private calculateCost(usage?: PerplexityUsage): number {
    if (!usage) return 0;
    const inputCost = (usage.prompt_tokens / 1000) * 0.001;
    const outputCost = (usage.completion_tokens / 1000) * 0.001;
    return inputCost + outputCost;
  }

  private async logApiUsage(
    organizationId: string | undefined,
    requestData: any,
    responseData: any,
    cost: number,
    success: boolean
  ): Promise<void> {
    try {
      await db.insert(apiUsage).values({
        organizationId: organizationId || null,
        provider: 'perplexity',
        endpoint: '/chat/completions',
        requestData,
        responseData: responseData ? { model: responseData.model, usage: responseData.usage } : null,
        tokensUsed: responseData?.usage?.total_tokens || 0,
        cost,
        success
      });
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
  }
}

export const perplexityService = new PerplexityService();
