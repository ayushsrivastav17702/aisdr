import { db } from "../db";
import { apiUsage } from "@shared/schema";
import { apolloService } from "./apollo.service";

export interface ResolvedCompany {
  organizationId: string;
  name: string;
  domain?: string;
  industry?: string;
  employees?: number;
  source: 'perplexity' | 'apollo' | 'lusha' | 'openrouter';
}

export interface CompanyResolutionResult {
  success: boolean;
  company?: ResolvedCompany;
  error?: string;
  providersAttempted: string[];
}

class CompanyResolutionService {
  private perplexityApiKey: string;
  private lushaApiKey: string;
  private openRouterApiKey: string;

  constructor() {
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY || '';
    this.lushaApiKey = process.env.LUSHA_API_KEY || process.env.Lusha_api_keys || '';
    this.openRouterApiKey = process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER || '';
  }

  async resolveCompany(query: string, organizationId?: string): Promise<CompanyResolutionResult> {
    const providersAttempted: string[] = [];
    const isDomain = query.includes('.') && !query.includes(' ');
    
    console.log(`🏢 Waterfall Company Resolution: "${query}" (isDomain: ${isDomain})`);

    // Step 1: Try Perplexity AI first (best for company research)
    if (this.perplexityApiKey) {
      console.log('   📡 Step 1: Trying Perplexity AI...');
      providersAttempted.push('perplexity');
      try {
        const result = await this.resolveWithPerplexity(query, isDomain, organizationId);
        if (result) {
          console.log(`   ✅ Perplexity found: ${result.name} (${result.organizationId})`);
          return { success: true, company: result, providersAttempted };
        }
        console.log('   ⚠️ Perplexity: No match found');
      } catch (err) {
        console.log(`   ⚠️ Perplexity error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    } else {
      console.log('   ⚠️ Perplexity not configured, skipping...');
    }

    // Step 2: Try Apollo organization search
    if (apolloService.isConfigured()) {
      console.log('   📡 Step 2: Trying Apollo API...');
      providersAttempted.push('apollo');
      try {
        const result = await apolloService.searchOrganization(query);
        if (result) {
          console.log(`   ✅ Apollo found: ${result.name} (${result.organizationId})`);
          return {
            success: true,
            company: { ...result, source: 'apollo' as const },
            providersAttempted
          };
        }
        console.log('   ⚠️ Apollo: No match found');
      } catch (err) {
        console.log(`   ⚠️ Apollo error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    } else {
      console.log('   ⚠️ Apollo not configured, skipping...');
    }

    // Step 3: Try Lusha company search
    if (this.lushaApiKey) {
      console.log('   📡 Step 3: Trying Lusha API...');
      providersAttempted.push('lusha');
      try {
        const result = await this.resolveWithLusha(query, isDomain, organizationId);
        if (result) {
          console.log(`   ✅ Lusha found: ${result.name} (${result.organizationId})`);
          return { success: true, company: result, providersAttempted };
        }
        console.log('   ⚠️ Lusha: No match found');
      } catch (err) {
        console.log(`   ⚠️ Lusha error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    } else {
      console.log('   ⚠️ Lusha not configured, skipping...');
    }

    // Step 4: Try OpenRouter AI as final fallback
    if (this.openRouterApiKey) {
      console.log('   📡 Step 4: Trying OpenRouter AI...');
      providersAttempted.push('openrouter');
      try {
        const result = await this.resolveWithOpenRouter(query, isDomain, organizationId);
        if (result) {
          console.log(`   ✅ OpenRouter found: ${result.name} (${result.organizationId})`);
          return { success: true, company: result, providersAttempted };
        }
        console.log('   ⚠️ OpenRouter: No match found');
      } catch (err) {
        console.log(`   ⚠️ OpenRouter error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    } else {
      console.log('   ⚠️ OpenRouter not configured, skipping...');
    }

    console.log(`   ❌ All providers failed for: "${query}"`);
    return {
      success: false,
      error: `Could not find company "${query}" in any provider`,
      providersAttempted
    };
  }

  private async resolveWithPerplexity(query: string, isDomain: boolean, organizationId?: string): Promise<ResolvedCompany | null> {
    const prompt = isDomain
      ? `What company owns the domain "${query}"? Return ONLY a JSON object with: {"name": "Company Name", "domain": "domain.com", "industry": "Industry", "employees": estimated_employee_count}. If you cannot find the company, return {"error": "not_found"}.`
      : `Find the company named "${query}". Return ONLY a JSON object with: {"name": "Official Company Name", "domain": "company-website.com", "industry": "Industry", "employees": estimated_employee_count}. If you cannot find the company, return {"error": "not_found"}.`;

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.perplexityApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a company information lookup assistant. Return only valid JSON, no markdown or explanation.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   Perplexity API error: ${response.status} - ${errorText.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    await this.logApiUsage('perplexity', 'company_resolution', query, data.usage, organizationId);

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error) return null;
      
      if (!parsed.name) return null;

      return {
        organizationId: `perplexity_${this.generateId(parsed.name)}`,
        name: parsed.name,
        domain: parsed.domain,
        industry: parsed.industry,
        employees: parsed.employees,
        source: 'perplexity'
      };
    } catch {
      return null;
    }
  }

  private async resolveWithLusha(query: string, isDomain: boolean, organizationId?: string): Promise<ResolvedCompany | null> {
    const endpoint = isDomain ? 'company-by-domain' : 'company-search';
    const body = isDomain
      ? { domain: query.replace(/^https?:\/\//, '').replace(/^www\./, '') }
      : { companyName: query, pageSize: 1 };

    const response = await fetch(`https://api.lusha.com/prospecting/${endpoint}`, {
      method: 'POST',
      headers: {
        'api_key': this.lushaApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   Lusha API error: ${response.status} - ${errorText.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    await this.logApiUsage('lusha', 'company_resolution', query, null, organizationId);

    const company = isDomain ? data : data.data?.[0];
    if (!company) return null;

    return {
      organizationId: company.id || `lusha_${this.generateId(company.name || query)}`,
      name: company.name || company.companyName || query,
      domain: company.domain || company.website,
      industry: company.industry,
      employees: company.employeesCount || company.numberOfEmployees,
      source: 'lusha'
    };
  }

  private async resolveWithOpenRouter(query: string, isDomain: boolean, organizationId?: string): Promise<ResolvedCompany | null> {
    const prompt = isDomain
      ? `What company owns "${query}"? Return JSON: {"name": "Company Name", "domain": "domain.com", "industry": "Industry", "employees": number}. Return {"error": "not_found"} if unknown.`
      : `Find company "${query}". Return JSON: {"name": "Official Name", "domain": "website.com", "industry": "Industry", "employees": number}. Return {"error": "not_found"} if unknown.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
        'X-Title': 'AiSDR Company Resolution'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a company lookup assistant. Return only valid JSON.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   OpenRouter API error: ${response.status} - ${errorText.substring(0, 100)}`);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    await this.logApiUsage('openrouter', 'company_resolution', query, data.usage, organizationId);

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error) return null;
      
      if (!parsed.name) return null;

      return {
        organizationId: `openrouter_${this.generateId(parsed.name)}`,
        name: parsed.name,
        domain: parsed.domain,
        industry: parsed.industry,
        employees: parsed.employees,
        source: 'openrouter'
      };
    } catch {
      return null;
    }
  }

  private generateId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 30);
  }

  private async logApiUsage(
    provider: string,
    endpoint: string,
    query: string,
    usage: any,
    organizationId?: string
  ): Promise<void> {
    try {
      const tokensUsed = usage?.total_tokens || 0;
      const cost = this.calculateCost(provider, tokensUsed);
      
      await db.insert(apiUsage).values({
        provider,
        endpoint,
        tokensUsed: tokensUsed || 1,  // Use 1 for flat-cost providers
        cost,
        success: true,
        organizationId,
        requestData: { query },
        responseData: usage ? { usage } : null
      });
    } catch (err) {
      console.error('Failed to log API usage:', err);
    }
  }

  private calculateCost(provider: string, tokens: number): number {
    // Flat-cost providers (per API call, not per token)
    const flatCostProviders: Record<string, number> = {
      lusha: 0.05,
      apollo: 0.01
    };
    
    if (flatCostProviders[provider]) {
      return flatCostProviders[provider];
    }
    
    // Token-based providers
    const tokenRates: Record<string, number> = {
      perplexity: 0.002 / 1000,
      openrouter: 0.00015 / 1000
    };
    return tokens * (tokenRates[provider] || 0);
  }
}

export const companyResolutionService = new CompanyResolutionService();
export default companyResolutionService;
