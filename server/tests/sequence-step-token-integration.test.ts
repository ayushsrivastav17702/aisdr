import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import type { Prospect, SequenceStep } from '@shared/schema';

const mockProspect: Prospect = {
  id: 'seq-prospect-123',
  organizationId: 'org-123',
  firstName: 'Bob',
  lastName: 'Smith',
  fullName: 'Bob Smith',
  primaryEmail: 'bob@acmecorp.com',
  companyName: 'AcmeCorp',
  jobTitle: 'VP of Sales',
  companyIndustry: 'SaaS',
  companySize: '200-500',
  contactLocation: 'Austin, TX',
  companyLocation: 'Austin, TX, USA',
  phoneNumber: '+1-512-555-0123',
  linkedinUrl: 'https://linkedin.com/in/bobsmith',
  department: 'Sales',
  seniority: 'VP',
  source: 'ai_search',
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'user-456',
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

const mockSequenceStep: SequenceStep = {
  id: 'step-456',
  sequenceId: 'sequence-456',
  stepOrder: 1,
  subject: '{{first_name}}, {{custom_ai_line}}',
  body: '<p>Hi {{first_name}},</p><p>{{custom_ai_line}}</p><p>{{company}} is doing great things in {{industry}}.</p>',
  delayDays: 0,
  createdAt: new Date(),
  organizationId: 'org-123',
};

let queuedEmails: Array<{ subject: string; body: string; prospectId: string }> = [];
let aiCallCount = 0;

vi.mock('../db', () => ({
  db: {
    query: {
      prospects: {
        findFirst: vi.fn().mockImplementation(async () => mockProspect)
      },
      sequenceSteps: {
        findFirst: vi.fn().mockImplementation(async () => mockSequenceStep),
        findMany: vi.fn().mockResolvedValue([mockSequenceStep])
      },
      sequences: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sequence-456', name: 'Test Sequence' })
      },
      sequenceProspects: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sp-123', currentStepId: null })
      },
    },
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 'sp-123' }])
      })
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockSequenceStep])
        })
      })
    }),
  }
}));

vi.mock('../services/openai-helper', () => ({
  openaiHelper: {
    callWithFallback: vi.fn().mockImplementation(async () => {
      aiCallCount++;
      return {
        choices: [{ 
          message: { 
            content: 'As VP of Sales at AcmeCorp, driving revenue growth is probably your top priority.' 
          } 
        }]
      };
    })
  }
}));

vi.mock('../services/email-queue.service', () => ({
  emailQueueService: {
    addToQueue: vi.fn().mockImplementation(async (params) => {
      queuedEmails.push({
        subject: params.subject,
        body: params.body,
        prospectId: params.prospectId,
      });
      return { id: `queued-${queuedEmails.length}` };
    })
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

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual('drizzle-orm');
  return {
    ...actual,
    eq: vi.fn().mockImplementation((a, b) => ({ type: 'eq', a, b })),
    and: vi.fn().mockImplementation((...conditions) => ({ type: 'and', conditions })),
    asc: vi.fn().mockImplementation((col) => ({ type: 'asc', col })),
    desc: vi.fn().mockImplementation((col) => ({ type: 'desc', col })),
  };
});

describe('Sequence Step Token Resolution Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queuedEmails = [];
    aiCallCount = 0;
  });

  describe('Pipeline Orchestration Tests', () => {
    it('should resolve {{custom_ai_line}} tokens before queuing email', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');
      const { emailQueueService } = await import('../services/email-queue.service');

      const subject = '{{first_name}}, {{custom_ai_line}}';
      const body = '<p>Hi {{first_name}},</p><p>{{custom_ai_line}}</p><p>{{company}} is doing great things.</p>';

      const subjectResult = await resolveTokens(subject, { prospect: mockProspect });
      const bodyResult = await resolveTokens(body, { prospect: mockProspect });

      await (emailQueueService.addToQueue as Mock)({
        prospectId: mockProspect.id,
        sequenceId: 'sequence-456',
        subject: subjectResult.resolvedContent,
        body: bodyResult.resolvedContent,
        scheduledFor: new Date(),
        stepOrder: 1,
        userId: 'user-456',
        priority: 5,
      });

      expect(queuedEmails).toHaveLength(1);
      const queuedEmail = queuedEmails[0];

      expect(queuedEmail.subject).toContain('Bob');
      expect(queuedEmail.subject).toContain('VP of Sales');
      expect(queuedEmail.subject).not.toContain('{{custom_ai_line}}');
      expect(queuedEmail.subject).not.toContain('{{first_name}}');

      expect(queuedEmail.body).toContain('Hi Bob');
      expect(queuedEmail.body).toContain('AcmeCorp');
      expect(queuedEmail.body).toContain('VP of Sales');
      expect(queuedEmail.body).not.toContain('{{custom_ai_line}}');
      expect(queuedEmail.body).not.toContain('{{company}}');
    });

    it('should call AI generation only when {{custom_ai_line}} is present', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');

      const contentWithAi = '{{custom_ai_line}} Hello {{first_name}}';
      await resolveTokens(contentWithAi, { prospect: mockProspect });
      expect(aiCallCount).toBe(1);

      aiCallCount = 0;
      const contentWithoutAi = 'Hello {{first_name}} at {{company}}';
      await resolveTokens(contentWithoutAi, { prospect: mockProspect });
      expect(aiCallCount).toBe(0);
    });

    it('should use fallback AI line when API fails during scheduling', async () => {
      const { openaiHelper } = await import('../services/openai-helper');
      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('API timeout'));

      const { resolveTokens } = await import('../services/token-resolution.service');
      const { emailQueueService } = await import('../services/email-queue.service');

      const subject = '{{custom_ai_line}}';
      const result = await resolveTokens(subject, { prospect: mockProspect });

      await (emailQueueService.addToQueue as Mock)({
        prospectId: mockProspect.id,
        sequenceId: 'sequence-456',
        subject: result.resolvedContent,
        body: 'Test body',
        scheduledFor: new Date(),
        stepOrder: 1,
        userId: 'user-456',
        priority: 5,
      });

      expect(queuedEmails).toHaveLength(1);
      expect(queuedEmails[0].subject).toContain('VP of Sales');
      expect(queuedEmails[0].subject).toContain('AcmeCorp');
      expect(result.warnings).toContain('custom_ai_line: AI generation failed, using fallback');
    });

    it('should maintain token resolution order when processing subject and body', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');

      const subject = '{{custom_ai_line}} - {{first_name}}';
      const body = '{{custom_ai_line}} at {{company}}';

      const subjectResult = await resolveTokens(subject, { prospect: mockProspect });
      const bodyResult = await resolveTokens(body, { prospect: mockProspect });

      expect(subjectResult.customAiLineGenerated).toBe(true);
      expect(bodyResult.customAiLineGenerated).toBe(true);

      expect(subjectResult.resolvedContent).toContain('Bob');
      expect(bodyResult.resolvedContent).toContain('AcmeCorp');
    });
  });

  describe('Email Queue Payload Validation', () => {
    it('should queue email with fully resolved tokens', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');
      const { emailQueueService } = await import('../services/email-queue.service');

      const templateSubject = 'Quick question, {{first_name}}';
      const templateBody = `<p>Hi {{first_name}},</p>
<p>{{custom_ai_line}}</p>
<p>I noticed {{company}} is in the {{industry}} space. As {{job_title}}, you're probably focused on growth.</p>
<p>Best,<br>{{sender_name|The Team}}</p>`;

      const subjectResult = await resolveTokens(templateSubject, { prospect: mockProspect });
      const bodyResult = await resolveTokens(templateBody, { prospect: mockProspect });

      await (emailQueueService.addToQueue as Mock)({
        prospectId: mockProspect.id,
        sequenceId: 'sequence-456',
        subject: subjectResult.resolvedContent,
        body: bodyResult.resolvedContent,
        scheduledFor: new Date(),
        stepOrder: 1,
        userId: 'user-456',
        priority: 5,
      });

      const queued = queuedEmails[0];

      const unresolvedTokenPattern = /\{\{[a-zA-Z_]+\}\}/;
      expect(queued.subject).not.toMatch(unresolvedTokenPattern);
      expect(queued.body).not.toMatch(unresolvedTokenPattern);

      expect(queued.subject).toBe('Quick question, Bob');
      expect(queued.body).toContain('Hi Bob');
      expect(queued.body).toContain('AcmeCorp');
      expect(queued.body).toContain('SaaS');
      expect(queued.body).toContain('VP of Sales');
      expect(queued.body).toContain('VP of Sales at AcmeCorp');
    });

    it('should handle inline fallbacks in templates', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');

      const prospect = { ...mockProspect, companyIndustry: null } as Prospect;
      const template = 'Working in {{industry|the technology sector}} is challenging.';

      const result = await resolveTokens(template, { prospect });

      expect(result.resolvedContent).toBe('Working in the technology sector is challenging.');
      expect(result.warnings).toContain('industry: missing value, using fallback "the technology sector"');
    });
  });

  describe('Error Resilience', () => {
    it('should continue processing even if one token fails', async () => {
      const { resolveTokens } = await import('../services/token-resolution.service');
      const { openaiHelper } = await import('../services/openai-helper');

      vi.mocked(openaiHelper.callWithFallback).mockRejectedValueOnce(new Error('Rate limited'));

      const template = 'Hi {{first_name}}, {{custom_ai_line}} at {{company}}.';
      const result = await resolveTokens(template, { prospect: mockProspect });

      expect(result.resolvedContent).toContain('Hi Bob');
      expect(result.resolvedContent).toContain('AcmeCorp');
      expect(result.resolvedContent).not.toContain('{{');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should log warnings for missing prospect data', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { resolveTokens } = await import('../services/token-resolution.service');

      const minimalProspect = {
        ...mockProspect,
        firstName: null,
        companyName: null,
        companyIndustry: null,
      } as Prospect;

      const template = 'Hi {{first_name}} at {{company}} in {{industry}}.';
      await resolveTokens(template, { prospect: minimalProspect });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{first_name}} missing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{company}} missing'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Token {{industry}} missing'));

      consoleSpy.mockRestore();
    });
  });
});
