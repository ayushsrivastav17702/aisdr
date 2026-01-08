import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Prospect } from '@shared/schema';
import { renderMergeFields } from '../services/email-queue.service';

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
      const emailQueueResult = renderMergeFields('Hi {{first_name}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('Hi there');
      expect(emailQueueResult.rendered).toBe('Hi there');
    });

    it('should match email-queue fallbacks for missing company', async () => {
      const tokenServiceResult = await resolveTokens('At {{company}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFields('At {{company}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('At your company');
      expect(emailQueueResult.rendered).toBe('At your company');
    });

    it('should match email-queue fallbacks for missing job_title', async () => {
      const tokenServiceResult = await resolveTokens('As {{job_title}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFields('As {{job_title}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('As your role');
      expect(emailQueueResult.rendered).toBe('As your role');
    });
  });

  describe('Inline Fallback Parity', () => {
    it('should both support inline fallback syntax', async () => {
      const template = 'Hi {{first_name|friend}} at {{company|a great company}}';

      const tokenServiceResult = await resolveTokens(template, { prospect: minimalProspect });
      const emailQueueResult = renderMergeFields(template, minimalProspect);

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
      const result = renderMergeFields('Hi {{first_name}} at {{company}}', mockProspect);
      
      expect(result.rendered).toBe('Hi Charlie at MegaCorp');
      expect(result.unresolvedFields).toHaveLength(0);
    });
  });

  describe('Industry Field Parity', () => {
    it('should both resolve {{industry}} from companyIndustry', async () => {
      const tokenServiceResult = await resolveTokens('In {{industry}}', { prospect: mockProspect });
      const emailQueueResult = renderMergeFields('In {{industry}}', mockProspect);

      expect(tokenServiceResult.resolvedContent).toBe('In Manufacturing');
      expect(emailQueueResult.rendered).toBe('In Manufacturing');
    });

    it('should both use fallback when companyIndustry is missing', async () => {
      const tokenServiceResult = await resolveTokens('In {{industry}}', { prospect: minimalProspect });
      const emailQueueResult = renderMergeFields('In {{industry}}', minimalProspect);

      expect(tokenServiceResult.resolvedContent).toBe('In your industry');
      expect(emailQueueResult.rendered).toBe('In your industry');
    });
  });
});
