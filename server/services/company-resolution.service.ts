export interface ResolvedCompany {
  organizationId: string;
  name: string;
  domain?: string;
  industry?: string;
  employees?: number;
  source: 'not_found';
}

export interface CompanyResolutionResult {
  success: boolean;
  company?: ResolvedCompany;
  error?: string;
  providersAttempted: string[];
}

class CompanyResolutionService {
  async resolveCompany(query: string, organizationId?: string): Promise<CompanyResolutionResult> {
    console.log(`🏢 Company resolution stub — no providers configured (query: "${query}")`);
    return { success: false, error: 'No company resolution providers configured', providersAttempted: [] };
  }
}

export const companyResolutionService = new CompanyResolutionService();
