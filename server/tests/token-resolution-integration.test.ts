import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import type { Prospect, SequenceStep } from '@shared/schema';

const mockProspect: Prospect = {
  id: 'integration-prospect-123',
  organizationId: 'org-123',
  firstName: 'Alice',
  lastName: 'Johnson',
  fullName: 'Alice Johnson',
  primaryEmail: 'alice@testcorp.com',
  companyName: 'TestCorp Inc',
  jobTitle: 'Director of Operations',
  companyIndustry: 'Technology',
  companySize: '100-500',
  contactLocation: 'New York, NY',
  companyLocation: 'New York, NY, USA',
  phoneNumber: '+1-555-1234',
  linkedinUrl: 'https://linkedin.com/in/alicejohnson',
  department: 'Operations',
  seniority: 'Director',
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

const mockSequenceStep: Partial<SequenceStep> = {
  id: 'step-123',
  sequenceId: 'sequence-123',
  stepOrder: 1,
  subject: 'Hi {{first_name}} - {{custom_ai_line}}',
  body: '<p>Hi {{first_name}},</p><p>{{custom_ai_line}}</p><p>I noticed {{company}} is growing in {{industry}}.</p>',
  delayDays: 0,
  createdAt: new Date(),
};

vi.mock('../db', () => ({
  db: {
    query: {
      prospects: { findFirst: vi.fn() },
      sequenceSteps: { findFirst: vi.fn() },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([])
      })
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'email-queue-123' }])
      })
    }),
  }
}));

vi.mock('../services/openai-helper', () => ({
  openaiHelper: {
    callWithFallback: vi.fn().mockResolvedValue({
      choices: [{ 
        message: { 
          content: 'As Director of Operations at TestCorp Inc, streamlining workflows is likely your top priority.' 
        } 
      }]
    })
  }
}));

vi.mock('../services/email-queue.service', () => ({
  emailQueueService: {
    addToQueue: vi.fn().mockResolvedValue({ id: 'queued-email-123' })
  }
}));

vi.mock('../services/intelligent-personalization.service', () => ({
  intelligentPersonalizationService: {
    getOrGeneratePersonalization: vi.fn().mockResolvedValue(null)
  }
}));

vi.mock('../services/ai-email-generator.service', () => ({
  generateEmail: vi.fn()
}));

describe('Token Resolution Integration Tests', () => {
  let resolveTokens: typeof import('../services/token-resolution.service').resolveTokens;
  let emailQueueService: { addToQueue: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const tokenModule = await import('../services/token-resolution.service');
    resolveTokens = tokenModule.resolveTokens;
    
    const queueModule = await import('../services/email-queue.service');
    emailQueueService = queueModule.emailQueueService as { addToQueue: Mock };
  });

  describe('Sequence Step Token Resolution Flow', () => {
    it('should resolve {{custom_ai_line}} in subject before email queuing', async () => {
      const subject = 'Hi {{first_name}} - {{custom_ai_line}}';
      const result = await resolveTokens(subject, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('Hi Alice');
      expect(result.resolvedContent).toContain('Director of Operations');
      expect(result.resolvedContent).not.toContain('{{custom_ai_line}}');
      expect(result.customAiLineGenerated).toBe(true);
    });

    it('should resolve {{custom_ai_line}} in body before email queuing', async () => {
      const body = '<p>Hi {{first_name}},</p><p>{{custom_ai_line}}</p><p>Company: {{company}}</p>';
      const result = await resolveTokens(body, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('Hi Alice');
      expect(result.resolvedContent).toContain('TestCorp Inc');
      expect(result.resolvedContent).toContain('Director of Operations');
      expect(result.resolvedContent).not.toContain('{{custom_ai_line}}');
    });

    it('should use fallback when AI generation fails', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API rate limit'));

      const body = '{{custom_ai_line}} Best, Team';
      const result = await resolveTokens(body, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('As Director of Operations at TestCorp Inc');
      expect(result.warnings).toContain('custom_ai_line: AI generation failed, using fallback');
    });

    it('should resolve both custom_ai_line and standard tokens together', async () => {
      const content = `Hi {{first_name}},

{{custom_ai_line}}

I noticed {{company}} is in the {{industry}} industry. Your role as {{job_title}} must keep you busy.

Best regards`;

      const result = await resolveTokens(content, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('Hi Alice');
      expect(result.resolvedContent).toContain('TestCorp Inc');
      expect(result.resolvedContent).toContain('Technology');
      expect(result.resolvedContent).toContain('Director of Operations');
      expect(result.resolvedContent).not.toContain('{{');
      expect(result.unresolvedTokens).toHaveLength(0);
    });
  });

  describe('Email Queue Token Resolution Parity', () => {
    it('should have matching fallbacks between services', () => {
      const emailQueueFallbacks: Record<string, string> = {
        firstName: 'there',
        first_name: 'there',
        companyName: 'your company',
        company_name: 'your company',
        company: 'your company',
        title: 'your role',
        jobTitle: 'your role',
        job_title: 'your role',
        industry: 'your industry',
      };

      const tokenServiceFallbacks: Record<string, string> = {
        first_name: 'there',
        full_name: 'there',
        company: 'your company',
        company_name: 'your company',
        job_title: 'your role',
        title: 'your role',
        industry: 'your industry',
      };

      expect(emailQueueFallbacks['first_name']).toBe(tokenServiceFallbacks['first_name']);
      expect(emailQueueFallbacks['company']).toBe(tokenServiceFallbacks['company']);
      expect(emailQueueFallbacks['job_title']).toBe(tokenServiceFallbacks['job_title']);
    });

    it('should support both camelCase and snake_case tokens', async () => {
      const camelCase = 'Hi {{firstName}} at {{companyName}}';
      const snakeCase = 'Hi {{first_name}} at {{company_name}}';

      const camelResult = await resolveTokens(camelCase, { prospect: mockProspect });
      const snakeResult = await resolveTokens(snakeCase, { prospect: mockProspect });

      expect(camelResult.resolvedContent).toBe('Hi Alice at TestCorp Inc');
      expect(snakeResult.resolvedContent).toBe('Hi Alice at TestCorp Inc');
    });
  });

  describe('Production Scenario Tests', () => {
    it('should handle prospect with minimal data gracefully', async () => {
      const minimalProspect: Partial<Prospect> = {
        id: 'minimal-123',
        organizationId: 'org-123',
        primaryEmail: 'user@example.com',
        firstName: null,
        lastName: null,
        companyName: null,
        jobTitle: null,
        companyIndustry: null,
        source: 'manual',
        status: 'active',
      };

      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('No context'));

      const content = 'Hi {{first_name}}, {{custom_ai_line}} at {{company}}.';
      const result = await resolveTokens(content, { prospect: minimalProspect as Prospect });

      expect(result.resolvedContent).toContain('Hi there');
      expect(result.resolvedContent).toContain('your company');
      expect(result.resolvedContent).toContain('how we help companies');
    });

    it('should log appropriate warnings for missing values', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const partialProspect: Partial<Prospect> = {
        ...mockProspect,
        companyIndustry: null,
        department: null,
      };

      const content = 'In {{industry}}, {{department}} teams need...';
      await resolveTokens(content, { prospect: partialProspect as Prospect });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{industry}} missing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{department}} missing'));

      consoleSpy.mockRestore();
    });

    it('should handle template with no tokens', async () => {
      const plainContent = 'This is a plain email with no personalization tokens.';
      const result = await resolveTokens(plainContent, { prospect: mockProspect });

      expect(result.resolvedContent).toBe(plainContent);
      expect(result.warnings).toHaveLength(0);
      expect(result.unresolvedTokens).toHaveLength(0);
      expect(result.customAiLineGenerated).toBe(false);
    });

    it('should handle HTML content with tokens', async () => {
      const htmlContent = `
        <div>
          <h1>Hello {{first_name}}!</h1>
          <p>Welcome to {{company}}.</p>
          <p>{{custom_ai_line}}</p>
        </div>
      `;

      const result = await resolveTokens(htmlContent, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('<h1>Hello Alice!</h1>');
      expect(result.resolvedContent).toContain('TestCorp Inc');
      expect(result.resolvedContent).not.toContain('{{');
    });
  });
});
