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

class LushaService {
  private apiKey: string;
  private baseUrl = 'https://api.lusha.com/person';

  constructor() {
    // Support both naming conventions for API key
    this.apiKey = process.env.LUSHA_API_KEY || process.env.Lusha_api_keys || '';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
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
