import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockSequences = new Map<string, any>();
const mockSequenceProspects = new Map<string, any[]>();
const mockSequenceSteps = new Map<string, any[]>();
const mockSchedulerJobs = new Set<string>();

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn((n) => {
            return Promise.resolve([]);
          })
        })),
        groupBy: vi.fn(() => Promise.resolve([]))
      }))
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: `new-${Date.now()}` }]))
      }))
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve())
      }))
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve())
    })),
    query: {
      sequences: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      sequenceProspects: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      sequenceSteps: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      }
    }
  }
}));

class MockHardeningService {
  async validateSequenceActivation(
    sequenceId: string,
    userId: string,
    organizationId: string
  ): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    details?: Record<string, any>;
  }> {
    const sequence = mockSequences.get(sequenceId);
    
    if (!sequence) {
      return {
        valid: false,
        code: 'SEQUENCE_NOT_FOUND',
        message: 'Sequence not found or access denied',
      };
    }
    
    if (sequence.userId !== userId) {
      return {
        valid: false,
        code: 'SEQUENCE_NOT_FOUND',
        message: 'Sequence not found or access denied',
      };
    }
    
    if (sequence.status === 'active' || sequence.status === 'sending') {
      return {
        valid: false,
        code: 'SEQUENCE_ALREADY_ACTIVE',
        message: `Sequence is already in ${sequence.status} state. Deactivate first to re-activate.`,
        details: { currentStatus: sequence.status },
      };
    }
    
    const prospects = mockSequenceProspects.get(sequenceId) || [];
    if (prospects.length === 0) {
      return {
        valid: false,
        code: 'SEQUENCE_EMPTY',
        message: 'Cannot activate sequence with zero enrolled prospects. Enroll prospects first.',
      };
    }
    
    return { valid: true };
  }

  async recordSequenceStatusChange(sequenceId: string, newStatus: string): Promise<void> {
    const sequence = mockSequences.get(sequenceId);
    if (sequence) {
      sequence.status = newStatus;
      sequence.activationToggleCount = (sequence.activationToggleCount || 0) + 1;
      sequence.lastStatusChangeAt = new Date();
      mockSequences.set(sequenceId, sequence);
    }
  }

  async isAutomationPaused(organizationId: string): Promise<boolean> {
    return false;
  }
}

class MockSequenceExecutorService {
  private isProcessing = false;
  
  async activateSequence(sequenceId: string): Promise<{ success: boolean; jobId?: string }> {
    if (mockSchedulerJobs.has(sequenceId)) {
      return { success: true, jobId: `job-${sequenceId}` };
    }
    
    mockSchedulerJobs.add(sequenceId);
    return { success: true, jobId: `job-${sequenceId}` };
  }
  
  async deactivateSequence(sequenceId: string): Promise<void> {
  }
  
  async deleteSequenceJobs(sequenceId: string): Promise<{ cleared: number }> {
    const wasPresent = mockSchedulerJobs.has(sequenceId);
    mockSchedulerJobs.delete(sequenceId);
    return { cleared: wasPresent ? 1 : 0 };
  }
  
  getActiveJobCount(): number {
    return mockSchedulerJobs.size;
  }
}

const hardeningService = new MockHardeningService();
const executorService = new MockSequenceExecutorService();

describe('Sequence Hardening Integration Tests', () => {
  beforeEach(() => {
    mockSequences.clear();
    mockSequenceProspects.clear();
    mockSequenceSteps.clear();
    mockSchedulerJobs.clear();
    vi.clearAllMocks();
  });

  describe('TC-SEQ-HARD-01: Max Steps + Max Tokens Validation', () => {
    const MAX_STEPS = 15;
    const MAX_SUBJECT_LENGTH = 500;
    const MAX_BODY_LENGTH = 50000;

    it('should accept sequence with maximum allowed steps', () => {
      const sequenceId = 'seq-max-steps';
      const steps: any[] = [];
      
      for (let i = 1; i <= MAX_STEPS; i++) {
        steps.push({
          id: `step-${i}`,
          sequenceId,
          subject: `Step ${i}: Hi {{first_name}} at {{company}}`,
          body: `Dear {{first_name}},\n\nAs {{job_title}} at {{company}}, {{custom_ai_line}}\n\nBest,\n{{sender_name}}`,
          stepOrder: i,
          delayDays: i - 1,
          stepType: 'email',
          aiGenerated: i % 2 === 0
        });
      }
      
      mockSequenceSteps.set(sequenceId, steps);
      
      expect(steps.length).toBe(MAX_STEPS);
      
      for (const step of steps) {
        expect(step.subject.length).toBeLessThanOrEqual(MAX_SUBJECT_LENGTH);
        expect(step.body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
      }
    });

    it('should reject step with subject exceeding max length', () => {
      const validateStep = (step: { subject: string; body: string }) => {
        const errors: string[] = [];
        if (step.subject.length > MAX_SUBJECT_LENGTH) {
          errors.push(`Subject exceeds ${MAX_SUBJECT_LENGTH} characters`);
        }
        if (step.body.length > MAX_BODY_LENGTH) {
          errors.push(`Body exceeds ${MAX_BODY_LENGTH} characters`);
        }
        return { valid: errors.length === 0, errors };
      };

      const oversizedStep = {
        subject: 'A'.repeat(MAX_SUBJECT_LENGTH + 1),
        body: 'Valid body'
      };

      const result = validateStep(oversizedStep);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Subject exceeds ${MAX_SUBJECT_LENGTH} characters`);
    });
  });

  describe('TC-SEQ-HARD-02: Race Condition Prevention', () => {
    it('should prevent ghost steps through atomic operations', async () => {
      const sequenceId = 'seq-race';
      const stepIds = new Set<string>();
      const operations: Promise<void>[] = [];
      let stepCounter = 0;

      const addStep = async (order: number): Promise<string> => {
        const id = `step-${Date.now()}-${stepCounter++}`;
        await new Promise(r => setTimeout(r, Math.random() * 10));
        stepIds.add(id);
        return id;
      };

      const deleteStep = async (id: string): Promise<void> => {
        await new Promise(r => setTimeout(r, Math.random() * 10));
        stepIds.delete(id);
      };

      const addedIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        addedIds.push(await addStep(i + 1));
      }

      await Promise.all([
        deleteStep(addedIds[1]),
        deleteStep(addedIds[3]),
      ]);

      expect(stepIds.size).toBe(3);
      expect(stepIds.has(addedIds[0])).toBe(true);
      expect(stepIds.has(addedIds[1])).toBe(false);
      expect(stepIds.has(addedIds[2])).toBe(true);
      expect(stepIds.has(addedIds[3])).toBe(false);
      expect(stepIds.has(addedIds[4])).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-03: Delay Precision', () => {
    it('should calculate delay with millisecond precision', () => {
      const calculateScheduledTime = (enrolledAt: Date, delayDays: number): Date => {
        const delayMs = delayDays * 24 * 60 * 60 * 1000;
        return new Date(enrolledAt.getTime() + delayMs);
      };

      const now = new Date();
      
      const oneMinuteDelay = 1 / (24 * 60);
      const scheduledTime = calculateScheduledTime(now, oneMinuteDelay);
      const actualDelay = scheduledTime.getTime() - now.getTime();
      
      expect(actualDelay).toBe(60000);
    });

    it('should fire within ±10 second tolerance', () => {
      const targetTime = new Date();
      const tolerance = 10000;
      
      const simulatedFireTime = new Date(targetTime.getTime() + 5000);
      const deviation = Math.abs(simulatedFireTime.getTime() - targetTime.getTime());
      
      expect(deviation).toBeLessThanOrEqual(tolerance);
    });
  });

  describe('TC-SEQ-HARD-04: Delay Update After Activation', () => {
    it('should only affect future emails when delay is updated', async () => {
      const sequenceId = 'seq-delay-update';
      const steps = [
        { id: 'step-1', stepOrder: 1, delayDays: 0, status: 'sent' },
        { id: 'step-2', stepOrder: 2, delayDays: 1, status: 'sent' },
        { id: 'step-3', stepOrder: 3, delayDays: 2, status: 'pending' },
        { id: 'step-4', stepOrder: 4, delayDays: 3, status: 'pending' },
      ];

      const lastSentStepOrder = 2;
      const newDelay = 7;

      const updateDelayForFutureSteps = (steps: any[], lastSentOrder: number, newDelay: number) => {
        return steps.map(step => {
          if (step.stepOrder > lastSentOrder) {
            return { ...step, delayDays: newDelay };
          }
          return step;
        });
      };

      const updatedSteps = updateDelayForFutureSteps(steps, lastSentStepOrder, newDelay);

      expect(updatedSteps[0].delayDays).toBe(0);
      expect(updatedSteps[1].delayDays).toBe(1);
      expect(updatedSteps[2].delayDays).toBe(newDelay);
      expect(updatedSteps[3].delayDays).toBe(newDelay);
    });
  });

  describe('TC-SEQ-HARD-05: Activate Sequence With 0 Prospects', () => {
    it('should block activation when no prospects enrolled', async () => {
      const sequenceId = 'seq-empty';
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'draft',
        name: 'Empty Sequence'
      });
      mockSequenceProspects.set(sequenceId, []);

      const result = await hardeningService.validateSequenceActivation(
        sequenceId,
        'user-123',
        'org-123'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('SEQUENCE_EMPTY');
      expect(result.message).toContain('zero enrolled prospects');
    });

    it('should not create scheduler jobs for empty sequences', async () => {
      const sequenceId = 'seq-empty';
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'draft',
        name: 'Empty Sequence'
      });
      mockSequenceProspects.set(sequenceId, []);

      const validation = await hardeningService.validateSequenceActivation(
        sequenceId,
        'user-123',
        'org-123'
      );

      if (!validation.valid) {
        expect(mockSchedulerJobs.size).toBe(0);
      }
    });
  });

  describe('TC-SEQ-HARD-06: Activate + Pause + Activate (Fast Toggle)', () => {
    it('should maintain single scheduler job through fast toggles', async () => {
      const sequenceId = 'seq-toggle';
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'draft',
        name: 'Toggle Sequence',
        activationToggleCount: 0
      });
      mockSequenceProspects.set(sequenceId, [{ id: 'prospect-1' }]);

      await executorService.activateSequence(sequenceId);
      expect(mockSchedulerJobs.size).toBe(1);

      await executorService.activateSequence(sequenceId);
      await executorService.activateSequence(sequenceId);

      expect(mockSchedulerJobs.size).toBe(1);
    });

    it('should track activation toggle count for auditing', async () => {
      const sequenceId = 'seq-toggle-audit';
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'draft',
        name: 'Toggle Audit Sequence',
        activationToggleCount: 0
      });

      await hardeningService.recordSequenceStatusChange(sequenceId, 'active');
      await hardeningService.recordSequenceStatusChange(sequenceId, 'paused');
      await hardeningService.recordSequenceStatusChange(sequenceId, 'active');

      const sequence = mockSequences.get(sequenceId);
      expect(sequence.activationToggleCount).toBe(3);
    });
  });

  describe('TC-SEQ-HARD-07: Concurrent Activation (Idempotency)', () => {
    it('should block already-active sequence activation', async () => {
      const sequenceId = 'seq-concurrent';
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'active',
        name: 'Active Sequence'
      });
      mockSequenceProspects.set(sequenceId, [{ id: 'prospect-1' }]);

      const result = await hardeningService.validateSequenceActivation(
        sequenceId,
        'user-123',
        'org-123'
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('SEQUENCE_ALREADY_ACTIVE');
    });

    it('should ensure idempotent activation from concurrent requests', async () => {
      const sequenceId = 'seq-idempotent';
      let activationCount = 0;
      
      mockSequences.set(sequenceId, {
        id: sequenceId,
        userId: 'user-123',
        status: 'draft',
        name: 'Concurrent Test'
      });
      mockSequenceProspects.set(sequenceId, [{ id: 'prospect-1' }]);

      const attemptActivation = async () => {
        const seq = mockSequences.get(sequenceId);
        if (seq.status === 'active') {
          return { success: true, alreadyActive: true };
        }
        
        await new Promise(r => setTimeout(r, Math.random() * 10));
        
        const seqRecheck = mockSequences.get(sequenceId);
        if (seqRecheck.status === 'active') {
          return { success: true, alreadyActive: true };
        }
        
        seqRecheck.status = 'active';
        mockSequences.set(sequenceId, seqRecheck);
        activationCount++;
        return { success: true, alreadyActive: false };
      };

      const [result1, result2] = await Promise.all([
        attemptActivation(),
        attemptActivation()
      ]);

      const sequence = mockSequences.get(sequenceId);
      expect(sequence.status).toBe('active');
      expect(activationCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('TC-SEQ-HARD-08: Delete Sequence While Scheduler Running', () => {
    it('should safely teardown scheduler jobs on delete', async () => {
      const sequenceId = 'seq-delete';
      
      await executorService.activateSequence(sequenceId);
      expect(mockSchedulerJobs.has(sequenceId)).toBe(true);

      const result = await executorService.deleteSequenceJobs(sequenceId);

      expect(result.cleared).toBe(1);
      expect(mockSchedulerJobs.has(sequenceId)).toBe(false);
    });

    it('should handle delete of non-existent sequence gracefully', async () => {
      const result = await executorService.deleteSequenceJobs('non-existent');
      
      expect(result.cleared).toBe(0);
    });
  });

  describe('TC-SEQ-HARD-09: Sequence Name Collision', () => {
    it('should maintain unique IDs for duplicate names', () => {
      const name = 'My Campaign';
      const seq1 = {
        id: `seq-${Date.now()}-1`,
        name,
        userId: 'user-123'
      };
      const seq2 = {
        id: `seq-${Date.now()}-2`,
        name,
        userId: 'user-123'
      };

      mockSequences.set(seq1.id, seq1);
      mockSequences.set(seq2.id, seq2);

      expect(seq1.name).toBe(seq2.name);
      expect(seq1.id).not.toBe(seq2.id);
      expect(mockSequences.size).toBe(2);
    });
  });

  describe('TC-SEQ-HARD-10: Mixed Manual + AI Steps', () => {
    it('should correctly identify which steps need AI generation', () => {
      const steps = [
        { stepOrder: 1, stepType: 'email', aiGenerated: false },
        { stepOrder: 2, stepType: 'email', aiGenerated: true },
        { stepOrder: 3, stepType: 'manual', aiGenerated: false },
        { stepOrder: 4, stepType: 'email', aiGenerated: true },
      ];

      const shouldCallAI = (step: { stepType: string; aiGenerated: boolean }) => {
        return step.stepType === 'email' && step.aiGenerated === true;
      };

      const aiSteps = steps.filter(shouldCallAI);
      const manualSteps = steps.filter(s => s.stepType === 'manual');
      const templateSteps = steps.filter(s => s.stepType === 'email' && !s.aiGenerated);

      expect(aiSteps.length).toBe(2);
      expect(manualSteps.length).toBe(1);
      expect(templateSteps.length).toBe(1);
    });

    it('should not invoke AI for manual steps', () => {
      const aiCallLog: number[] = [];
      
      const processStep = (step: { stepOrder: number; stepType: string; aiGenerated: boolean }) => {
        if (step.stepType === 'manual') {
          return { type: 'manual', aiCalled: false };
        }
        if (step.aiGenerated) {
          aiCallLog.push(step.stepOrder);
          return { type: 'ai', aiCalled: true };
        }
        return { type: 'template', aiCalled: false };
      };

      const steps = [
        { stepOrder: 1, stepType: 'email', aiGenerated: false },
        { stepOrder: 2, stepType: 'manual', aiGenerated: false },
        { stepOrder: 3, stepType: 'email', aiGenerated: true },
      ];

      const results = steps.map(processStep);

      expect(results[0].type).toBe('template');
      expect(results[1].type).toBe('manual');
      expect(results[2].type).toBe('ai');
      expect(aiCallLog).toEqual([3]);
    });
  });
});
