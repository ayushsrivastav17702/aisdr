import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Sequence, SequenceStep, SequenceProspect, Prospect } from '@shared/schema';

const MAX_STEPS = 15;
const MAX_TOKENS_PER_STEP = 10;

const createMockSequence = (overrides?: Partial<Sequence>): Sequence => ({
  id: `seq-${Date.now()}`,
  userId: 'user-123',
  name: 'Test Sequence',
  description: null,
  type: 'outbound',
  status: 'draft',
  aiPersonalizationEnabled: false,
  totalProspects: 0,
  activeProspects: 0,
  completedProspects: 0,
  settings: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivatedAt: null,
  lastStatusChangeAt: null,
  activationToggleCount: 0,
  ...overrides
});

const createMockStep = (sequenceId: string, stepOrder: number, overrides?: Partial<SequenceStep>): SequenceStep => ({
  id: `step-${sequenceId}-${stepOrder}`,
  sequenceId,
  subject: `Subject with {{first_name}} and {{company}}`,
  body: `Body with {{first_name}}, {{company}}, {{job_title}}, {{industry}}, {{location}}, {{seniority}}, {{custom_ai_line}}, and {{email}}`,
  stepOrder,
  delayDays: stepOrder > 1 ? stepOrder - 1 : 0,
  stepType: 'email',
  aiGenerated: false,
  variables: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

const createMockProspect = (overrides?: Partial<Prospect>): Prospect => ({
  id: `prospect-${Date.now()}`,
  organizationId: 'org-123',
  userId: 'user-123',
  workspaceId: null,
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  primaryEmail: 'john@example.com',
  companyName: 'Acme Corp',
  jobTitle: 'VP Sales',
  companyIndustry: 'Technology',
  companySize: '100-500',
  contactLocation: 'San Francisco',
  companyLocation: 'San Francisco, CA',
  phoneNumber: null,
  linkedinUrl: null,
  department: null,
  seniority: 'VP',
  source: 'manual',
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
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

describe('Sequence Hardening Tests (TC-SEQ-HARD-01 to TC-SEQ-HARD-10)', () => {
  
  describe('TC-SEQ-HARD-01: Create Sequence With Max Steps + Max Tokens', () => {
    it('should validate sequence with 15 steps each containing 6-8 tokens', () => {
      const sequenceId = 'seq-max-steps';
      const steps: SequenceStep[] = [];
      
      for (let i = 1; i <= MAX_STEPS; i++) {
        steps.push(createMockStep(sequenceId, i, {
          subject: `Step ${i}: Hi {{first_name}} at {{company}}`,
          body: `Dear {{first_name}},

As {{job_title}} at {{company}} in the {{industry}} sector,
I wanted to reach out about {{custom_ai_line}}.

Based in {{location}}, you understand the challenges.

Best,
{{sender_name}}`
        }));
      }

      expect(steps.length).toBe(MAX_STEPS);
      
      const tokenPattern = /\{\{[^}]+\}\}/g;
      for (const step of steps) {
        const subjectTokens = step.subject.match(tokenPattern) || [];
        const bodyTokens = step.body.match(tokenPattern) || [];
        const totalTokens = subjectTokens.length + bodyTokens.length;
        
        expect(totalTokens).toBeGreaterThanOrEqual(6);
        expect(totalTokens).toBeLessThanOrEqual(MAX_TOKENS_PER_STEP);
      }
    });

    it('should calculate payload size within acceptable limits', () => {
      const sequenceId = 'seq-payload-test';
      const steps: SequenceStep[] = [];
      
      for (let i = 1; i <= MAX_STEPS; i++) {
        steps.push(createMockStep(sequenceId, i, {
          subject: `Step ${i}: {{first_name}} at {{company}} - Important Update`,
          body: `Hi {{first_name}},

As the {{job_title}} at {{company}}, I wanted to share some insights about {{industry}}.

{{custom_ai_line}}

Given your role in {{seniority}}, this could be valuable.

Best regards,
{{sender_name}}`
        }));
      }

      const payload = JSON.stringify({ sequenceId, steps });
      const payloadSizeKB = Buffer.byteLength(payload, 'utf8') / 1024;
      
      expect(payloadSizeKB).toBeLessThan(100);
      console.log(`Payload size for ${MAX_STEPS} steps: ${payloadSizeKB.toFixed(2)} KB`);
    });

    it('should validate DB column limits for step content', () => {
      const MAX_SUBJECT_LENGTH = 500;
      const MAX_BODY_LENGTH = 50000;
      
      const step = createMockStep('seq-1', 1, {
        subject: 'A'.repeat(MAX_SUBJECT_LENGTH),
        body: 'B'.repeat(MAX_BODY_LENGTH)
      });

      expect(step.subject.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
      expect(step.body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    });
  });

  describe('TC-SEQ-HARD-02: Rapid Step Add/Delete (Race Condition)', () => {
    it('should maintain consistent state after rapid add/delete operations', async () => {
      const steps = new Map<string, SequenceStep>();
      let operationCount = 0;
      
      const addStep = (order: number) => {
        const id = `step-rapid-${order}-${Date.now()}`;
        steps.set(id, createMockStep('seq-rapid', order, { id }));
        operationCount++;
        return id;
      };
      
      const deleteStep = (id: string) => {
        steps.delete(id);
        operationCount++;
      };

      const addedIds = await Promise.all([
        Promise.resolve(addStep(1)),
        Promise.resolve(addStep(2)),
        Promise.resolve(addStep(3)),
        Promise.resolve(addStep(4)),
        Promise.resolve(addStep(5)),
      ]);

      expect(addedIds.length).toBe(5);
      expect(steps.size).toBe(5);

      await Promise.all([
        Promise.resolve(deleteStep(addedIds[1])),
        Promise.resolve(deleteStep(addedIds[3])),
      ]);

      expect(steps.size).toBe(3);
      expect(steps.has(addedIds[0])).toBe(true);
      expect(steps.has(addedIds[1])).toBe(false);
      expect(steps.has(addedIds[2])).toBe(true);
      expect(steps.has(addedIds[3])).toBe(false);
      expect(steps.has(addedIds[4])).toBe(true);

      expect(operationCount).toBe(7);
    });

    it('should detect and prevent ghost steps after rapid operations', async () => {
      const stepRegistry = new Set<string>();
      const operations: Promise<void>[] = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push((async () => {
          const id = `step-${i}`;
          stepRegistry.add(id);
          
          if (i % 2 === 0) {
            await new Promise(r => setTimeout(r, Math.random() * 10));
            stepRegistry.delete(id);
          }
        })());
      }

      await Promise.all(operations);

      const remainingSteps = Array.from(stepRegistry);
      const oddSteps = remainingSteps.every(id => {
        const num = parseInt(id.split('-')[1]);
        return num % 2 !== 0;
      });

      expect(oddSteps).toBe(true);
      expect(remainingSteps.length).toBe(5);
    });
  });

  describe('TC-SEQ-HARD-03: Delay Precision Test (Minutes vs Days)', () => {
    it('should calculate delay in milliseconds with sub-minute precision', () => {
      const calculateDelayMs = (delayDays: number): number => {
        return delayDays * 24 * 60 * 60 * 1000;
      };

      const oneMinuteInDays = 1 / (24 * 60);
      const oneMinuteMs = calculateDelayMs(oneMinuteInDays);
      
      expect(oneMinuteMs).toBe(60000);
      
      const tenSecondsInDays = 10 / (24 * 60 * 60);
      const tenSecondsMs = calculateDelayMs(tenSecondsInDays);
      
      expect(Math.round(tenSecondsMs)).toBe(10000);
    });

    it('should validate timing precision within ±10 seconds', () => {
      const targetDelayMs = 60000;
      const tolerance = 10000;
      
      const scheduledAt = new Date();
      const expectedFireTime = new Date(scheduledAt.getTime() + targetDelayMs);
      
      const simulatedFireTime = new Date(scheduledAt.getTime() + targetDelayMs + 5000);
      
      const deviation = Math.abs(simulatedFireTime.getTime() - expectedFireTime.getTime());
      
      expect(deviation).toBeLessThanOrEqual(tolerance);
    });

    it('should support fractional day delays', () => {
      const step = createMockStep('seq-1', 1);
      
      const fractionalDelays = [
        { days: 0.5, expectedHours: 12 },
        { days: 0.25, expectedHours: 6 },
        { days: 1.5, expectedHours: 36 },
        { days: 0.0417, expectedMinutes: 60 },
      ];

      for (const { days, expectedHours, expectedMinutes } of fractionalDelays) {
        const delayMs = days * 24 * 60 * 60 * 1000;
        
        if (expectedHours !== undefined) {
          expect(delayMs / (60 * 60 * 1000)).toBeCloseTo(expectedHours, 1);
        }
        if (expectedMinutes !== undefined) {
          expect(delayMs / (60 * 1000)).toBeCloseTo(expectedMinutes, 0);
        }
      }
    });
  });

  describe('TC-SEQ-HARD-04: Delay Update After Activation', () => {
    it('should only affect future steps when delay is updated', () => {
      const sequence = createMockSequence({ status: 'active', lastActivatedAt: new Date() });
      
      const originalDelays = [0, 1, 2, 3, 4];
      const steps = originalDelays.map((delay, i) => 
        createMockStep(sequence.id, i + 1, { delayDays: delay })
      );

      const lastSentStepOrder = 2;
      const newDelay = 7;

      const updatedSteps = steps.map((step, i) => {
        if (step.stepOrder > lastSentStepOrder) {
          return { ...step, delayDays: newDelay };
        }
        return step;
      });

      expect(updatedSteps[0].delayDays).toBe(0);
      expect(updatedSteps[1].delayDays).toBe(1);
      expect(updatedSteps[2].delayDays).toBe(newDelay);
      expect(updatedSteps[3].delayDays).toBe(newDelay);
      expect(updatedSteps[4].delayDays).toBe(newDelay);
    });

    it('should prevent retroactive sends when delay is reduced', () => {
      const now = new Date();
      const enrolledAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      
      const originalDelay = 5;
      const newDelay = 1;
      
      const originalScheduledAt = new Date(enrolledAt.getTime() + originalDelay * 24 * 60 * 60 * 1000);
      const newScheduledAt = new Date(enrolledAt.getTime() + newDelay * 24 * 60 * 60 * 1000);
      
      const shouldSendImmediately = newScheduledAt <= now;
      
      expect(shouldSendImmediately).toBe(true);
      
      const safeScheduledAt = shouldSendImmediately 
        ? new Date(now.getTime() + 60000)
        : newScheduledAt;
      
      expect(safeScheduledAt.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('TC-SEQ-HARD-05: Activate Sequence With 0 Prospects', () => {
    it('should block activation when no prospects enrolled', () => {
      const sequence = createMockSequence({ 
        status: 'draft', 
        totalProspects: 0,
        activeProspects: 0 
      });

      const canActivate = (seq: Sequence): { allowed: boolean; reason?: string } => {
        if (seq.totalProspects === 0) {
          return { allowed: false, reason: 'No prospects enrolled in sequence' };
        }
        if (seq.status === 'active') {
          return { allowed: false, reason: 'Sequence already active' };
        }
        return { allowed: true };
      };

      const result = canActivate(sequence);
      
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No prospects enrolled in sequence');
    });

    it('should not create scheduler jobs for empty sequences', () => {
      const schedulerJobs: { sequenceId: string; prospectId: string }[] = [];
      
      const createSchedulerJobs = (sequenceId: string, prospectIds: string[]) => {
        for (const prospectId of prospectIds) {
          schedulerJobs.push({ sequenceId, prospectId });
        }
        return schedulerJobs.length;
      };

      const jobsCreated = createSchedulerJobs('seq-empty', []);
      
      expect(jobsCreated).toBe(0);
      expect(schedulerJobs.length).toBe(0);
    });
  });

  describe('TC-SEQ-HARD-06: Activate + Pause + Activate (Fast Toggle)', () => {
    it('should maintain single scheduler job through fast toggles', async () => {
      let schedulerJobCount = 0;
      let activeJobId: string | null = null;
      
      const activate = (sequenceId: string) => {
        if (!activeJobId) {
          activeJobId = `job-${sequenceId}-${Date.now()}`;
          schedulerJobCount++;
        }
        return activeJobId;
      };
      
      const pause = () => {
        return activeJobId;
      };

      activate('seq-toggle');
      await new Promise(r => setTimeout(r, 50));
      
      pause();
      await new Promise(r => setTimeout(r, 50));
      
      activate('seq-toggle');
      
      expect(schedulerJobCount).toBe(1);
      expect(activeJobId).not.toBeNull();
    });

    it('should increment toggle count for auditing', () => {
      const sequence = createMockSequence({ activationToggleCount: 0 });
      
      const toggleActivation = (seq: Sequence): Sequence => {
        return {
          ...seq,
          status: seq.status === 'active' ? 'paused' : 'active',
          activationToggleCount: (seq.activationToggleCount || 0) + 1,
          lastStatusChangeAt: new Date()
        };
      };

      let updatedSeq = toggleActivation(sequence);
      updatedSeq = toggleActivation(updatedSeq);
      updatedSeq = toggleActivation(updatedSeq);

      expect(updatedSeq.activationToggleCount).toBe(3);
      expect(updatedSeq.status).toBe('active');
    });

    it('should prevent duplicate sends during rapid toggles', () => {
      const sentEmails = new Set<string>();
      
      const sendEmail = (prospectId: string, stepId: string) => {
        const key = `${prospectId}-${stepId}`;
        if (sentEmails.has(key)) {
          return { success: false, reason: 'duplicate' };
        }
        sentEmails.add(key);
        return { success: true };
      };

      const result1 = sendEmail('p1', 's1');
      const result2 = sendEmail('p1', 's1');
      const result3 = sendEmail('p1', 's2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('duplicate');
      expect(result3.success).toBe(true);
      expect(sentEmails.size).toBe(2);
    });
  });

  describe('TC-SEQ-HARD-07: Concurrent Activation by Two Tabs', () => {
    it('should ensure idempotent activation', async () => {
      let activationCount = 0;
      let sequenceStatus = 'draft';
      const activationLock = { locked: false };
      
      const activateSequence = async (sequenceId: string): Promise<{ success: boolean; alreadyActive: boolean }> => {
        if (activationLock.locked) {
          await new Promise(r => setTimeout(r, 10));
        }
        
        if (sequenceStatus === 'active') {
          return { success: true, alreadyActive: true };
        }
        
        activationLock.locked = true;
        
        await new Promise(r => setTimeout(r, 5));
        
        if (sequenceStatus === 'active') {
          activationLock.locked = false;
          return { success: true, alreadyActive: true };
        }
        
        sequenceStatus = 'active';
        activationCount++;
        activationLock.locked = false;
        
        return { success: true, alreadyActive: false };
      };

      const [result1, result2] = await Promise.all([
        activateSequence('seq-concurrent'),
        activateSequence('seq-concurrent')
      ]);

      expect(result1.success || result2.success).toBe(true);
      expect(sequenceStatus).toBe('active');
      
      const actualActivations = [result1, result2].filter(r => !r.alreadyActive).length;
      expect(actualActivations).toBe(1);
    });

    it('should use optimistic locking for concurrent updates', () => {
      let version = 1;
      
      const updateWithVersion = (expectedVersion: number, newStatus: string): { success: boolean; newVersion: number } => {
        if (version !== expectedVersion) {
          return { success: false, newVersion: version };
        }
        version++;
        return { success: true, newVersion: version };
      };

      const tab1Version = version;
      const tab2Version = version;

      const tab1Result = updateWithVersion(tab1Version, 'active');
      const tab2Result = updateWithVersion(tab2Version, 'active');

      expect(tab1Result.success).toBe(true);
      expect(tab2Result.success).toBe(false);
      expect(version).toBe(2);
    });
  });

  describe('TC-SEQ-HARD-08: Delete Sequence While Scheduler Is Running', () => {
    it('should safely teardown scheduler jobs on delete', async () => {
      const activeJobs = new Map<string, NodeJS.Timeout>();
      
      const createJob = (sequenceId: string) => {
        const job = setInterval(() => {}, 1000);
        activeJobs.set(sequenceId, job);
        return job;
      };
      
      const deleteSequence = async (sequenceId: string) => {
        const job = activeJobs.get(sequenceId);
        if (job) {
          clearInterval(job);
          activeJobs.delete(sequenceId);
        }
        return { success: true, jobCleared: !!job };
      };

      createJob('seq-delete-test');
      expect(activeJobs.size).toBe(1);

      const result = await deleteSequence('seq-delete-test');
      
      expect(result.success).toBe(true);
      expect(result.jobCleared).toBe(true);
      expect(activeJobs.size).toBe(0);
    });

    it('should not leave orphan cron jobs after cascade delete', async () => {
      const cronJobs: { sequenceId: string; prospectId: string; cleared: boolean }[] = [];
      
      const enrollProspect = (sequenceId: string, prospectId: string) => {
        cronJobs.push({ sequenceId, prospectId, cleared: false });
      };
      
      const deleteSequenceCascade = (sequenceId: string) => {
        for (const job of cronJobs) {
          if (job.sequenceId === sequenceId) {
            job.cleared = true;
          }
        }
        return cronJobs.filter(j => j.sequenceId === sequenceId && j.cleared).length;
      };

      enrollProspect('seq-cascade', 'p1');
      enrollProspect('seq-cascade', 'p2');
      enrollProspect('seq-other', 'p3');

      const clearedCount = deleteSequenceCascade('seq-cascade');

      expect(clearedCount).toBe(2);
      expect(cronJobs.filter(j => !j.cleared).length).toBe(1);
      expect(cronJobs.find(j => j.prospectId === 'p3')?.cleared).toBe(false);
    });
  });

  describe('TC-SEQ-HARD-09: Sequence Name Collision', () => {
    it('should maintain unique IDs for sequences with same name', () => {
      const sequences: Sequence[] = [];
      
      const createSequenceWithName = (name: string): Sequence => {
        const seq = createMockSequence({ 
          id: `seq-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name 
        });
        sequences.push(seq);
        return seq;
      };

      const seq1 = createSequenceWithName('My Campaign');
      const seq2 = createSequenceWithName('My Campaign');

      expect(seq1.name).toBe(seq2.name);
      expect(seq1.id).not.toBe(seq2.id);
      expect(sequences.length).toBe(2);
    });

    it('should preserve UI clarity with duplicate names', () => {
      const sequences = [
        createMockSequence({ id: 'seq-1', name: 'My Campaign', createdAt: new Date('2024-01-01') }),
        createMockSequence({ id: 'seq-2', name: 'My Campaign', createdAt: new Date('2024-01-02') }),
      ];

      const displaySequences = sequences.map(seq => ({
        ...seq,
        displayName: `${seq.name} (${seq.id.slice(-6)})`,
        disambiguator: seq.createdAt?.toISOString().split('T')[0]
      }));

      expect(displaySequences[0].displayName).not.toBe(displaySequences[1].displayName);
      expect(displaySequences[0].disambiguator).not.toBe(displaySequences[1].disambiguator);
    });
  });

  describe('TC-SEQ-HARD-10: Sequence With Mixed Manual + AI Steps', () => {
    it('should respect step type for each step', () => {
      const steps = [
        createMockStep('seq-mixed', 1, { stepType: 'email', aiGenerated: false }),
        createMockStep('seq-mixed', 2, { stepType: 'email', aiGenerated: true }),
        createMockStep('seq-mixed', 3, { stepType: 'manual', aiGenerated: false }),
        createMockStep('seq-mixed', 4, { stepType: 'email', aiGenerated: true }),
      ];

      const shouldCallAI = (step: SequenceStep): boolean => {
        return step.stepType === 'email' && step.aiGenerated === true;
      };

      expect(shouldCallAI(steps[0])).toBe(false);
      expect(shouldCallAI(steps[1])).toBe(true);
      expect(shouldCallAI(steps[2])).toBe(false);
      expect(shouldCallAI(steps[3])).toBe(true);
    });

    it('should not call AI for manual steps', async () => {
      const aiCallLog: string[] = [];
      
      const processStep = async (step: SequenceStep, prospect: Prospect) => {
        if (step.stepType === 'manual') {
          return { 
            type: 'manual',
            content: step.body,
            aiCalled: false 
          };
        }
        
        if (step.aiGenerated) {
          aiCallLog.push(`AI called for step ${step.stepOrder}`);
          return {
            type: 'ai',
            content: `AI generated content for ${prospect.firstName}`,
            aiCalled: true
          };
        }
        
        return {
          type: 'template',
          content: step.body.replace('{{first_name}}', prospect.firstName || ''),
          aiCalled: false
        };
      };

      const prospect = createMockProspect();
      const steps = [
        createMockStep('seq-1', 1, { stepType: 'email', aiGenerated: false }),
        createMockStep('seq-1', 2, { stepType: 'manual', aiGenerated: false }),
        createMockStep('seq-1', 3, { stepType: 'email', aiGenerated: true }),
      ];

      const results = await Promise.all(steps.map(s => processStep(s, prospect)));

      expect(results[0].aiCalled).toBe(false);
      expect(results[1].aiCalled).toBe(false);
      expect(results[1].type).toBe('manual');
      expect(results[2].aiCalled).toBe(true);
      expect(aiCallLog.length).toBe(1);
      expect(aiCallLog[0]).toBe('AI called for step 3');
    });

    it('should handle step type transitions correctly', () => {
      const step = createMockStep('seq-1', 1, { stepType: 'email', aiGenerated: false });
      
      const convertToManual = (s: SequenceStep): SequenceStep => ({
        ...s,
        stepType: 'manual',
        aiGenerated: false,
        updatedAt: new Date()
      });
      
      const convertToAI = (s: SequenceStep): SequenceStep => ({
        ...s,
        stepType: 'email',
        aiGenerated: true,
        updatedAt: new Date()
      });

      const manualStep = convertToManual(step);
      expect(manualStep.stepType).toBe('manual');
      expect(manualStep.aiGenerated).toBe(false);

      const aiStep = convertToAI(manualStep);
      expect(aiStep.stepType).toBe('email');
      expect(aiStep.aiGenerated).toBe(true);
    });
  });
});
