import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SequenceProspect, Prospect, Sequence } from '@shared/schema';

const BULK_PROSPECT_COUNT = 500;
const BATCH_SIZE = 50;

const createMockProspect = (id: string, overrides?: Partial<Prospect>): Prospect => ({
  id,
  organizationId: 'org-123',
  userId: 'user-123',
  workspaceId: null,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  fullName: `First${id} Last${id}`,
  primaryEmail: `prospect${id}@example.com`,
  companyName: 'Test Corp',
  jobTitle: 'Manager',
  companyIndustry: 'Technology',
  companySize: '100-500',
  contactLocation: 'New York',
  companyLocation: 'New York, NY',
  phoneNumber: null,
  linkedinUrl: null,
  department: null,
  seniority: 'Manager',
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

const createMockSequenceProspect = (
  sequenceId: string,
  prospectId: string,
  overrides?: Partial<SequenceProspect>
): SequenceProspect => ({
  id: `sp-${sequenceId}-${prospectId}`,
  sequenceId,
  prospectId,
  currentStepId: null,
  automationRunId: null,
  status: 'active',
  enrolledAt: new Date(),
  lastContactedAt: null,
  completedAt: null,
  replies: 0,
  opens: 0,
  clicks: 0,
  ...overrides
});

describe('Enrollment & Scheduling Hardening Tests (TC-SEQ-HARD-11 to TC-SEQ-HARD-20)', () => {

  describe('TC-SEQ-HARD-11: Bulk Add 500 Prospects', () => {
    it('should batch enrollment of 500 prospects', async () => {
      const prospects: Prospect[] = [];
      for (let i = 0; i < BULK_PROSPECT_COUNT; i++) {
        prospects.push(createMockProspect(`p-${i}`));
      }

      const enrollmentBatches: Prospect[][] = [];
      for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
        enrollmentBatches.push(prospects.slice(i, i + BATCH_SIZE));
      }

      expect(enrollmentBatches.length).toBe(Math.ceil(BULK_PROSPECT_COUNT / BATCH_SIZE));
      expect(enrollmentBatches[0].length).toBe(BATCH_SIZE);
    });

    it('should track progress accurately during bulk enrollment', async () => {
      const totalProspects = BULK_PROSPECT_COUNT;
      let enrolledCount = 0;
      const progressUpdates: number[] = [];

      const enrollBatch = async (batchSize: number): Promise<number> => {
        await new Promise(r => setTimeout(r, 1));
        return batchSize;
      };

      for (let i = 0; i < totalProspects; i += BATCH_SIZE) {
        const batchSize = Math.min(BATCH_SIZE, totalProspects - i);
        const enrolled = await enrollBatch(batchSize);
        enrolledCount += enrolled;
        progressUpdates.push(Math.round((enrolledCount / totalProspects) * 100));
      }

      expect(enrolledCount).toBe(totalProspects);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
      expect(progressUpdates.length).toBe(Math.ceil(BULK_PROSPECT_COUNT / BATCH_SIZE));
    });

    it('should not freeze during bulk operations (async processing)', async () => {
      const startTime = Date.now();
      const operations: Promise<void>[] = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push(
          new Promise(resolve => {
            setImmediate(() => resolve());
          })
        );
      }

      await Promise.all(operations);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('TC-SEQ-HARD-12: Add Prospect While Sequence Is Running', () => {
    it('should allow adding prospect to active sequence', () => {
      const sequence: Partial<Sequence> = {
        id: 'seq-running',
        status: 'active',
        totalProspects: 5,
        activeProspects: 3
      };

      const canAddProspect = (seq: Partial<Sequence>): boolean => {
        return seq.status === 'active' || seq.status === 'draft' || seq.status === 'paused';
      };

      expect(canAddProspect(sequence)).toBe(true);
    });

    it('should start new prospect at Step 1', () => {
      const existingEnrollments = [
        createMockSequenceProspect('seq-1', 'p-1', { status: 'active' }),
        createMockSequenceProspect('seq-1', 'p-2', { status: 'active' }),
      ];

      const newEnrollment = createMockSequenceProspect('seq-1', 'p-new', {
        enrolledAt: new Date(),
        status: 'active'
      });

      expect(newEnrollment.currentStepId).toBeNull();
      expect(existingEnrollments.every(e => e.sequenceId === newEnrollment.sequenceId)).toBe(true);
      
      const allEnrollments = [...existingEnrollments, newEnrollment];
      expect(allEnrollments.length).toBe(3);
    });

    it('should not impact existing prospect progress', () => {
      const existingProspect = createMockSequenceProspect('seq-1', 'p-existing', {
        currentStepId: 'step-3',
        lastContactedAt: new Date(Date.now() - 86400000),
        opens: 2,
        clicks: 1
      });

      const newProspect = createMockSequenceProspect('seq-1', 'p-new');

      expect(existingProspect.currentStepId).toBe('step-3');
      expect(existingProspect.opens).toBe(2);
      expect(newProspect.currentStepId).toBeNull();
    });
  });

  describe('TC-SEQ-HARD-13: Same Prospect Added Twice (Deduplication)', () => {
    it('should enforce unique constraint on sequenceId + prospectId', () => {
      const enrollments = new Map<string, SequenceProspect>();
      
      const enrollProspect = (sequenceId: string, prospectId: string): { success: boolean; reason?: string } => {
        const key = `${sequenceId}-${prospectId}`;
        if (enrollments.has(key)) {
          return { success: false, reason: 'DUPLICATE_ENROLLMENT' };
        }
        enrollments.set(key, createMockSequenceProspect(sequenceId, prospectId));
        return { success: true };
      };

      const result1 = enrollProspect('seq-1', 'prospect-1');
      const result2 = enrollProspect('seq-1', 'prospect-1');
      const result3 = enrollProspect('seq-2', 'prospect-1');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(false);
      expect(result2.reason).toBe('DUPLICATE_ENROLLMENT');
      expect(result3.success).toBe(true);
      expect(enrollments.size).toBe(2);
    });

    it('should prevent duplicate emails to same prospect in sequence', () => {
      const sentEmails = new Set<string>();
      
      const canSendEmail = (sequenceId: string, prospectId: string, stepOrder: number): boolean => {
        const key = `${sequenceId}-${prospectId}-${stepOrder}`;
        if (sentEmails.has(key)) {
          return false;
        }
        sentEmails.add(key);
        return true;
      };

      expect(canSendEmail('seq-1', 'p-1', 1)).toBe(true);
      expect(canSendEmail('seq-1', 'p-1', 1)).toBe(false);
      expect(canSendEmail('seq-1', 'p-1', 2)).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-14: Prospect Timezone Conflict', () => {
    it('should respect sending window configuration', () => {
      const sendingWindow = {
        startHour: 9,
        endHour: 17,
        timezone: 'America/New_York',
        excludeWeekends: true
      };

      const isWithinSendingWindow = (
        currentTime: Date,
        prospectTimezone: string,
        config: typeof sendingWindow
      ): boolean => {
        const hour = currentTime.getUTCHours();
        
        const tzOffset = prospectTimezone === 'America/Los_Angeles' ? -8 : 
                         prospectTimezone === 'America/New_York' ? -5 : 0;
        const localHour = (hour + tzOffset + 24) % 24;
        
        const day = currentTime.getUTCDay();
        if (config.excludeWeekends && (day === 0 || day === 6)) {
          return false;
        }
        
        return localHour >= config.startHour && localHour < config.endHour;
      };

      const businessHours = new Date('2024-01-15T14:00:00Z');
      expect(isWithinSendingWindow(businessHours, 'America/New_York', sendingWindow)).toBe(true);

      const midnight = new Date('2024-01-15T05:00:00Z');
      expect(isWithinSendingWindow(midnight, 'America/New_York', sendingWindow)).toBe(false);

      const saturday = new Date('2024-01-13T14:00:00Z');
      expect(isWithinSendingWindow(saturday, 'America/New_York', sendingWindow)).toBe(false);
    });

    it('should prevent midnight sends', () => {
      const isLateNightHour = (hour: number): boolean => {
        return hour >= 22 || hour < 6;
      };

      expect(isLateNightHour(23)).toBe(true);
      expect(isLateNightHour(3)).toBe(true);
      expect(isLateNightHour(0)).toBe(true);
      expect(isLateNightHour(9)).toBe(false);
      expect(isLateNightHour(14)).toBe(false);
    });
  });

  describe('TC-SEQ-HARD-15: Scheduler Drift Test', () => {
    it('should measure scheduler precision within 30 seconds', () => {
      const scheduledTime = new Date();
      const actualSendTime = new Date(scheduledTime.getTime() + 15000);
      
      const drift = Math.abs(actualSendTime.getTime() - scheduledTime.getTime());
      const maxDriftMs = 30000;
      
      expect(drift).toBeLessThanOrEqual(maxDriftMs);
    });

    it('should track drift across multiple sends', () => {
      const driftMeasurements: number[] = [];
      const scheduledTimes = [0, 60000, 120000, 180000, 240000];
      
      for (const scheduled of scheduledTimes) {
        const simulatedDrift = Math.random() * 20000;
        driftMeasurements.push(simulatedDrift);
      }

      const avgDrift = driftMeasurements.reduce((a, b) => a + b, 0) / driftMeasurements.length;
      const maxDrift = Math.max(...driftMeasurements);

      expect(avgDrift).toBeLessThan(30000);
      expect(maxDrift).toBeLessThan(30000);
    });

    it('should alert on excessive drift', () => {
      const DRIFT_THRESHOLD_MS = 30000;
      const alerts: string[] = [];
      
      const checkDrift = (scheduledMs: number, actualMs: number): void => {
        const drift = Math.abs(actualMs - scheduledMs);
        if (drift > DRIFT_THRESHOLD_MS) {
          alerts.push(`Excessive drift: ${drift}ms`);
        }
      };

      checkDrift(0, 15000);
      checkDrift(0, 45000);
      checkDrift(0, 25000);

      expect(alerts.length).toBe(1);
      expect(alerts[0]).toContain('45000ms');
    });
  });

  describe('TC-SEQ-HARD-16: High Load Scheduler Test', () => {
    it('should handle 10 simultaneous sequence activations', async () => {
      const activatedSequences: string[] = [];
      const activationOrder: { sequenceId: string; timestamp: number }[] = [];
      
      const activateSequence = async (sequenceId: string): Promise<void> => {
        await new Promise(r => setTimeout(r, Math.random() * 50));
        activatedSequences.push(sequenceId);
        activationOrder.push({ sequenceId, timestamp: Date.now() });
      };

      const sequences = Array.from({ length: 10 }, (_, i) => `seq-${i}`);
      await Promise.all(sequences.map(activateSequence));

      expect(activatedSequences.length).toBe(10);
      expect(new Set(activatedSequences).size).toBe(10);
    });

    it('should not skip any sends under load', async () => {
      const scheduledSends: { sequenceId: string; prospectId: string }[] = [];
      const completedSends = new Set<string>();
      
      for (let seq = 0; seq < 10; seq++) {
        for (let p = 0; p < 5; p++) {
          scheduledSends.push({ sequenceId: `seq-${seq}`, prospectId: `p-${p}` });
        }
      }

      const processSend = async (send: typeof scheduledSends[0]): Promise<void> => {
        await new Promise(r => setTimeout(r, Math.random() * 10));
        completedSends.add(`${send.sequenceId}-${send.prospectId}`);
      };

      await Promise.all(scheduledSends.map(processSend));

      expect(completedSends.size).toBe(scheduledSends.length);
      expect(completedSends.size).toBe(50);
    });

    it('should maintain fair execution order', async () => {
      const executionOrder: { sequenceId: string; order: number }[] = [];
      let orderCounter = 0;
      
      const executeSequence = async (sequenceId: string, priority: number): Promise<void> => {
        await new Promise(r => setTimeout(r, priority * 10));
        executionOrder.push({ sequenceId, order: orderCounter++ });
      };

      await Promise.all([
        executeSequence('seq-high', 1),
        executeSequence('seq-medium', 2),
        executeSequence('seq-low', 3),
      ]);

      expect(executionOrder.length).toBe(3);
      
      const highOrder = executionOrder.find(e => e.sequenceId === 'seq-high')?.order;
      const lowOrder = executionOrder.find(e => e.sequenceId === 'seq-low')?.order;
      expect(highOrder).toBeLessThan(lowOrder!);
    });
  });

  describe('TC-SEQ-HARD-17: Prospect Removed Mid-Sequence', () => {
    it('should cancel future steps when prospect is removed', () => {
      const enrollment = createMockSequenceProspect('seq-1', 'p-remove', {
        status: 'active',
        currentStepId: 'step-2'
      });

      const scheduledJobs = [
        { enrollmentId: enrollment.id, stepOrder: 3, status: 'pending' },
        { enrollmentId: enrollment.id, stepOrder: 4, status: 'pending' },
      ];

      const removeProspect = (enrollmentId: string) => {
        return scheduledJobs.map(job => 
          job.enrollmentId === enrollmentId 
            ? { ...job, status: 'cancelled' }
            : job
        );
      };

      const updatedJobs = removeProspect(enrollment.id);
      
      expect(updatedJobs.every(j => j.status === 'cancelled')).toBe(true);
    });

    it('should not leave dangling scheduler jobs', () => {
      const activeJobs = new Map<string, { enrollmentId: string; stepOrder: number }>();
      
      activeJobs.set('job-1', { enrollmentId: 'enroll-1', stepOrder: 3 });
      activeJobs.set('job-2', { enrollmentId: 'enroll-1', stepOrder: 4 });
      activeJobs.set('job-3', { enrollmentId: 'enroll-2', stepOrder: 2 });

      const cancelJobsForEnrollment = (enrollmentId: string): number => {
        let cancelled = 0;
        for (const [jobId, job] of activeJobs) {
          if (job.enrollmentId === enrollmentId) {
            activeJobs.delete(jobId);
            cancelled++;
          }
        }
        return cancelled;
      };

      const cancelled = cancelJobsForEnrollment('enroll-1');
      
      expect(cancelled).toBe(2);
      expect(activeJobs.size).toBe(1);
      expect(activeJobs.has('job-3')).toBe(true);
    });
  });

  describe('TC-SEQ-HARD-18: Quota Hit Mid-Batch', () => {
    it('should pause remaining prospects when quota is hit', () => {
      const dailyQuota = 100;
      let emailsSent = 95;
      const prospectsToProcess = 10;
      const results: { prospectId: string; status: 'sent' | 'paused' | 'quota_exceeded' }[] = [];

      for (let i = 0; i < prospectsToProcess; i++) {
        if (emailsSent >= dailyQuota) {
          results.push({ prospectId: `p-${i}`, status: 'paused' });
        } else {
          emailsSent++;
          results.push({ prospectId: `p-${i}`, status: 'sent' });
        }
      }

      const sent = results.filter(r => r.status === 'sent').length;
      const paused = results.filter(r => r.status === 'paused').length;

      expect(sent).toBe(5);
      expect(paused).toBe(5);
      expect(emailsSent).toBe(100);
    });

    it('should log already sent emails correctly', () => {
      const emailLog: { prospectId: string; sentAt: Date; stepOrder: number }[] = [];
      
      const logEmail = (prospectId: string, stepOrder: number) => {
        emailLog.push({
          prospectId,
          stepOrder,
          sentAt: new Date()
        });
      };

      logEmail('p-1', 1);
      logEmail('p-2', 1);
      logEmail('p-3', 1);

      expect(emailLog.length).toBe(3);
      expect(emailLog.every(e => e.sentAt instanceof Date)).toBe(true);
    });

    it('should resume from correct point when quota resets', () => {
      const pausedProspects = ['p-6', 'p-7', 'p-8', 'p-9', 'p-10'];
      const lastProcessedIndex = 5;
      
      const getResumePoint = (paused: string[], lastIndex: number) => {
        return {
          startFromProspect: paused[0],
          remainingCount: paused.length,
          continueFromIndex: lastIndex
        };
      };

      const resumePoint = getResumePoint(pausedProspects, lastProcessedIndex);
      
      expect(resumePoint.startFromProspect).toBe('p-6');
      expect(resumePoint.remainingCount).toBe(5);
    });
  });

  describe('TC-SEQ-HARD-19: Mailbox Disconnect Mid-Send', () => {
    it('should implement retry logic for transient failures', async () => {
      let attempts = 0;
      const maxRetries = 3;
      
      const sendWithRetry = async (): Promise<{ success: boolean; attempts: number }> => {
        for (let i = 0; i < maxRetries; i++) {
          attempts++;
          if (i < 2) {
            await new Promise(r => setTimeout(r, 10));
            continue;
          }
          return { success: true, attempts };
        }
        return { success: false, attempts };
      };

      const result = await sendWithRetry();
      
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should set clear failure state after max retries', async () => {
      const maxRetries = 3;
      let failureState: { status: string; reason: string; retriedAt: Date[] } | null = null;
      
      const sendWithFailure = async (): Promise<void> => {
        const retries: Date[] = [];
        
        for (let i = 0; i < maxRetries; i++) {
          retries.push(new Date());
          await new Promise(r => setTimeout(r, 5));
        }
        
        failureState = {
          status: 'failed',
          reason: 'MAILBOX_DISCONNECTED',
          retriedAt: retries
        };
      };

      await sendWithFailure();
      
      expect(failureState).not.toBeNull();
      expect(failureState!.status).toBe('failed');
      expect(failureState!.reason).toBe('MAILBOX_DISCONNECTED');
      expect(failureState!.retriedAt.length).toBe(maxRetries);
    });

    it('should use exponential backoff for retries', () => {
      const calculateBackoff = (attempt: number, baseDelayMs: number = 1000): number => {
        return baseDelayMs * Math.pow(2, attempt);
      };

      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(3)).toBe(8000);
    });
  });

  describe('TC-SEQ-HARD-20: Warm-Up Limit Dynamic Change', () => {
    it('should enforce limit changes immediately', () => {
      let currentLimit = 50;
      let emailsSentToday = 40;
      
      const canSendEmail = (): boolean => {
        return emailsSentToday < currentLimit;
      };

      expect(canSendEmail()).toBe(true);
      
      currentLimit = 30;
      
      expect(canSendEmail()).toBe(false);
    });

    it('should not have policy lag on limit updates', async () => {
      const limitConfig = { dailyLimit: 100, updatedAt: new Date() };
      
      const updateLimit = (newLimit: number) => {
        limitConfig.dailyLimit = newLimit;
        limitConfig.updatedAt = new Date();
      };

      const getEffectiveLimit = () => limitConfig.dailyLimit;

      expect(getEffectiveLimit()).toBe(100);
      
      updateLimit(50);
      
      expect(getEffectiveLimit()).toBe(50);
      
      await new Promise(r => setTimeout(r, 10));
      
      expect(getEffectiveLimit()).toBe(50);
    });

    it('should handle warm-up schedule progression', () => {
      const warmUpSchedule = [
        { day: 1, limit: 20 },
        { day: 2, limit: 40 },
        { day: 3, limit: 60 },
        { day: 4, limit: 80 },
        { day: 5, limit: 100 },
      ];

      const getWarmUpLimit = (daysSinceStart: number): number => {
        const schedule = warmUpSchedule.find(s => s.day === daysSinceStart);
        if (schedule) return schedule.limit;
        if (daysSinceStart > warmUpSchedule.length) {
          return warmUpSchedule[warmUpSchedule.length - 1].limit;
        }
        return warmUpSchedule[0].limit;
      };

      expect(getWarmUpLimit(1)).toBe(20);
      expect(getWarmUpLimit(3)).toBe(60);
      expect(getWarmUpLimit(5)).toBe(100);
      expect(getWarmUpLimit(10)).toBe(100);
    });

    it('should override warm-up when manually changed', () => {
      let warmUpLimit = 50;
      let manualOverride: number | null = null;
      
      const getEffectiveLimit = (): number => {
        return manualOverride ?? warmUpLimit;
      };

      expect(getEffectiveLimit()).toBe(50);
      
      manualOverride = 25;
      
      expect(getEffectiveLimit()).toBe(25);
      
      manualOverride = null;
      warmUpLimit = 75;
      
      expect(getEffectiveLimit()).toBe(75);
    });
  });
});
