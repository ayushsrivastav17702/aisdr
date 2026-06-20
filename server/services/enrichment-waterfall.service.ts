interface EnrichmentResult {
  email: string | null;
  phone: string | null;
  source: 'web_search' | 'not_found';
  enrichmentData?: any;
}

interface ProspectData {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  companyName?: string;
  companyDomain?: string;
  linkedinUrl?: string;
  jobTitle?: string;
  apolloId?: string;
}

class EnrichmentWaterfallService {

  async enrichProspect(prospect: ProspectData): Promise<EnrichmentResult> {
    const fullName = prospect.fullName || `${prospect.firstName || ''} ${prospect.lastName || ''}`.trim();
    console.log(`🔄 Starting enrichment for: ${fullName} at ${prospect.companyName || 'Unknown Company'}`);

    const webResult = await this.tryWebSearchEnrichment(prospect);
    if (webResult.email) {
      console.log(`  ✅ Web Search: Found email ${webResult.email}`);
      return webResult;
    }
    console.log(`  ❌ No email found`);

    return { email: null, phone: null, source: 'not_found' };
  }

  private async tryWebSearchEnrichment(prospect: ProspectData): Promise<EnrichmentResult> {
    try {
      const domain = prospect.companyDomain || this.guessDomain(prospect.companyName || '');
      if (!domain) return { email: null, phone: null, source: 'web_search' };

      const firstName = (prospect.firstName || '').toLowerCase().replace(/[^a-z]/g, '');
      const lastName = (prospect.lastName || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!firstName || !lastName) return { email: null, phone: null, source: 'web_search' };

      const emailPatterns = [
        `${firstName}.${lastName}@${domain}`,
        `${firstName}${lastName}@${domain}`,
        `${firstName[0]}${lastName}@${domain}`,
        `${firstName}@${domain}`,
        `${firstName}_${lastName}@${domain}`,
        `${lastName}.${firstName}@${domain}`,
        `${firstName[0]}.${lastName}@${domain}`,
      ];

      return {
        email: emailPatterns[0],
        phone: null,
        source: 'web_search',
        enrichmentData: { guessedPatterns: emailPatterns, domain, confidence: 'low', needsVerification: true },
      };
    } catch (error) {
      console.error('Web search enrichment error:', error);
      return { email: null, phone: null, source: 'web_search' };
    }
  }

  private guessDomain(companyName: string): string | null {
    if (!companyName) return null;
    const cleaned = companyName
      .toLowerCase()
      .replace(/\s*(inc|llc|ltd|corp|corporation|company|co|group|holdings)\.?\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
    return cleaned ? `${cleaned}.com` : null;
  }

  async enrichBatch(prospects: ProspectData[], onProgress?: (current: number, total: number) => void): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      const key = prospect.apolloId || `${prospect.firstName}-${prospect.lastName}-${prospect.companyName}`;
      results.set(key, await this.enrichProspect(prospect));
      if (onProgress) onProgress(i + 1, prospects.length);
      if (i < prospects.length - 1) await new Promise(resolve => setTimeout(resolve, 200));
    }
    return results;
  }
}

export const enrichmentWaterfallService = new EnrichmentWaterfallService();
