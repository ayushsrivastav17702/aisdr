interface ApolloSearchParams {
  person_titles?: string[];
  person_seniorities?: string[];
  person_departments?: string[];
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  person_locations?: string[];
  q_organization_name?: string;
  q_keywords?: string;
  revenue_range?: {
    min?: number;
    max?: number;
  };
  organization_latest_funding_stage_cd?: string[];
  currently_using_any_of_technology_uids?: string[];
  page?: number;
  per_page?: number;
}

interface ApolloContact {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  title: string;
  seniority: string;
  departments: string[];
  linkedin_url: string;
  phone_numbers: Array<{ raw_number: string; sanitized_number: string }>;
  organization: {
    id: string;
    name: string;
    website_url: string;
    industry: string;
    num_employees: number;
    estimated_num_employees: number;
    primary_phone: { number: string };
    headquarters_location: {
      name: string;
      street_address: string;
      city: string;
      state: string;
      country: string;
    };
  };
  employment_history: Array<{
    _id: string;
    company_name: string;
    title: string;
    start_date: string;
    end_date: string;
  }>;
}

interface ApolloSearchResponse {
  contacts?: ApolloContact[];
  people?: ApolloContact[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

interface ApolloEnrichmentResponse {
  contact: ApolloContact;
}

class ApolloService {
  private apiKey: string;
  private baseUrl = 'https://api.apollo.io/v1';

  constructor() {
    this.apiKey = process.env.APOLLO_API_KEY || '';
  }

  async searchContacts(params: ApolloSearchParams): Promise<ApolloSearchResponse> {
    if (!this.apiKey) {
      throw new Error('Apollo API key not configured. Please set APOLLO_API_KEY environment variable.');
    }

    // Check rate limit
    const { rateLimiterService } = await import('./rate-limiter.service');
    const rateCheck = await rateLimiterService.checkRateLimit('apollo', 'search');
    if (!rateCheck.allowed) {
      const error: any = new Error(`Rate limit exceeded. Please try again after ${rateCheck.resetAt.toISOString()}`);
      error.status = 429;
      error.remaining = rateCheck.remaining;
      error.resetAt = rateCheck.resetAt;
      throw error;
    }

    const url = `${this.baseUrl}/mixed_people/search`;
    
    const requestBody = {
      ...params,
      per_page: params.per_page || 50,
      page: params.page || 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apollo API error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    
    // Track API usage
    await rateLimiterService.trackApiUsage('apollo', 1);
    
    return data;
  }

  async enrichContact(params: { 
    email?: string; 
    first_name?: string; 
    last_name?: string; 
    organization_name?: string;
    linkedin_url?: string;
  }): Promise<ApolloEnrichmentResponse> {
    // Check rate limit
    const { rateLimiterService } = await import('./rate-limiter.service');
    const rateCheck = await rateLimiterService.checkRateLimit('apollo', 'enrichment');
    if (!rateCheck.allowed) {
      const error: any = new Error(`Rate limit exceeded. Please try again after ${rateCheck.resetAt.toISOString()}`);
      error.status = 429;
      error.remaining = rateCheck.remaining;
      error.resetAt = rateCheck.resetAt;
      throw error;
    }

    const url = `${this.baseUrl}/people/match?reveal_personal_emails=true`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apollo enrichment error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    
    // Track API usage
    await rateLimiterService.trackApiUsage('apollo', 1);
    
    return data;
  }

  async bulkEnrichContacts(contacts: Array<{
    email?: string;
    first_name?: string;
    last_name?: string;
    organization_name?: string;
    linkedin_url?: string;
  }>): Promise<{
    matches: ApolloContact[];
    totalRequested: number;
    uniqueEnriched: number;
    missingRecords: number;
    creditsConsumed: number;
  }> {
    if (!this.apiKey) {
      throw new Error('Apollo API key not configured. Please set APOLLO_API_KEY environment variable.');
    }

    // Check rate limit
    const { rateLimiterService } = await import('./rate-limiter.service');
    const rateCheck = await rateLimiterService.checkRateLimit('apollo', 'bulk_enrichment');
    if (!rateCheck.allowed) {
      const error: any = new Error(`Rate limit exceeded. Please try again after ${rateCheck.resetAt.toISOString()}`);
      error.status = 429;
      error.remaining = rateCheck.remaining;
      error.resetAt = rateCheck.resetAt;
      throw error;
    }

    const url = `${this.baseUrl}/people/bulk_match?reveal_personal_emails=true`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({ details: contacts }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apollo bulk enrichment error: ${response.status} ${response.statusText}: ${errorText}`);
    }

    const data = await response.json();
    
    // Track API usage
    const creditsConsumed = data.credits_consumed || 0;
    await rateLimiterService.trackApiUsage('apollo', creditsConsumed);
    
    return {
      matches: data.matches || [],
      totalRequested: data.total_requested_enrichments || 0,
      uniqueEnriched: data.unique_enriched_records || 0,
      missingRecords: data.missing_records || 0,
      creditsConsumed,
    };
  }

  // Convert Apollo contact to our prospect format
  async convertApolloContactToProspect(contact: ApolloContact) {
    // Validate contact has minimum required fields
    if (!contact.id && !contact.email) {
      throw new Error(`Invalid Apollo contact: missing both ID and email`);
    }

    // Validate email if present
    const email = contact.email || '';
    if (email && (typeof email !== 'string' || email.length < 3 || !email.includes('@'))) {
      throw new Error(`Invalid Apollo contact: email format invalid (type: ${typeof email})`);
    }

    // Build full name with fallback logic
    const fullName = contact.name || 
                    (contact.first_name && contact.last_name ? `${contact.first_name} ${contact.last_name}` : '') ||
                    contact.first_name ||
                    contact.last_name ||
                    '';

    const phoneNumber = contact.phone_numbers?.[0]?.sanitized_number || 
                       contact.phone_numbers?.[0]?.raw_number || '';

    const prospect = {
      apolloId: contact.id || '',
      firstName: contact.first_name || '',
      lastName: contact.last_name || '',
      fullName,
      primaryEmail: email,
      jobTitle: contact.title || '',
      seniority: contact.seniority || '',
      department: contact.departments?.[0] || '',
      companyName: contact.organization?.name || '',
      companyDomain: this.extractDomainFromUrl(contact.organization?.website_url || ''),
      companySize: this.formatEmployeeCount(contact.organization?.num_employees || contact.organization?.estimated_num_employees || 0),
      companyIndustry: contact.organization?.industry || '',
      companyLocation: this.formatLocation(contact.organization?.headquarters_location),
      phoneNumber,
      linkedinUrl: contact.linkedin_url || '',
      enrichmentStatus: 'enriched' as const,
      enrichmentData: {
        apollo: contact,
        enrichedAt: new Date().toISOString(),
      },
      leadScore: 0
    };

    // Calculate lead score
    const { leadScoringService } = await import('./lead-scoring.service');
    const scoreBreakdown = leadScoringService.calculateLeadScore(prospect as any);
    prospect.leadScore = scoreBreakdown.total;

    return prospect;
  }

  private extractDomainFromUrl(url: string): string {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }

  private formatEmployeeCount(count: number): string {
    if (count <= 10) return '1-10';
    if (count <= 50) return '11-50';
    if (count <= 200) return '51-200';
    if (count <= 500) return '201-500';
    if (count <= 1000) return '501-1000';
    if (count <= 5000) return '1001-5000';
    if (count <= 10000) return '5001-10000';
    return '10000+';
  }

  private formatLocation(location: any): string {
    if (!location) return '';
    
    const parts = [
      location.city,
      location.state,
      location.country
    ].filter(Boolean);
    
    return parts.join(', ');
  }

  // Enrich with automatic Lusha fallback for locked emails
  async enrichWithAutoFallback(params: { 
    email?: string; 
    first_name?: string; 
    last_name?: string; 
    organization_name?: string;
    linkedin_url?: string;
  }): Promise<{ 
    contact: ApolloContact | null; 
    enrichedEmail?: string;
    source: 'apollo' | 'lusha' | 'none';
  }> {
    try {
      // First try Apollo enrichment
      const apolloResult = await this.enrichContact(params);
      const contact = apolloResult.contact;

      // Check if email is locked
      const isLocked = !contact.email || 
                      contact.email.includes('email_not_unlocked') || 
                      contact.email.includes('@example.com');

      if (!isLocked) {
        return { 
          contact, 
          enrichedEmail: contact.email,
          source: 'apollo' 
        };
      }

      // Try Lusha fallback for locked emails
      const { lushaService } = await import('./lusha.service');
      
      if (!lushaService.isConfigured()) {
        console.warn('Lusha not configured - cannot fallback for locked email');
        return { 
          contact, 
          enrichedEmail: undefined,
          source: 'none' 
        };
      }

      const lushaData = await lushaService.enrichPerson({
        fullName: params.first_name && params.last_name 
          ? `${params.first_name} ${params.last_name}`
          : undefined,
        company: params.organization_name,
        linkedinUrl: params.linkedin_url
      });

      const lushaEmail = lushaService.getBestEmail(lushaData);

      if (lushaEmail) {
        return {
          contact: {
            ...contact,
            email: lushaEmail
          },
          enrichedEmail: lushaEmail,
          source: 'lusha'
        };
      }

      return { 
        contact, 
        enrichedEmail: undefined,
        source: 'none' 
      };
    } catch (error) {
      console.error('Enrichment with fallback error:', error);
      return { 
        contact: null, 
        enrichedEmail: undefined,
        source: 'none' 
      };
    }
  }
}

export const apolloService = new ApolloService();
