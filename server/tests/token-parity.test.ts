import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Prospect } from '@shared/schema';

const mockProspect: Prospect = {
  id: 'parity-prospect-123',
  organizationId: 'org-123',
  firstName: 'Charlie',
  lastName: 'Wilson',
  fullName: 'Charlie Wilson',
  primaryEmail: 'charlie@megacorp.com',
  companyName: 'MegaCorp',
  jobTitle: 'Head of Procurement',
  companyIndustry: 'Manufacturing',
  companySize: '1000+',
  contactLocation: 'Chicago, IL',
  companyLocation: 'Chicago, IL, USA',
  phoneNumber: '+1-312-555-0123',
  linkedinUrl: 'https://linkedin.com/in/charliewilson',
  department: 'Procurement',
  seniority: 'Head',
  source: 'ai_search',
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-789',
  workspaceId: null,
  status: 'active',
  apolloId: null,
  lushaId: null,
  companyWebsite: null,
  companyFunding: null,
  companyRevenue: null,
  companySocialLinks: null,
  technographics: null,
  keywords: null,
  secondaryEmails: null,
  socialProfiles: null,
  notes: null,
  customFields: null,
  fieldSources: null,
  isArchived: false,
  archivedAt: null,
};

const minimalProspect: Prospect = {
  id: 'parity-prospect-minimal',
  organizationId: 'org-123',
  firstName: null,
  lastName: null,
  fullName: null,
  primaryEmail: 'unknown@example.com',
  companyName: null,
  jobTitle: null,
  companyIndustry: null,
  companySize: null,
  contactLocation: null,
  companyLocation: null,
  phoneNumber: null,
  linkedinUrl: null,
  department: null,
  seniority: null,
  source: 'manual',
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-789',
  workspaceId: null,
  status: 'active',
  apolloId: null,
  lushaId: null,
  companyWebsite: null,
  companyFunding: null,
  companyRevenue: null,
  companySocialLinks: null,
  technographics: null,
  keywords: null,
  secondaryEmails: null,
  socialProfiles: null,
  notes: null,
  customFields: null,
  fieldSources: null,
  isArchived: false,
  archivedAt: null,
};

vi.mock('../services/openai-helper', () => ({
  openaiHelper: {
    callWithFallback: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'AI generated line.' } }]
    })
  }
}));

function renderMergeFieldsEmulation(content: string, prospect: any): { rendered: string; unresolvedFields: string[]; usedFallbacks: string[] } {
  if (!content || !prospect) return { rendered: content, unresolvedFields: [], usedFallbacks: [] };
  
  const unresolvedFields: string[] = [];
  const usedFallbacks: string[] = [];
  
  const mergeData: Record<string, string> = {
    firstName: prospect.firstName || '',
    first_name: prospect.firstName || '',
    lastName: prospect.lastName || '',
    last_name: prospect.lastName || '',
    fullName: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '',
    full_name: [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || '',
    prospectName: prospect.firstName || '',
    prospect_name: prospect.firstName || '',
    email: prospect.primaryEmail || prospect.email || '',
    companyName: prospect.companyName || prospect.company || '',
    company_name: prospect.companyName || prospect.company || '',
    company: prospect.companyName || prospect.company || '',
    title: prospect.title || prospect.jobTitle || '',
    jobTitle: prospect.title || prospect.jobTitle || '',
    job_title: prospect.title || prospect.jobTitle || '',
    industry: prospect.industry || prospect.companyIndustry || '',
    city: prospect.city || '',
    seniority: prospect.seniority || '',
  };
  
  const defaultFallbacks: Record<string, string> = {
    firstName: 'there',
    first_name: 'there',
    fullName: 'there',
    full_name: 'there',
    prospect_name: 'there',
    prospectName: 'there',
    companyName: 'your company',
    company_name: 'your company',
    company: 'your company',
    title: 'your role',
    jobTitle: 'your role',
    job_title: 'your role',
    industry: 'your industry',
    location: 'your area',
    seniority: 'leader',
  };
  
  const normalizeKey = (key: string): string[] => {
    const keys = [key];
    keys.push(key.replace(/([A-Z])/g, '_$1').toLowerCase());
    keys.push(key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
    return keys;
  };
  
  const getValue = (fieldName: string): string | undefined => {
    for (const key of normalizeKey(fieldName)) {
      if (mergeData[key] && mergeData[key].trim()) {
        return mergeData[key];
      }
    }
    return undefined;
  };
  
  const getFallback = (fieldName: string): string | undefined => {
    for (const key of normalizeKey(fieldName)) {
      if (defaultFallbacks[key]) {
        return defaultFallbacks[key];
      }
    }
    return undefined;
  };
  
  let rendered = content.replace(/\{\{(\w+)(?:\|([^}]*))?\}\}/g, (match, fieldName, fallback) => {
    const value = getValue(fieldName);
    if (value) {
      return value;
    }
    if (fallback !== undefined) {
      usedFallbacks.push(`${fieldName}→"${fallback}"`);
      return fallback;
    }
    const defaultFallback = getFallback(fieldName);
    if (defaultFallback) {
      usedFallbacks.push(`${fieldName}→"${defaultFallback}"`);
      return defaultFallback;
    }
    unresolvedFields.push(fieldName);
    return '';
  });
  
  return { rendered, unresolvedFields, usedFallbacks };
}

describe('Token Resolution Parity Tests', () => {
  let resolveTokens: typeof import('../services/token-resolution.service').resolveTokens;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const tokenModule = await import('../services/token-resolution.service');
    resolveTokens = tokenModule.resolveTokens;
  });

  describe('Standard Token Parity', () => {
    const standardTokenPairs = [
      { snake: '{{first_name}}', camel: '{{firstName}}', expected: 'Charlie' },
      { snake: '{{last_name}}', camel: '{{lastName}}', expected: 'Wilson' },
      { snake: '{{company}}', camel: '{{companyName}}', expected: 'MegaCorp' },
      { snake: '{{job_title}}', camel: '{{jobTitle}}', expected: 'Head of Procurement' },
    ];

    for (const { snake, camel, expected } of standardTokenPairs) {
      it(`should resolve ${snake} and ${camel} to same value: "${expected}"`, async () => {
        const snakeResult = await resolveTokens(snake, { prospect: mockProspect });
        const camelResult = await resolveTokens(camel, { prospect: mockProspect });

        expect(snakeResult.resolvedContent).toBe(expected);
        expect(camelResult.resolvedContent).toBe(expected);
      });
    }

    it('should match email-queue fallbacks for missing first_name', async () => {
      const tokenServiceResult = await resolveTokens('Hi {{first_name}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFieldsEmulation('Hi {{first_name}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('Hi there');
      expect(emailQueueResult.rendered).toBe('Hi there');
    });

    it('should match email-queue fallbacks for missing company', async () => {
      const tokenServiceResult = await resolveTokens('At {{company}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFieldsEmulation('At {{company}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('At your company');
      expect(emailQueueResult.rendered).toBe('At your company');
    });

    it('should match email-queue fallbacks for missing job_title', async () => {
      const tokenServiceResult = await resolveTokens('As {{job_title}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFieldsEmulation('As {{job_title}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('As your role');
      expect(emailQueueResult.rendered).toBe('As your role');
    });
  });

  describe('Inline Fallback Parity', () => {
    it('should both support inline fallback syntax', async () => {
      const template = 'Hi {{first_name|friend}} at {{company|a great company}}';

      const tokenServiceResult = await resolveTokens(template, { prospect: minimalProspect });
      const emailQueueResult = renderMergeFieldsEmulation(template, minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('Hi friend at a great company');
      expect(emailQueueResult.rendered).toBe('Hi friend at a great company');
    });
  });

  describe('Resolution Responsibility Documentation', () => {
    it('should document that token-resolution handles async tokens BEFORE queuing', async () => {
      const result = await resolveTokens('{{custom_ai_line}}', { prospect: mockProspect });
      expect(result.customAiLineGenerated).toBe(true);
      expect(result.resolvedContent).not.toContain('{{custom_ai_line}}');
    });

    it('should document that email-queue renderMergeFields handles standard tokens AT SEND TIME', () => {
      const result = renderMergeFieldsEmulation('Hi {{first_name}} at {{company}}', mockProspect);
      
      expect(result.rendered).toBe('Hi Charlie at MegaCorp');
      expect(result.unresolvedFields).toHaveLength(0);
    });
  });
});
