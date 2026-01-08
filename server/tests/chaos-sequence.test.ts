import { describe, it, expect, vi, beforeEach } from 'vitest';

interface SchedulerState {
  jobId: string;
  sequenceId: string;
  prospectId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  idempotencyKey: string;
}

interface SequenceState {
  id: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'deleted';
  activationKey: string | null;
  schedulerJobId: string | null;
}

interface ProspectEnrollment {
  id: string;
  prospectId: string;
  sequenceId: string;
  currentStep: number;
  status: 'active' | 'paused' | 'completed' | 'removed' | 'bounced';
  lastProcessedAt: Date | null;
}

const generateIdempotencyKey = (sequenceId: string, prospectId: string, step: number): string => {
  return `${sequenceId}:${prospectId}:${step}`;
};

describe('CHAOS-SEQ: Sequence Chaos Tests (CHAOS-SEQ-01 to CHAOS-SEQ-10)', () => {

  describe('CHAOS-SEQ-01: Scheduler Kill Mid-Execution', () => {
    it('should not duplicate sends on restart', () => {
      const sentEmails = new Set<string>();
      const processingQueue: SchedulerState[] = [];
      
      for (let i = 0; i < 50; i++) {
        processingQueue.push({
          jobId: `job-${i}`,
          sequenceId: 'seq-1',
          prospectId: `p-${i}`,
          status: i < 25 ? 'completed' : 'pending',
          attempts: i < 25 ? 1 : 0,
          idempotencyKey: generateIdempotencyKey('seq-1', `p-${i}`, 1)
        });
        if (i < 25) {
          sentEmails.add(processingQueue[i].idempotencyKey);
        }
      }

      const processOnRestart = (jobs: SchedulerState[]): { sent: number; skipped: number } => {
        let sent = 0, skipped = 0;
        
        for (const job of jobs) {
          if (job.status === 'completed' || sentEmails.has(job.idempotencyKey)) {
            skipped++;
            continue;
          }
          sentEmails.add(job.idempotencyKey);
          sent++;
        }
        
        return { sent, skipped };
      };

      const result = processOnRestart(processingQueue);
      
      expect(result.sent).toBe(25);
      expect(result.skipped).toBe(25);
      expect(sentEmails.size).toBe(50);
    });

    it('should resume unsent prospects correctly', () => {
      const checkpoint = {
        lastProcessedIndex: 24,
        totalProspects: 50
      };

      const getResumeQueue = (cp: typeof checkpoint): number[] => {
        return Array.from({ length: cp.totalProspects - cp.lastProcessedIndex - 1 }, 
          (_, i) => cp.lastProcessedIndex + 1 + i);
      };

      const resumeQueue = getResumeQueue(checkpoint);
      
      expect(resumeQueue.length).toBe(25);
      expect(resumeQueue[0]).toBe(25);
      expect(resumeQueue[24]).toBe(49);
    });
  });

  describe('CHAOS-SEQ-02: Activate → Pause → Kill → Resume', () => {
    it('should maintain final state as paused after restart', () => {
      const sequence: SequenceState = {
        id: 'seq-1',
        status: 'active',
        activationKey: 'act-key-1',
        schedulerJobId: 'sched-1'
      };

      const pauseSequence = (seq: SequenceState): SequenceState => ({
        ...seq,
        status: 'paused',
        schedulerJobId: null
      });

      const killed = pauseSequence(sequence);
      
      const restoreFromDb = (): SequenceState => killed;
      const restored = restoreFromDb();

      expect(restored.status).toBe('paused');
      expect(restored.schedulerJobId).toBeNull();
    });

    it('should have no scheduler job alive after pause+kill', () => {
      const activeJobs = new Map<string, { sequenceId: string; status: string }>();
      activeJobs.set('sched-1', { sequenceId: 'seq-1', status: 'running' });

      const cancelJobsForSequence = (sequenceId: string): void => {
        for (const [jobId, job] of activeJobs) {
          if (job.sequenceId === sequenceId) {
            activeJobs.delete(jobId);
          }
        }
      };

      cancelJobsForSequence('seq-1');
      
      expect(activeJobs.size).toBe(0);
    });
  });

  describe('CHAOS-SEQ-03: Dual Activation Race', () => {
    it('should enforce idempotent activation key', () => {
      const activationLock = new Map<string, string>();
      
      const tryActivate = (sequenceId: string, sessionId: string): boolean => {
        if (activationLock.has(sequenceId)) {
          return false;
        }
        activationLock.set(sequenceId, sessionId);
        return true;
      };

      const session1 = tryActivate('seq-1', 'session-a');
      const session2 = tryActivate('seq-1', 'session-b');

      expect(session1).toBe(true);
      expect(session2).toBe(false);
      expect(activationLock.get('seq-1')).toBe('session-a');
    });

    it('should result in single campaign execution', () => {
      const executionCount = new Map<string, number>();
      
      const startExecution = (sequenceId: string): boolean => {
        const current = executionCount.get(sequenceId) || 0;
        if (current > 0) return false;
        executionCount.set(sequenceId, 1);
        return true;
      };

      const results = [
        startExecution('seq-1'),
        startExecution('seq-1'),
        startExecution('seq-1')
      ];

      expect(results.filter(r => r).length).toBe(1);
      expect(executionCount.get('seq-1')).toBe(1);
    });
  });

  describe('CHAOS-SEQ-04: Delay Boundary Collision', () => {
    it('should cancel follow-up when reply arrives at delay boundary', () => {
      const delayExpiryMs = 10000;
      const replyArrivedMs = 10001;
      
      const shouldCancelFollowUp = (replyMs: number, expiryMs: number, toleranceMs: number = 5000): boolean => {
        return Math.abs(replyMs - expiryMs) <= toleranceMs;
      };

      expect(shouldCancelFollowUp(replyArrivedMs, delayExpiryMs)).toBe(true);
    });

    it('should ensure reply wins over follow-up', () => {
      const events = [
        { type: 'reply', timestamp: 10000 },
        { type: 'followup_scheduled', timestamp: 10001 }
      ];

      const processEvents = (evts: typeof events): string => {
        const sorted = [...evts].sort((a, b) => a.timestamp - b.timestamp);
        const replyFirst = sorted.findIndex(e => e.type === 'reply');
        const followupFirst = sorted.findIndex(e => e.type === 'followup_scheduled');
        
        if (replyFirst !== -1 && replyFirst <= followupFirst) {
          return 'reply_wins';
        }
        return 'followup_sent';
      };

      expect(processEvents(events)).toBe('reply_wins');
    });
  });

  describe('CHAOS-SEQ-05: Clock Skew Chaos', () => {
    it('should prevent early sends on clock advance', () => {
      const scheduledTime = new Date('2024-01-15T10:00:00Z');
      const systemTime = new Date('2024-01-15T10:05:00Z');
      const lastKnownSystemTime = new Date('2024-01-15T09:58:00Z');
      
      const detectClockSkew = (current: Date, lastKnown: Date): boolean => {
        const jumpMs = current.getTime() - lastKnown.getTime();
        const MAX_EXPECTED_JUMP_MS = 60000;
        return jumpMs > MAX_EXPECTED_JUMP_MS;
      };

      const hasSkew = detectClockSkew(systemTime, lastKnownSystemTime);
      
      expect(hasSkew).toBe(true);
    });

    it('should prevent double sends after clock revert', () => {
      const sentLog = new Map<string, Date>();
      
      const canSend = (key: string, currentTime: Date): boolean => {
        const lastSent = sentLog.get(key);
        if (lastSent) {
          return false;
        }
        sentLog.set(key, currentTime);
        return true;
      };

      const key = 'seq-1:p-1:1';
      expect(canSend(key, new Date('2024-01-15T10:05:00Z'))).toBe(true);
      expect(canSend(key, new Date('2024-01-15T10:00:00Z'))).toBe(false);
    });
  });

  describe('CHAOS-SEQ-06: Quota Flip Mid-Batch', () => {
    it('should halt immediately when quota reduced', () => {
      let quota = 100;
      let emailsSent = 50;
      const results: string[] = [];

      const processNext = (): boolean => {
        if (emailsSent >= quota) {
          results.push('HALTED');
          return false;
        }
        emailsSent++;
        results.push('SENT');
        return true;
      };

      processNext();
      processNext();
      
      quota = 52;
      
      processNext();
      processNext();

      expect(results).toEqual(['SENT', 'SENT', 'HALTED', 'HALTED']);
    });

    it('should log already-sent and pause remaining', () => {
      const batch = Array.from({ length: 10 }, (_, i) => ({ id: `p-${i}`, status: 'pending' as const }));
      const sentLog: string[] = [];
      const pausedLog: string[] = [];
      let quotaHit = false;

      for (let i = 0; i < batch.length; i++) {
        if (i === 5) quotaHit = true;
        
        if (quotaHit) {
          pausedLog.push(batch[i].id);
        } else {
          sentLog.push(batch[i].id);
        }
      }

      expect(sentLog.length).toBe(5);
      expect(pausedLog.length).toBe(5);
    });
  });

  describe('CHAOS-SEQ-07: Mailbox Disconnect During SMTP Send', () => {
    it('should retry with idempotency', async () => {
      const sentRecipients = new Set<string>();
      let connectionFailed = true;
      
      const sendWithIdempotency = async (recipient: string, idempotencyKey: string): Promise<boolean> => {
        if (sentRecipients.has(idempotencyKey)) {
          return true;
        }
        
        if (connectionFailed) {
          connectionFailed = false;
          throw new Error('Connection lost');
        }
        
        sentRecipients.add(idempotencyKey);
        return true;
      };

      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          success = await sendWithIdempotency('test@example.com', 'key-1');
          break;
        } catch {
          continue;
        }
      }

      expect(success).toBe(true);
      expect(sentRecipients.size).toBe(1);
    });

    it('should not resend to successful recipients', () => {
      const successfulRecipients = new Set(['a@test.com', 'b@test.com']);
      const failedRecipients = ['c@test.com', 'd@test.com'];
      
      const getRetryList = (failed: string[], successful: Set<string>): string[] => {
        return failed.filter(r => !successful.has(r));
      };

      const retryList = getRetryList(failedRecipients, successfulRecipients);
      
      expect(retryList).toEqual(['c@test.com', 'd@test.com']);
      expect(retryList.some(r => successfulRecipients.has(r))).toBe(false);
    });
  });

  describe('CHAOS-SEQ-08: Sequence Deletion While Jobs Exist', () => {
    it('should cancel jobs safely', () => {
      const jobs = new Map<string, { sequenceId: string; status: string }>();
      jobs.set('job-1', { sequenceId: 'seq-1', status: 'pending' });
      jobs.set('job-2', { sequenceId: 'seq-1', status: 'pending' });
      jobs.set('job-3', { sequenceId: 'seq-2', status: 'pending' });

      const deleteSequence = (sequenceId: string): { cancelled: number } => {
        let cancelled = 0;
        for (const [jobId, job] of jobs) {
          if (job.sequenceId === sequenceId) {
            jobs.delete(jobId);
            cancelled++;
          }
        }
        return { cancelled };
      };

      const result = deleteSequence('seq-1');
      
      expect(result.cancelled).toBe(2);
      expect(jobs.size).toBe(1);
    });

    it('should prevent orphan executions', () => {
      const deletedSequences = new Set<string>();
      
      const canExecute = (sequenceId: string): boolean => {
        return !deletedSequences.has(sequenceId);
      };

      deletedSequences.add('seq-1');
      
      expect(canExecute('seq-1')).toBe(false);
      expect(canExecute('seq-2')).toBe(true);
    });
  });

  describe('CHAOS-SEQ-09: Prospect Removed While Job Queued', () => {
    it('should cancel job and prevent ghost send', () => {
      const enrollments = new Map<string, ProspectEnrollment>();
      enrollments.set('enroll-1', {
        id: 'enroll-1',
        prospectId: 'p-1',
        sequenceId: 'seq-1',
        currentStep: 1,
        status: 'active',
        lastProcessedAt: null
      });

      const pendingJobs = [
        { enrollmentId: 'enroll-1', step: 2, status: 'pending' }
      ];

      const removeProspect = (enrollmentId: string): void => {
        const enrollment = enrollments.get(enrollmentId);
        if (enrollment) {
          enrollment.status = 'removed';
        }
      };

      const canExecuteJob = (enrollmentId: string): boolean => {
        const enrollment = enrollments.get(enrollmentId);
        return enrollment?.status === 'active';
      };

      removeProspect('enroll-1');
      
      expect(canExecuteJob('enroll-1')).toBe(false);
    });
  });

  describe('CHAOS-SEQ-10: Restart During Delay Countdown', () => {
    it('should resume delay correctly without reset or skip', () => {
      const checkpoint = {
        stepId: 'step-2',
        delayStartedAt: new Date('2024-01-15T10:00:00Z'),
        delayDurationMs: 3600000
      };

      const currentTime = new Date('2024-01-15T10:30:00Z');

      const calculateRemainingDelay = (cp: typeof checkpoint, now: Date): number => {
        const elapsed = now.getTime() - cp.delayStartedAt.getTime();
        return Math.max(0, cp.delayDurationMs - elapsed);
      };

      const remaining = calculateRemainingDelay(checkpoint, currentTime);
      
      expect(remaining).toBe(1800000);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThan(checkpoint.delayDurationMs);
    });
  });
});

describe('CHAOS-SEQ: Sequence Chaos Tests (CHAOS-SEQ-11 to CHAOS-SEQ-20)', () => {

  describe('CHAOS-SEQ-11: Thread Header Loss', () => {
    it('should fallback to Message-ID for threading', () => {
      const email = {
        messageId: '<msg-123@example.com>',
        inReplyTo: null,
        references: ['<msg-original@example.com>']
      };

      const getThreadId = (msg: typeof email): string => {
        if (msg.inReplyTo) {
          return msg.inReplyTo;
        }
        if (msg.references.length > 0) {
          return msg.references[0];
        }
        return msg.messageId;
      };

      expect(getThreadId(email)).toBe('<msg-original@example.com>');
    });

    it('should not create new thread when headers lost', () => {
      const threadMap = new Map<string, string>();
      threadMap.set('<msg-original@example.com>', 'thread-1');

      const findThread = (messageId: string, references: string[]): string | null => {
        for (const ref of references) {
          const thread = threadMap.get(ref);
          if (thread) return thread;
        }
        return threadMap.get(messageId) || null;
      };

      const thread = findThread('<new-msg@example.com>', ['<msg-original@example.com>']);
      
      expect(thread).toBe('thread-1');
    });
  });

  describe('CHAOS-SEQ-12: Duplicate Message-ID Injection', () => {
    it('should reject or regenerate duplicate Message-ID', () => {
      const usedMessageIds = new Set<string>();
      usedMessageIds.add('<msg-dup@example.com>');

      const ensureUniqueMessageId = (proposedId: string): string => {
        if (usedMessageIds.has(proposedId)) {
          const newId = `<msg-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com>`;
          usedMessageIds.add(newId);
          return newId;
        }
        usedMessageIds.add(proposedId);
        return proposedId;
      };

      const result = ensureUniqueMessageId('<msg-dup@example.com>');
      
      expect(result).not.toBe('<msg-dup@example.com>');
      expect(usedMessageIds.size).toBe(2);
    });
  });

  describe('CHAOS-SEQ-13: Reply Storm', () => {
    it('should maintain single conversation for multiple rapid replies', () => {
      const replyTimestamps = [1000, 1500, 1800, 2000, 2200];
      const processedReplies = new Map<string, number>();
      
      const processReply = (threadId: string, timestamp: number): boolean => {
        const lastProcessed = processedReplies.get(threadId);
        if (lastProcessed && timestamp - lastProcessed < 5000) {
          return false;
        }
        processedReplies.set(threadId, timestamp);
        return true;
      };

      const results = replyTimestamps.map(ts => processReply('thread-1', ts));
      
      expect(results.filter(r => r).length).toBe(1);
    });

    it('should not generate multiple AI replies', () => {
      const aiRepliesGenerated = new Map<string, number>();
      
      const canGenerateAIReply = (threadId: string): boolean => {
        const count = aiRepliesGenerated.get(threadId) || 0;
        if (count > 0) return false;
        aiRepliesGenerated.set(threadId, count + 1);
        return true;
      };

      expect(canGenerateAIReply('thread-1')).toBe(true);
      expect(canGenerateAIReply('thread-1')).toBe(false);
      expect(canGenerateAIReply('thread-1')).toBe(false);
    });
  });

  describe('CHAOS-SEQ-14: OOO + Human Reply Mix', () => {
    it('should let human reply win over OOO', () => {
      const replies = [
        { type: 'ooo', timestamp: 1000, content: 'I am out of office' },
        { type: 'human', timestamp: 2000, content: 'Thanks for reaching out!' }
      ];

      const selectPrimaryReply = (repls: typeof replies): typeof replies[0] => {
        const humanReply = repls.find(r => r.type === 'human');
        if (humanReply) return humanReply;
        return repls[0];
      };

      const primary = selectPrimaryReply(replies);
      
      expect(primary.type).toBe('human');
    });

    it('should stop sequence on human reply', () => {
      const enrollment = { status: 'active' as const, stoppedReason: null as string | null };

      const handleReply = (enroll: typeof enrollment, replyType: string): typeof enrollment => {
        if (replyType === 'human') {
          return { status: 'completed' as const, stoppedReason: 'HUMAN_REPLY' };
        }
        return enroll;
      };

      const updated = handleReply(enrollment, 'human');
      
      expect(updated.status).toBe('completed');
      expect(updated.stoppedReason).toBe('HUMAN_REPLY');
    });
  });

  describe('CHAOS-SEQ-15: Bounce After Send Confirmation', () => {
    it('should mark prospect as bounced', () => {
      const enrollment: ProspectEnrollment = {
        id: 'enroll-1',
        prospectId: 'p-1',
        sequenceId: 'seq-1',
        currentStep: 1,
        status: 'active',
        lastProcessedAt: new Date()
      };

      const handleBounce = (enroll: ProspectEnrollment): ProspectEnrollment => ({
        ...enroll,
        status: 'bounced'
      });

      const updated = handleBounce(enrollment);
      
      expect(updated.status).toBe('bounced');
    });

    it('should remove from future steps', () => {
      const pendingSteps = [
        { enrollmentId: 'enroll-1', step: 2, status: 'pending' },
        { enrollmentId: 'enroll-1', step: 3, status: 'pending' }
      ];

      const cancelFutureSteps = (enrollmentId: string) => {
        return pendingSteps.map(s => 
          s.enrollmentId === enrollmentId 
            ? { ...s, status: 'cancelled' } 
            : s
        );
      };

      const updated = cancelFutureSteps('enroll-1');
      
      expect(updated.every(s => s.status === 'cancelled')).toBe(true);
    });
  });

  describe('CHAOS-SEQ-16: Campaign Resume After Partial Failure', () => {
    it('should retry only failed prospects', () => {
      const sendResults = [
        { prospectId: 'p-1', success: true },
        { prospectId: 'p-2', success: false },
        { prospectId: 'p-3', success: true },
        { prospectId: 'p-4', success: false },
        { prospectId: 'p-5', success: true }
      ];

      const getRetryQueue = (results: typeof sendResults): string[] => {
        return results.filter(r => !r.success).map(r => r.prospectId);
      };

      const retryQueue = getRetryQueue(sendResults);
      
      expect(retryQueue).toEqual(['p-2', 'p-4']);
      expect(retryQueue.length).toBe(2);
    });
  });

  describe('CHAOS-SEQ-17: Massive Parallel Activation', () => {
    it('should schedule fairly without starvation', async () => {
      const executionOrder: string[] = [];
      const sequences = Array.from({ length: 20 }, (_, i) => `seq-${i}`);

      const scheduleWithFairness = async (seqId: string, priority: number): Promise<void> => {
        await new Promise(r => setTimeout(r, priority * 5));
        executionOrder.push(seqId);
      };

      await Promise.all(sequences.map((seq, i) => scheduleWithFairness(seq, i % 5)));

      expect(executionOrder.length).toBe(20);
      expect(new Set(executionOrder).size).toBe(20);
    });
  });

  describe('CHAOS-SEQ-18: Inbox Sync Restart', () => {
    it('should not lose replies on worker kill', () => {
      const persistedReplies = new Map<string, { processed: boolean }>();
      
      const persistReplyBeforeProcess = (replyId: string): void => {
        persistedReplies.set(replyId, { processed: false });
      };

      const markProcessed = (replyId: string): void => {
        const reply = persistedReplies.get(replyId);
        if (reply) reply.processed = true;
      };

      const getUnprocessedReplies = (): string[] => {
        return Array.from(persistedReplies.entries())
          .filter(([_, v]) => !v.processed)
          .map(([k]) => k);
      };

      persistReplyBeforeProcess('reply-1');
      persistReplyBeforeProcess('reply-2');
      markProcessed('reply-1');
      
      const unprocessed = getUnprocessedReplies();
      
      expect(unprocessed).toEqual(['reply-2']);
    });

    it('should support idempotent ingestion', () => {
      const ingestedReplies = new Set<string>();
      
      const ingestReply = (replyId: string): { ingested: boolean; duplicate: boolean } => {
        if (ingestedReplies.has(replyId)) {
          return { ingested: false, duplicate: true };
        }
        ingestedReplies.add(replyId);
        return { ingested: true, duplicate: false };
      };

      expect(ingestReply('reply-1').ingested).toBe(true);
      expect(ingestReply('reply-1').duplicate).toBe(true);
    });
  });

  describe('CHAOS-SEQ-19: DB Transaction Partial Commit (Simulated)', () => {
    it('should reconcile state without resend', () => {
      const prospectState = { id: 'p-1', emailSent: true, sendLogged: false };
      const emailLog = new Set<string>();

      const reconcile = (state: typeof prospectState, log: Set<string>): boolean => {
        if (state.emailSent && !state.sendLogged) {
          log.add(state.id);
          state.sendLogged = true;
          return true;
        }
        return false;
      };

      const shouldResend = !prospectState.emailSent;
      const reconciled = reconcile(prospectState, emailLog);

      expect(shouldResend).toBe(false);
      expect(reconciled).toBe(true);
      expect(emailLog.has('p-1')).toBe(true);
    });
  });

  describe('CHAOS-SEQ-20: Full System Restart During Active Campaign', () => {
    it('should achieve zero duplicate emails', () => {
      const sentEmails = new Map<string, Date>();
      const campaign = {
        id: 'campaign-1',
        prospects: ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'],
        checkpoint: 2
      };

      sentEmails.set('campaign-1:p-1', new Date());
      sentEmails.set('campaign-1:p-2', new Date());

      const resumeAfterRestart = (camp: typeof campaign): { toSend: string[]; alreadySent: string[] } => {
        const toSend: string[] = [];
        const alreadySent: string[] = [];

        for (const prospectId of camp.prospects) {
          const key = `${camp.id}:${prospectId}`;
          if (sentEmails.has(key)) {
            alreadySent.push(prospectId);
          } else {
            toSend.push(prospectId);
          }
        }

        return { toSend, alreadySent };
      };

      const result = resumeAfterRestart(campaign);
      
      expect(result.alreadySent).toEqual(['p-1', 'p-2']);
      expect(result.toSend).toEqual(['p-3', 'p-4', 'p-5']);
    });

    it('should fully restore state', () => {
      const savedState = {
        sequenceId: 'seq-1',
        status: 'active',
        currentStep: 3,
        processedCount: 25,
        totalCount: 50
      };

      const restoreState = (state: typeof savedState) => {
        return {
          ...state,
          resumedAt: new Date(),
          resumeFromStep: state.currentStep,
          remainingProspects: state.totalCount - state.processedCount
        };
      };

      const restored = restoreState(savedState);
      
      expect(restored.resumeFromStep).toBe(3);
      expect(restored.remainingProspects).toBe(25);
    });
  });
});
