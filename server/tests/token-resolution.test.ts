import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Prospect } from '@shared/schema';

const mockProspect: Prospect = {
  id: 'test-prospect-123',
  organizationId: 'org-123',
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  primaryEmail: 'john.doe@acme.com',
  companyName: 'Acme Corp',
  jobTitle: 'VP of Merchandising',
  companyIndustry: 'Retail',
  companySize: '500-1000',
  contactLocation: 'San Francisco, CA',
  companyLocation: 'San Francisco, CA, USA',
  phoneNumber: '+1-555-0123',
  linkedinUrl: 'https://linkedin.com/in/johndoe',
  department: 'Operations',
  seniority: 'VP',
  source: 'ai_search',
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-123',
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
  id: 'test-prospect-minimal',
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
  userId: 'user-123',
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
      choices: [{ message: { content: 'As VP of Merchandising at Acme Corp, driving inventory efficiency is likely top of mind.' } }]
    })
  }
}));

describe('Token Resolution Service', () => {
  let resolveTokens: typeof import('../services/token-resolution.service').resolveTokens;
  let previewTokenResolution: typeof import('../services/token-resolution.service').previewTokenResolution;
  let tokenResolutionService: typeof import('../services/token-resolution.service').tokenResolutionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../services/token-resolution.service');
    resolveTokens = module.resolveTokens;
    previewTokenResolution = module.previewTokenResolution;
    tokenResolutionService = module.tokenResolutionService;
  });

  describe('TC-TOKEN-01: Standard Token Resolution', () => {
    it('should resolve all standard tokens with full prospect data', async () => {
      const content = 'Hi {{first_name}} {{last_name}}, I noticed {{company}} in the {{industry}} space.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Hi John Doe, I noticed Acme Corp in the Retail space.');
      expect(result.unresolvedTokens).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should resolve job_title and title tokens', async () => {
      const content = 'As {{job_title}}, you understand the challenges. Your {{title}} role requires expertise.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('As VP of Merchandising, you understand the challenges. Your VP of Merchandising role requires expertise.');
    });

    it('should resolve location and city tokens', async () => {
      const content = 'Based in {{city}}, {{location}} area.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Based in San Francisco, San Francisco, CA area.');
    });

    it('should resolve full_name token', async () => {
      const content = 'Dear {{full_name}},';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Dear John Doe,');
    });

    it('should resolve company_size and department tokens', async () => {
      const content = 'At a {{company_size}} company in the {{department}} department.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('At a 500-1000 company in the Operations department.');
    });

    it('should resolve email and phone tokens', async () => {
      const content = 'Contact: {{email}}, {{phone}}';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Contact: john.doe@acme.com, +1-555-0123');
    });

    it('should resolve sender context tokens', async () => {
      const content = 'Regards, {{sender_name}} from {{sender_company}}';
      const result = await resolveTokens(content, { 
        prospect: mockProspect, 
        senderName: 'Sarah Smith',
        companyName: 'TechCorp'
      });

      expect(result.resolvedContent).toBe('Regards, Sarah Smith from TechCorp');
    });

    it('should resolve sequence context tokens', async () => {
      const content = 'This is step {{sequence_step}} of {{sequence_name}}';
      const result = await resolveTokens(content, { 
        prospect: mockProspect, 
        sequenceStep: 2,
        sequenceName: 'Retail Outreach'
      });

      expect(result.resolvedContent).toBe('This is step 2 of Retail Outreach');
    });

    it('should handle case-insensitive tokens', async () => {
      const content = 'Hi {{FIRST_NAME}}, at {{Company}}.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Hi John, at Acme Corp.');
    });

    it('should handle multiple occurrences of same token', async () => {
      const content = 'Hi {{first_name}}, I wanted to reach out to {{first_name}} about {{company}}.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toBe('Hi John, I wanted to reach out to John about Acme Corp.');
    });
  });

  describe('TC-TOKEN-02: Missing Token Fallbacks', () => {
    it('should use fallback for missing first_name', async () => {
      const content = 'Hi {{first_name}},';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toBe('Hi there,');
      expect(result.warnings).toContain('first_name: missing value, using fallback "there"');
    });

    it('should use fallback for missing company', async () => {
      const content = 'I noticed {{company}} and wanted to connect.';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toBe('I noticed your company and wanted to connect.');
      expect(result.warnings).toContain('company: missing value, using fallback "your company"');
    });

    it('should use fallback for missing job_title', async () => {
      const content = 'In your role as {{job_title}},';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toBe('In your role as your role,');
      expect(result.warnings).toContain('job_title: missing value, using fallback "your role"');
    });

    it('should log warnings for all missing tokens', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const content = 'Hi {{first_name}} at {{company}}, as {{job_title}}.';
      await resolveTokens(content, { prospect: minimalProspect });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{first_name}} missing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{company}} missing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{job_title}} missing'));
      
      consoleSpy.mockRestore();
    });

    it('should report unknown tokens as unresolved', async () => {
      const content = 'Hi {{first_name}}, {{unknown_field}} here.';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.unresolvedTokens).toContain('unknown_field');
      expect(result.warnings).toContain('unknown_field: unknown token');
    });

    it('should handle mixed resolved and fallback tokens', async () => {
      const partialProspect = { ...minimalProspect, firstName: 'Jane' };
      const content = 'Hi {{first_name}} at {{company}}.';
      const result = await resolveTokens(content, { prospect: partialProspect });

      expect(result.resolvedContent).toBe('Hi Jane at your company.');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('company');
    });

    it('should use sender_name fallback when not provided', async () => {
      const content = 'Best, {{sender_name}}';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toBe('Best, Your Account Team');
    });

    it('should use sender_company default when not provided', async () => {
      const content = 'From {{sender_company}}';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toBe('From Increff');
    });
  });

  describe('TC-TOKEN-03: Custom AI Line Generation', () => {
    it('should generate custom AI line for complete prospect', async () => {
      const content = '{{custom_ai_line}} I wanted to discuss...';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.customAiLineGenerated).toBe(true);
      expect(result.resolvedContent).toContain('As VP of Merchandising at Acme Corp');
      expect(result.warnings).toHaveLength(0);
    });

    it('should use fallback when AI generation fails', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API Error'));

      const content = '{{custom_ai_line}} Let me explain...';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.customAiLineGenerated).toBe(false);
      expect(result.resolvedContent).toContain('As VP of Merchandising at Acme Corp');
      expect(result.warnings).toContain('custom_ai_line: AI generation failed, using fallback');
    });

    it('should generate role-based fallback when company is missing', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API Error'));

      const partialProspect = { ...minimalProspect, jobTitle: 'Director of Operations' };
      const content = '{{custom_ai_line}}';
      const result = await resolveTokens(content, { prospect: partialProspect });

      expect(result.resolvedContent).toContain('In your role as Director of Operations');
    });

    it('should generate company-based fallback when title is missing', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API Error'));

      const partialProspect = { ...minimalProspect, companyName: 'TechStartup' };
      const content = '{{custom_ai_line}}';
      const result = await resolveTokens(content, { prospect: partialProspect });

      expect(result.resolvedContent).toContain('TechStartup');
    });

    it('should generate generic fallback when no context available', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API Error'));

      const content = '{{custom_ai_line}}';
      const result = await resolveTokens(content, { prospect: minimalProspect });

      expect(result.resolvedContent).toContain('how we help companies');
    });

    it('should log success message when AI line is generated', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const content = '{{custom_ai_line}}';
      await resolveTokens(content, { prospect: mockProspect });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Generated custom AI line'));
      
      consoleSpy.mockRestore();
    });

    it('should handle custom_ai_line mixed with standard tokens', async () => {
      const content = 'Hi {{first_name}}, {{custom_ai_line}} Can we chat?';
      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('Hi John,');
      expect(result.resolvedContent).toContain('As VP of Merchandising');
      expect(result.resolvedContent).toContain('Can we chat?');
      expect(result.customAiLineGenerated).toBe(true);
    });
  });

  describe('Preview Token Resolution', () => {
    it('should preview resolved tokens', () => {
      const content = 'Hi {{first_name}} at {{company}}.';
      const result = previewTokenResolution(content, { prospect: mockProspect });

      expect(result.preview).toBe('Hi John at Acme Corp.');
      expect(result.tokens).toHaveLength(2);
      expect(result.tokens[0]).toEqual({ token: 'first_name', value: 'John', hasFallback: true });
      expect(result.tokens[1]).toEqual({ token: 'company', value: 'Acme Corp', hasFallback: true });
    });

    it('should show fallback indicator for missing values', () => {
      const content = 'Hi {{first_name}} at {{company}}.';
      const result = previewTokenResolution(content, { prospect: minimalProspect });

      expect(result.preview).toBe('Hi [there] at [your company].');
      expect(result.tokens[0].value).toBeNull();
      expect(result.tokens[0].hasFallback).toBe(true);
    });

    it('should indicate custom_ai_line is not previewable', () => {
      const content = '{{custom_ai_line}} Hi there.';
      const result = previewTokenResolution(content, { prospect: mockProspect });

      const aiToken = result.tokens.find(t => t.token === 'custom_ai_line');
      expect(aiToken?.value).toBe('[AI Generated Line - Preview Not Available]');
      expect(aiToken?.hasFallback).toBe(true);
    });

    it('should show UNRESOLVED for unknown tokens without fallback', () => {
      const content = 'Check {{unknown_token}} here.';
      const result = previewTokenResolution(content, { prospect: mockProspect });

      expect(result.preview).toContain('[UNRESOLVED: unknown_token]');
      expect(result.tokens[0].hasFallback).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', async () => {
      const result = await resolveTokens('', { prospect: mockProspect });
      expect(result.resolvedContent).toBe('');
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle content with no tokens', async () => {
      const content = 'Plain text without any tokens.';
      const result = await resolveTokens(content, { prospect: mockProspect });
      expect(result.resolvedContent).toBe(content);
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle malformed token syntax gracefully', async () => {
      const content = 'Hi {first_name} and {{first_name and {{ incomplete';
      const result = await resolveTokens(content, { prospect: mockProspect });
      expect(result.resolvedContent).toBe(content);
    });

    it('should handle unicode in token values', async () => {
      const unicodeProspect = { ...mockProspect, firstName: 'José', companyName: 'Société Générale' };
      const content = 'Hi {{first_name}} from {{company}}.';
      const result = await resolveTokens(content, { prospect: unicodeProspect });

      expect(result.resolvedContent).toBe('Hi José from Société Générale.');
    });

    it('should handle special characters in company name', async () => {
      const specialProspect = { ...mockProspect, companyName: 'A&B Corp <Tech>' };
      const content = 'Company: {{company}}';
      const result = await resolveTokens(content, { prospect: specialProspect });

      expect(result.resolvedContent).toBe('Company: A&B Corp <Tech>');
    });

    it('should export list of available standard tokens', () => {
      expect(tokenResolutionService.STANDARD_TOKENS).toContain('first_name');
      expect(tokenResolutionService.STANDARD_TOKENS).toContain('company');
      expect(tokenResolutionService.STANDARD_TOKENS).toContain('job_title');
      expect(tokenResolutionService.STANDARD_TOKENS.length).toBeGreaterThan(10);
    });

    it('should export token fallbacks', () => {
      expect(tokenResolutionService.TOKEN_FALLBACKS).toHaveProperty('first_name', 'there');
      expect(tokenResolutionService.TOKEN_FALLBACKS).toHaveProperty('company', 'your company');
    });
  });
});
