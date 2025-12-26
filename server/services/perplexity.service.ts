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
  private baseUrl = 'https://api.perplexity.ai';

  private getApiKey(): string {
    return process.env.PERPLEXITY_API_KEY || '';
  }

  isConfigured(): boolean {
    const configured = !!this.getApiKey();
    console.log(`🔑 Perplexity isConfigured check: ${configured} (key length: ${this.getApiKey().length})`);
    return configured;
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
          'Authorization': `Bearer ${this.getApiKey()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            {
              role: 'system',
              content: `You are a B2B prospect research assistant specializing in finding real business contacts with verified contact information.

Your PRIMARY goals are to find prospects WITH:
1. EMAIL ADDRESSES (most important)
2. PHONE/MOBILE NUMBERS (very important)

Search LinkedIn, company websites, press releases, business directories, contact pages, team pages, and other public sources.

Return ONLY a valid JSON array of prospects. Each prospect must have these fields:
- fullName (required): Full name of the person
- firstName: First name
- lastName: Last name  
- email (CRITICAL): Business email address - search for it on company websites, LinkedIn, press releases, business cards, conference speakers lists, or derive from company email patterns
- jobTitle (required): Current job title
- companyName (required): Company they work at
- linkedinUrl: LinkedIn profile URL - search for their profile
- phone (IMPORTANT): Direct phone or mobile number - search contact pages, LinkedIn profiles, business directories, press releases
- location: City/Region/Country
- companySize: Approximate company size (e.g., "50-200 employees")
- industry: Company industry
- website: Company website domain

EMAIL FINDING STRATEGIES:
1. Email found directly on their profile, company page, or team page
2. Email pattern from the company (e.g., if you see john.doe@puma.com, use that pattern)
3. Common patterns: firstname.lastname@company.com, firstname@company.com, f.lastname@company.com

PHONE FINDING STRATEGIES:
1. Direct dial listed on company website contact/team pages
2. Phone number on LinkedIn profile or business directory listings
3. Company switchboard numbers with extensions
4. Mobile numbers from press releases, conference speaker bios

Only return real, verifiable contacts. Do not fabricate data. Prioritize contacts with both email AND phone when possible.`
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

      const rawContent = data.choices?.[0]?.message?.content || '';
      console.log('📝 Perplexity raw response length:', rawContent.length);
      
      const prospects = this.parseResponse(rawContent);
      
      const withEmails = prospects.filter(p => p.email).length;
      const withPhones = prospects.filter(p => p.phone).length;
      console.log(`✅ Perplexity found ${prospects.length} prospects (${withEmails} with emails, ${withPhones} with phones, cost: $${cost.toFixed(4)})`);
      
      return { prospects, cost };

    } catch (error) {
      console.error('Perplexity search error:', error);
      await this.logApiUsage(organizationId, criteria, null, 0, false);
      return { prospects: [], cost: 0 };
    }
  }

  private buildSearchPrompt(criteria: WaterfallSearchCriteria): string {
    const parts: string[] = [];
    
    // Build a natural language query for better Perplexity results
    const queryParts: string[] = [];
    
    // Add company/industry first (most important for specific searches)
    if (criteria.industry) {
      queryParts.push(criteria.industry);
    }
    
    // Add location
    if (criteria.location) {
      queryParts.push(criteria.location);
    } else if (criteria.locations && criteria.locations.length > 0) {
      queryParts.push(criteria.locations.join(' or '));
    }
    
    // Add job titles
    if (criteria.jobTitles && criteria.jobTitles.length > 0) {
      queryParts.push(criteria.jobTitles.join(', '));
    }
    
    // Add departments if no job titles
    if ((!criteria.jobTitles || criteria.jobTitles.length === 0) && criteria.departments && criteria.departments.length > 0) {
      queryParts.push(criteria.departments.join(', '));
    }
    
    // Add keywords
    if (criteria.keywords) {
      queryParts.push(criteria.keywords);
    }
    
    const naturalQuery = queryParts.join(' ').trim() || 'business professionals';
    
    parts.push(`Search for "${naturalQuery}" and find ${criteria.limit || 20} real people with their contact information.`);
    parts.push('');
    parts.push('SEARCH REQUIREMENTS:');
    
    if (criteria.industry) {
      parts.push(`- COMPANY: ${criteria.industry} (search for employees at this specific company)`);
    }
    if (criteria.location || criteria.locations) {
      const loc = criteria.location || criteria.locations?.join(', ');
      parts.push(`- LOCATION: MUST be in ${loc} - do NOT include people from other countries/regions`);
    }
    if (criteria.jobTitles && criteria.jobTitles.length > 0) {
      parts.push(`- JOB TITLES: ${criteria.jobTitles.join(', ')} (or similar roles like merchandiser, buyer, category manager)`);
    }
    if (criteria.seniority && criteria.seniority.length > 0) {
      parts.push(`- SENIORITY: ${criteria.seniority.join(', ')}`);
    }
    if (criteria.companySize) {
      parts.push(`- Company Size: ${criteria.companySize}`);
    }

    parts.push('');
    parts.push('FOR EACH PERSON, YOU MUST FIND:');
    parts.push('1. VERIFIED EMAIL ADDRESS - Use the company email pattern (e.g., firstname.lastname@adidas.com)');
    parts.push('2. PHONE NUMBER if available - From LinkedIn, company directory, or press releases');
    parts.push('3. LinkedIn URL - Their actual LinkedIn profile');
    parts.push('4. Current job title and company');
    parts.push('5. Location (city, state)');
    parts.push('');
    parts.push('EMAIL PATTERN STRATEGY:');
    parts.push('- If company is Adidas: firstname.lastname@adidas.com');
    parts.push('- If company is Nike: firstname.lastname@nike.com');
    parts.push('- If company is Puma: firstname.lastname@puma.com');
    parts.push('- Look for other employees email patterns on the company website and apply the same pattern');
    parts.push('');
    parts.push('Return ONLY a valid JSON array with NO markdown formatting. Each prospect must have: fullName, firstName, lastName, email, jobTitle, companyName, linkedinUrl, phone, location');
    
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
    const inputCost = (usage.prompt_tokens / 1000000) * 5;
    const outputCost = (usage.completion_tokens / 1000000) * 15;
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
