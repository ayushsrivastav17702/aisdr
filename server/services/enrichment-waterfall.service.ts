import { lushaService } from './lusha.service';
import { apolloService } from './apollo.service';
import { aiService } from './ai.service';

interface EnrichmentResult {
  email: string | null;
  phone: string | null;
  source: 'apollo' | 'lusha' | 'web_search' | 'not_found';
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
    
    console.log(`🔄 Starting waterfall enrichment for: ${fullName} at ${prospect.companyName || 'Unknown Company'}`);
    
    // Step 1: Try Apollo enrichment first
    const apolloResult = await this.tryApolloEnrichment(prospect);
    if (apolloResult.email) {
      console.log(`  ✅ Apollo: Found email ${apolloResult.email}`);
      return apolloResult;
    }
    console.log(`  ⚠️  Apollo: No email found`);
    
    // Step 2: Try Lusha enrichment
    const lushaResult = await this.tryLushaEnrichment(prospect, fullName);
    if (lushaResult.email) {
      console.log(`  ✅ Lusha: Found email ${lushaResult.email}`);
      return lushaResult;
    }
    console.log(`  ⚠️  Lusha: No email found`);
    
    // Step 3: Try web search (email pattern guessing)
    const webResult = await this.tryWebSearchEnrichment(prospect, fullName);
    if (webResult.email) {
      console.log(`  ✅ Web Search: Found email ${webResult.email}`);
      return webResult;
    }
    console.log(`  ❌ No email found in any source`);
    
    return {
      email: null,
      phone: lushaResult.phone || apolloResult.phone || null,
      source: 'not_found',
      enrichmentData: {
        apolloTried: true,
        lushaTried: lushaService.isConfigured(),
        webSearchTried: true,
      }
    };
  }
  
  private async tryApolloEnrichment(prospect: ProspectData): Promise<EnrichmentResult> {
    try {
      if (!prospect.firstName || !prospect.companyName) {
        return { email: null, phone: null, source: 'apollo' };
      }
      
      const enriched = await apolloService.enrichContact({
        first_name: prospect.firstName,
        last_name: prospect.lastName,
        organization_name: prospect.companyName,
      });
      
      const contact = enriched?.contact;
      if (contact?.email && !contact.email.includes('email_not_unlocked')) {
        return {
          email: contact.email,
          phone: contact.phone_numbers?.[0]?.sanitized_number || null,
          source: 'apollo',
          enrichmentData: { apollo: contact }
        };
      }
      
      return { email: null, phone: null, source: 'apollo' };
    } catch (error) {
      console.error('Apollo enrichment error:', error);
      return { email: null, phone: null, source: 'apollo' };
    }
  }
  
  private async tryLushaEnrichment(prospect: ProspectData, fullName: string): Promise<EnrichmentResult> {
    try {
      if (!lushaService.isConfigured()) {
        console.log(`  ⏭️  Lusha: Not configured (set LUSHA_API_KEY)`);
        return { email: null, phone: null, source: 'lusha' };
      }
      
      const lushaData = await lushaService.enrichPerson({
        fullName,
        company: prospect.companyName,
        linkedinUrl: prospect.linkedinUrl,
      });
      
      if (lushaData) {
        const email = lushaService.getBestEmail(lushaData);
        const phone = lushaService.getBestPhone(lushaData);
        
        if (email) {
          return {
            email,
            phone,
            source: 'lusha',
            enrichmentData: { lusha: lushaData }
          };
        }
        
        return { email: null, phone, source: 'lusha' };
      }
      
      return { email: null, phone: null, source: 'lusha' };
    } catch (error) {
      console.error('Lusha enrichment error:', error);
      return { email: null, phone: null, source: 'lusha' };
    }
  }
  
  private async tryWebSearchEnrichment(prospect: ProspectData, fullName: string): Promise<EnrichmentResult> {
    try {
      if (!prospect.companyDomain && !prospect.companyName) {
        return { email: null, phone: null, source: 'web_search' };
      }
      
      // Generate common email patterns based on name and company domain
      const domain = prospect.companyDomain || this.guessDomain(prospect.companyName || '');
      if (!domain) {
        return { email: null, phone: null, source: 'web_search' };
      }
      
      const firstName = (prospect.firstName || '').toLowerCase().replace(/[^a-z]/g, '');
      const lastName = (prospect.lastName || '').toLowerCase().replace(/[^a-z]/g, '');
      
      if (!firstName || !lastName) {
        return { email: null, phone: null, source: 'web_search' };
      }
      
      // Common email patterns used by companies
      const emailPatterns = [
        `${firstName}.${lastName}@${domain}`,           // john.doe@company.com
        `${firstName}${lastName}@${domain}`,            // johndoe@company.com
        `${firstName[0]}${lastName}@${domain}`,         // jdoe@company.com
        `${firstName}@${domain}`,                       // john@company.com
        `${firstName}_${lastName}@${domain}`,           // john_doe@company.com
        `${lastName}.${firstName}@${domain}`,           // doe.john@company.com
        `${firstName[0]}.${lastName}@${domain}`,        // j.doe@company.com
      ];
      
      // Return the most common pattern (first.last@domain)
      // In production, you'd want to verify these emails
      const guessedEmail = emailPatterns[0];
      
      return {
        email: guessedEmail,
        phone: null,
        source: 'web_search',
        enrichmentData: {
          guessedPatterns: emailPatterns,
          domain,
          confidence: 'low',
          needsVerification: true,
        }
      };
    } catch (error) {
      console.error('Web search enrichment error:', error);
      return { email: null, phone: null, source: 'web_search' };
    }
  }
  
  private guessDomain(companyName: string): string | null {
    if (!companyName) return null;
    
    // Clean company name and create domain guess
    const cleaned = companyName
      .toLowerCase()
      .replace(/\s*(inc|llc|ltd|corp|corporation|company|co|group|holdings)\.?\s*/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
    
    if (!cleaned) return null;
    
    return `${cleaned}.com`;
  }
  
  async enrichBatch(prospects: ProspectData[], onProgress?: (current: number, total: number) => void): Promise<Map<string, EnrichmentResult>> {
    const results = new Map<string, EnrichmentResult>();
    
    for (let i = 0; i < prospects.length; i++) {
      const prospect = prospects[i];
      const key = prospect.apolloId || `${prospect.firstName}-${prospect.lastName}-${prospect.companyName}`;
      
      const result = await this.enrichProspect(prospect);
      results.set(key, result);
      
      if (onProgress) {
        onProgress(i + 1, prospects.length);
      }
      
      // Rate limiting - small delay between enrichments
      if (i < prospects.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }
}

export const enrichmentWaterfallService = new EnrichmentWaterfallService();
