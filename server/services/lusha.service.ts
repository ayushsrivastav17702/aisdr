import { db } from "../db";
import { apiUsage, type WaterfallSearchCriteria } from "@shared/schema";

interface LushaEnrichmentParams {
  fullName?: string;
  company?: string;
  linkedinUrl?: string;
}

interface LushaEmailData {
  email: string;
  status: string;
  type?: string;
}

interface LushaPhoneData {
  number: string;
  type?: string;
}

interface LushaEnrichmentResponse {
  name?: string;
  firstName?: string;
  lastName?: string;
  emails?: LushaEmailData[];
  phoneNumbers?: LushaPhoneData[];
  company?: string;
  position?: string;
  linkedinUrl?: string;
}

export interface LushaProspect {
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
  source: 'lusha';
}

class LushaService {
  private apiKey: string;
  private baseUrl = 'https://api.lusha.com';

  constructor() {
    this.apiKey = process.env.LUSHA_API_KEY || process.env.Lusha_api_keys || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async searchProspects(
    criteria: WaterfallSearchCriteria,
    organizationId?: string
  ): Promise<{ prospects: LushaProspect[]; cost: number }> {
    if (!this.isConfigured()) {
      console.log('⚠️ Lusha API not configured, skipping...');
      return { prospects: [], cost: 0 };
    }

    try {
      const response = await fetch(`${this.baseUrl}/prospecting/companies`, {
        method: 'POST',
        headers: {
          'api_key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filters: {
            industries: criteria.industry ? [criteria.industry] : undefined,
            companySizes: criteria.companySize ? [this.mapCompanySize(criteria.companySize)] : undefined,
            locations: criteria.location ? [criteria.location] : undefined,
            technologies: criteria.technologies,
          },
          page: 1,
          pageSize: Math.min(criteria.limit || 50, 100)
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Lusha company search error:', response.status, errorText);
        await this.logApiUsage(organizationId, '/prospecting/companies', criteria, null, 0, false);
        return { prospects: [], cost: 0 };
      }

      const data = await response.json();
      const companies = data.data || [];
      
      if (companies.length === 0) {
        return { prospects: [], cost: 0 };
      }

      const prospects: LushaProspect[] = [];
      let totalCost = 0;
      const limit = criteria.limit || 50;

      for (const company of companies) {
        if (prospects.length >= limit) break;

        const contactsResponse = await fetch(`${this.baseUrl}/prospecting/contacts`, {
          method: 'POST',
          headers: {
            'api_key': this.apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filters: {
              companyId: company.id,
              jobTitles: criteria.jobTitles?.length ? criteria.jobTitles : undefined
            },
            page: 1,
            pageSize: 25
          })
        });

        if (contactsResponse.ok) {
          const contactsData = await contactsResponse.json();
          const contacts = (contactsData.data || []).map((c: any) => this.mapContact(c, company));
          prospects.push(...contacts);
          totalCost += contacts.length * 0.15;
        }
      }

      await this.logApiUsage(organizationId, '/prospecting', criteria, { count: prospects.length }, totalCost, true);
      console.log(`✅ Lusha found ${prospects.length} prospects (cost: $${totalCost.toFixed(4)})`);
      
      return { 
        prospects: prospects.slice(0, limit), 
        cost: totalCost 
      };

    } catch (error) {
      console.error('Lusha search error:', error);
      await this.logApiUsage(organizationId, '/prospecting', criteria, null, 0, false);
      return { prospects: [], cost: 0 };
    }
  }

  private mapContact(raw: any, company: any): LushaProspect {
    return {
      fullName: raw.fullName || `${raw.firstName || ''} ${raw.lastName || ''}`.trim(),
      firstName: raw.firstName,
      lastName: raw.lastName,
      email: raw.email,
      jobTitle: raw.title || raw.jobTitle || '',
      companyName: company.name,
      linkedinUrl: raw.linkedinUrl,
      phone: raw.phone,
      location: raw.location || company.location,
      companySize: company.size,
      industry: company.industry,
      website: company.domain ? `https://${company.domain}` : undefined,
      source: 'lusha' as const
    };
  }

  private mapCompanySize(size: string): string {
    const sizeMap: Record<string, string> = {
      '1-10': 'SMALL',
      '11-50': 'SMALL_MEDIUM',
      '51-200': 'MEDIUM',
      '201-500': 'MEDIUM_LARGE',
      '501-1000': 'LARGE',
      '1001-5000': 'VERY_LARGE',
      '5000+': 'ENTERPRISE'
    };
    return sizeMap[size] || size;
  }

  private async logApiUsage(
    organizationId: string | undefined,
    endpoint: string,
    requestData: any,
    responseData: any,
    cost: number,
    success: boolean
  ): Promise<void> {
    try {
      await db.insert(apiUsage).values({
        organizationId: organizationId || null,
        provider: 'lusha',
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

  async enrichPerson(params: LushaEnrichmentParams): Promise<LushaEnrichmentResponse | null> {
    if (!this.apiKey) {
      console.warn('Lusha API key not configured. Set LUSHA_API_KEY to enable email enrichment.');
      return null;
    }

    try {
      const queryParams = new URLSearchParams();
      
      if (params.fullName) {
        queryParams.append('name', params.fullName);
      }
      if (params.company) {
        queryParams.append('company', params.company);
      }
      if (params.linkedinUrl) {
        queryParams.append('linkedinUrl', params.linkedinUrl);
      }

      const url = `${this.baseUrl}?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Lusha API error: ${response.status} ${response.statusText}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Lusha enrichment error:', error);
      return null;
    }
  }

  // Extract best email from Lusha response
  getBestEmail(lushaData: LushaEnrichmentResponse | null): string | null {
    if (!lushaData?.emails || lushaData.emails.length === 0) {
      return null;
    }

    // Prioritize verified emails
    const verified = lushaData.emails.find(e => e.status === 'verified' || e.status === 'valid');
    if (verified) {
      return verified.email;
    }

    // Fall back to first available email
    return lushaData.emails[0]?.email || null;
  }

  // Extract best phone from Lusha response
  getBestPhone(lushaData: LushaEnrichmentResponse | null): string | null {
    if (!lushaData?.phoneNumbers || lushaData.phoneNumbers.length === 0) {
      return null;
    }

    // Prioritize mobile numbers
    const mobile = lushaData.phoneNumbers.find(p => p.type?.toLowerCase() === 'mobile');
    if (mobile) {
      return mobile.number;
    }

    // Fall back to first available phone
    return lushaData.phoneNumbers[0]?.number || null;
  }

  // Check if an email is locked by Apollo
  isEmailLocked(email: string): boolean {
    return !email || email.includes('email_not_unlocked');
  }
}

export const lushaService = new LushaService();
